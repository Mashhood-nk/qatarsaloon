// Password hashing (PBKDF2 via WebCrypto) and cookie sessions stored in D1.
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppEnv, ShopRow, UserRow } from "../env";
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
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.shop_id, u.barber_id, u.username, u.name, u.role, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  )
    .bind(await sha256Hex(token))
    .first<UserRow & { expires_at: string }>();
  if (!row || new Date(row.expires_at) < new Date()) return null;
  const { expires_at: _ignored, ...user } = row;
  return user;
}

/** Requires a logged-in shop owner; sets user, shop and barberId on the context. */
export const requireShopUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, "Please log in");
  if (!user.shop_id) throw new HttpError(403, "This login isn't linked to a shop");
  const shop = await c.env.DB.prepare("SELECT * FROM shops WHERE id = ?").bind(user.shop_id).first<ShopRow>();
  if (!shop) throw new HttpError(403, "Shop not found");
  let barberId = user.barber_id;
  if (!barberId) {
    const b = await c.env.DB.prepare("SELECT id FROM barbers WHERE shop_id = ? AND active = 1 ORDER BY sort, id LIMIT 1")
      .bind(shop.id)
      .first<{ id: number }>();
    if (!b) throw new HttpError(403, "This shop has no barber yet");
    barberId = b.id;
  }
  c.set("user", user);
  c.set("shop", shop);
  c.set("barberId", barberId);
  await next();
};
