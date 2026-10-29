// Small helpers for validation, errors and random tokens.

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429,
    message: string
  ) {
    super(message);
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);

export function int(v: unknown, name: string, min = -Infinity, max = Infinity): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${name} must be a whole number${min > -Infinity ? ` from ${min}` : ""}${max < Infinity ? ` to ${max}` : ""}`);
  }
  return n;
}

export function num(v: unknown, name: string, min = 0, max = 1e7): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw bad(`${name} must be a number`);
  return Math.round(n * 100) / 100;
}

export function str(v: unknown, name: string, maxLen = 200, { required = true } = {}): string {
  if (v === undefined || v === null) {
    if (required) throw bad(`${name} is required`);
    return "";
  }
  if (typeof v !== "string") throw bad(`${name} must be text`);
  const s = v.trim();
  if (required && !s) throw bad(`${name} is required`);
  if (s.length > maxLen) throw bad(`${name} is too long`);
  return s;
}

export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function idList(v: unknown, name: string): number[] {
  const arr = typeof v === "string" ? v.split(",") : v;
  if (!Array.isArray(arr) || arr.length === 0 || arr.length > 10) throw bad(`Choose at least one ${name}`);
  const ids = arr.map((x) => int(x, name, 1));
  return [...new Set(ids)];
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw bad("Invalid request body");
  }
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const nowIso = () => new Date().toISOString();

export function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}
