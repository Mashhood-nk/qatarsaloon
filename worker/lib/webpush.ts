// Standard Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291),
// using only WebCrypto so it runs on Cloudflare Workers with no extra service or library.

const te = new TextEncoder();

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

export interface PushTarget {
  endpoint: string;
  /** Browser's public key (base64url, 65 bytes uncompressed P-256). */
  p256dh: string;
  /** Browser's auth secret (base64url, 16 bytes). */
  auth: string;
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 public key. */
  publicKey: string;
  /** base64url, 32-byte private scalar (the JWK "d"). */
  privateKey: string;
  /** mailto: or https: contact for push services. */
  subject: string;
}

/**
 * Encrypts a payload for one browser subscription (RFC 8291, single aes128gcm record).
 * `salt` and `senderKeys` are only passed by tests.
 */
export async function encryptPayload(
  payload: Uint8Array,
  target: Pick<PushTarget, "p256dh" | "auth">,
  testing?: { salt?: Uint8Array; senderKeys?: CryptoKeyPair }
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(target.p256dh);
  const authSecret = b64urlToBytes(target.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("Invalid subscription keys");

  const sender =
    testing?.senderKeys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", sender.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // `public` is the standard name; Workers' types call it `$public`.
  const ecdhAlg = { name: "ECDH", public: uaKey, $public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlg, sender.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(te.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, new Uint8Array([1])));

  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  // One record: payload followed by the 0x02 "last record" delimiter.
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** `Authorization` header value: a short-lived ES256 JWT for the push service's origin. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const pub = b64urlToBytes(vapid.publicKey);
  if (pub.length !== 65) throw new Error("Invalid VAPID public key");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: vapid.privateKey, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = bytesToB64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: vapid.subject })));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${vapid.publicKey}`;
}

/** Push services we accept subscriptions for (keeps the Worker from posting to arbitrary URLs). */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** The subscription no longer exists and should be deleted. */
  gone: boolean;
}

export async function sendPush(
  target: PushTarget,
  message: unknown,
  vapid: VapidKeys,
  opts: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {}
): Promise<PushResult> {
  const body = await encryptPayload(te.encode(JSON.stringify(message)), target);
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(target.endpoint, vapid),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opts.ttl ?? 86400),
    Urgency: opts.urgency ?? "high",
  };
  // A topic replaces an undelivered notification with the same topic (e.g. repeated reminders).
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const res = await fetch(target.endpoint, { method: "POST", headers, body });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
