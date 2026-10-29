import { Hono } from "hono";
import type { AppEnv, ShopRow } from "../env";
import type { MeDto } from "../../shared/types";
import { createSession, currentUser, destroySession, hashPassword, verifyPassword } from "../lib/auth";
import { HttpError, readJson, str } from "../lib/util";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  const body = await readJson(c.req.raw);
  const username = str(body.username, "Username", 60).toLowerCase();
  const password = str(body.password, "Password", 200);
  const row = await c.env.DB.prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: number; password_hash: string }>();
  const ok = row ? await verifyPassword(password, row.password_hash) : false;
  if (!row || !ok) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing a little
    throw new HttpError(401, "Wrong username or password");
  }
  await createSession(c, row.id);
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, "Please log in");
  const shop = user.shop_id
    ? await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?").bind(user.shop_id).first<ShopRow>()
    : null;
  const body: MeDto = {
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
    shop: shop
      ? {
          id: shop.id,
          slug: shop.slug,
          name: shop.name,
          accent: shop.accent,
          currency: shop.currency,
          timezone: shop.timezone,
          whatsapp: shop.whatsapp,
          address: shop.address,
          grace_min: shop.grace_min,
        }
      : null,
  };
  return c.json(body);
});

authRoutes.post("/password", async (c) => {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, "Please log in");
  const body = await readJson(c.req.raw);
  const current = str(body.current, "Current password", 200);
  const next = str(body.next, "New password", 200);
  if (next.length < 8) throw new HttpError(400, "Use at least 8 characters");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new HttpError(401, "The current password is wrong");
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(next), user.id).run();
  // Log out other devices.
  await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await createSession(c, user.id);
  return c.json({ ok: true });
});
