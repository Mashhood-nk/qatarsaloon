// Platform admin API: add and manage shops, and open any shop's admin.
import { Hono } from "hono";
import type { AppEnv } from "../env";
import type { PlatformShopDto } from "../../shared/types";
import { hashPassword, requirePlatform } from "../lib/auth";
import { seedBarberSchedule } from "../lib/data";
import { HttpError, bad, bool, int, notFound, readJson, str } from "../lib/util";
import { isDateString } from "../../shared/time";
import { checkPassword, checkUsername } from "./admin";

export const platformRoutes = new Hono<AppEnv>();
platformRoutes.use("*", requirePlatform);

// Paths the app itself uses, so they can't be a shop's link.
const RESERVED = new Set(["admin", "platform", "api", "b", "assets", "login", "www", "app", "help", "about", "terms", "privacy", "favicon.svg"]);

function checkSlug(raw: unknown): string {
  const slug = str(raw, "Link", 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) throw bad("Link: 3–40 lowercase letters, numbers or dashes (e.g. fade-house)");
  if (RESERVED.has(slug)) throw bad("That link is reserved. Pick another.");
  return slug;
}

const STARTER_SERVICES: [string, number, number][] = [
  ["Haircut", 30, 20],
  ["Beard styling", 30, 20],
];

async function listShops(db: D1Database): Promise<PlatformShopDto[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.slug, s.name, s.area, s.active, s.plan, s.plan_expires_at, s.notes, s.created_at,
         u.id AS owner_id, u.username AS owner_username, u.name AS owner_name,
         (SELECT COUNT(*) FROM barbers b WHERE b.shop_id = s.id AND b.active = 1) AS barbers,
         (SELECT COUNT(*) FROM bookings k WHERE k.shop_id = s.id AND k.created_at >= datetime('now', '-30 days')) AS bookings_30d,
         (SELECT COUNT(*) FROM customers c WHERE c.shop_id = s.id AND c.is_guest = 0) AS customers
       FROM shops s
       LEFT JOIN users u ON u.id = (SELECT id FROM users WHERE shop_id = s.id AND role = 'owner' ORDER BY id LIMIT 1)
       ORDER BY s.created_at DESC`
    )
    .all<any>();
  return results.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    area: r.area,
    active: !!r.active,
    plan: r.plan,
    plan_expires_at: r.plan_expires_at,
    notes: r.notes,
    created_at: r.created_at,
    owner: r.owner_id ? { id: r.owner_id, username: r.owner_username, name: r.owner_name } : null,
    barbers: r.barbers,
    bookings_30d: r.bookings_30d,
    customers: r.customers,
  }));
}

platformRoutes.get("/shops", async (c) => c.json(await listShops(c.env.DB)));

platformRoutes.post("/shops", async (c) => {
  const db = c.env.DB;
  const body = await readJson(c.req.raw);
  const name = str(body.name, "Shop name", 80);
  const slug = checkSlug(body.slug);
  const area = str(body.area, "Area", 60, { required: false });
  const ownerName = str(body.owner_name, "Owner's name", 60);
  const username = checkUsername(body.username);
  const password = checkPassword(body.password);
  const ownerCuts = body.owner_cuts === undefined ? true : bool(body.owner_cuts);
  const barberName = ownerCuts ? ownerName : str(body.barber_name, "First barber's name", 60);

  if (await db.prepare("SELECT 1 FROM shops WHERE slug = ?").bind(slug).first()) throw new HttpError(409, "That link is already used by another shop");
  if (await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first()) throw new HttpError(409, "That username is taken");

  const shop = await db
    .prepare("INSERT INTO shops (slug, name, area, tagline, about) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(slug, name, area, "", `Choose your services and a time that suits you. ${name} confirms every booking on WhatsApp.`)
    .first<{ id: number }>();
  const shopId = shop!.id;
  const barber = await db
    .prepare("INSERT INTO barbers (shop_id, name, sort) VALUES (?, ?, 0) RETURNING id")
    .bind(shopId, barberName)
    .first<{ id: number }>();
  await seedBarberSchedule(db, shopId, barber!.id, null);
  await db.batch([
    ...STARTER_SERVICES.map(([n, d, p], i) =>
      db.prepare("INSERT INTO services (shop_id, name, duration_min, price, sort) VALUES (?, ?, ?, ?, ?)").bind(shopId, n, d, p, i + 1)
    ),
    db
      .prepare("INSERT INTO users (shop_id, barber_id, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?, 'owner')")
      .bind(shopId, ownerCuts ? barber!.id : null, username, ownerName, await hashPassword(password)),
  ]);
  return c.json(await listShops(db), 201);
});

platformRoutes.put("/shops/:id", async (c) => {
  const db = c.env.DB;
  const id = int(c.req.param("id"), "id", 1);
  const body = await readJson(c.req.raw);
  const current = await db.prepare("SELECT slug FROM shops WHERE id = ?").bind(id).first<{ slug: string }>();
  if (!current) throw notFound("Shop not found");
  const slug = checkSlug(body.slug ?? current.slug);
  if (slug !== current.slug && (await db.prepare("SELECT 1 FROM shops WHERE slug = ?").bind(slug).first())) {
    throw new HttpError(409, "That link is already used by another shop");
  }
  const expires = str(body.plan_expires_at, "Plan end date", 10, { required: false });
  if (expires && !isDateString(expires)) throw bad("Pick a valid plan end date");
  await db
    .prepare("UPDATE shops SET name = ?, slug = ?, area = ?, active = ?, plan = ?, plan_expires_at = ?, notes = ? WHERE id = ?")
    .bind(
      str(body.name, "Shop name", 80),
      slug,
      str(body.area, "Area", 60, { required: false }),
      bool(body.active) ? 1 : 0,
      str(body.plan, "Plan", 30, { required: false }) || "beta",
      expires || null,
      str(body.notes, "Notes", 1000, { required: false }),
      id
    )
    .run();
  return c.json(await listShops(db));
});

platformRoutes.post("/shops/:id/owner-password", async (c) => {
  const db = c.env.DB;
  const id = int(c.req.param("id"), "id", 1);
  const password = checkPassword((await readJson(c.req.raw)).password);
  const owner = await db.prepare("SELECT id FROM users WHERE shop_id = ? AND role = 'owner' ORDER BY id LIMIT 1").bind(id).first<{ id: number }>();
  if (!owner) throw notFound("This shop has no owner login");
  await db.batch([
    db.prepare("UPDATE users SET password_hash = ?, active = 1 WHERE id = ?").bind(await hashPassword(password), owner.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(owner.id),
  ]);
  return c.json({ ok: true });
});

/** Opens a shop's admin as its owner (this session only). */
platformRoutes.post("/shops/:id/enter", async (c) => {
  const id = int(c.req.param("id"), "id", 1);
  if (!(await c.env.DB.prepare("SELECT 1 FROM shops WHERE id = ?").bind(id).first())) throw notFound("Shop not found");
  await c.env.DB.prepare("UPDATE sessions SET acting_shop_id = ? WHERE token_hash = ?").bind(id, c.get("user").session_hash).run();
  return c.json({ ok: true });
});

platformRoutes.post("/exit", async (c) => {
  await c.env.DB.prepare("UPDATE sessions SET acting_shop_id = NULL WHERE token_hash = ?").bind(c.get("user").session_hash).run();
  return c.json({ ok: true });
});
