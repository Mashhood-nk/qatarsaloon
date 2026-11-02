// Password hashing (PBKDF2 via WebCrypto) and cookie sessions stored in D1.
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, BarberRow, ShopRow, UserRow } from "../env";
import { HttpError, randomToken, sha256Hex } from "./util";

const COOKIE = "sid";
const SESSION_DAYS = 60;
const ITERATIONS = 100000; // Workers' PBKDF2 maximum

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toB64(u8: Uint8Array): string {
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !saltB64 || !hashB64) return false;
  const expected = fromB64(hashB64);
  const actual = await pbkdf2(password, fromB64(saltB64), Number(iter));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function createSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), userId, expires.toISOString())
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function currentUser(c: Context<AppEnv>): Promise<UserRow | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.shop_id, u.barber_id, u.username, u.name, u.role, u.active, s.acting_shop_id, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  )
    .bind(hash)
    .first<Omit<UserRow, "session_hash"> & { expires_at: string }>();
  if (!row || new Date(row.expires_at) < new Date() || !row.active) return null;
  const { expires_at: _ignored, ...user } = row;
  return { ...user, session_hash: hash };
}

export async function shopBarbers(db: D1Database, shopId: number): Promise<BarberRow[]> {
  const { results } = await db
    .prepare("SELECT id, shop_id, name, active, sort FROM barbers WHERE shop_id = ? ORDER BY active DESC, sort, id")
    .bind(shopId)
    .all<BarberRow>();
  return results;
}

/**
 * Requires a login with access to a shop: its owner, one of its barbers, or a platform admin
 * who has opened the shop. Sets user, shop, role, barbers and which barbers this login may manage.
 */
export const requireShopUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, "Please log in");
  const shopId = user.role === "platform" ? user.acting_shop_id : user.shop_id;
  if (!shopId) throw new HttpError(403, user.role === "platform" ? "Open a shop from the platform page first" : "This login isn't linked to a shop");
  const shop = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?").bind(shopId).first<ShopRow>();
  if (!shop) throw new HttpError(403, "Shop not found");
  if (!shop.active && user.role !== "platform") throw new HttpError(403, "This shop is paused. Please contact the platform admin.");
  const barbers = await shopBarbers(c.env.DB, shop.id);
  const active = barbers.filter((b) => b.active).map((b) => b.id);
  const role = user.role === "barber" ? "barber" : "owner";
  const own = user.role === "platform" ? null : user.barber_id;
  if (role === "barber" && (!own || !active.includes(own))) throw new HttpError(403, "Your barber profile is inactive. Please ask the shop owner.");
  c.set("user", user);
  c.set("shop", shop);
  c.set("role", role);
  c.set("ownBarberId", own);
  c.set("barbers", barbers);
  c.set("allowedBarberIds", role === "owner" ? active : [own!]);
  await next();
};

/** Owner-only actions inside a shop (services, shop page, team, booking rules). */
export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("role") !== "owner") throw new HttpError(403, "Only the shop owner can change this");
  await next();
};

/** Platform admin only. */
export const requirePlatform: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, "Please log in");
  if (user.role !== "platform") throw new HttpError(403, "Platform admins only");
  c.set("user", user);
  await next();
};
