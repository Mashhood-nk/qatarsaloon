import { describe, expect, it } from "vitest";
import { createECDH, createPublicKey, verify, webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import { b64urlToBytes, bytesToB64url, encryptPayload, isPushEndpoint, vapidAuthorization } from "./webpush";

const require = createRequire(import.meta.url);
let ece: { decrypt: (buf: Buffer, params: Record<string, unknown>) => Buffer } | null = null;
try {
  ece = require("http_ece");
} catch {
  ece = null; // independent decryptor not installed: those checks are skipped
}

/** Imports a raw P-256 private scalar (base64url) as a WebCrypto ECDH key pair. */
async function ecdhPairFrom(privB64: string): Promise<CryptoKeyPair> {
  const node = createECDH("prime256v1");
  node.setPrivateKey(Buffer.from(b64urlToBytes(privB64)));
  const pub = new Uint8Array(node.getPublicKey());
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33)), d: privB64, ext: true };
  const privateKey = await webcrypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await webcrypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []);
  return { privateKey, publicKey } as CryptoKeyPair;
}

describe("web push encryption (RFC 8291)", () => {
  it("matches the RFC 8291 Appendix A example exactly", async () => {
    const out = await encryptPayload(
      new TextEncoder().encode("When I grow up, I want to be a watermelon"),
      {
        p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        auth: "BTBZMqHH6r4Tts7J_aSIgg",
      },
      { salt: b64urlToBytes("DGv6ra1nlYgDCS1FRnbzlw"), senderKeys: await ecdhPairFrom("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw") }
    );
    expect(bytesToB64url(out)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
    );
  });

  it.skipIf(!ece)("an independent implementation (http_ece) can decrypt it", async () => {
    const browser = createECDH("prime256v1");
    browser.generateKeys();
    const auth = webcrypto.getRandomValues(new Uint8Array(16));
    const message = JSON.stringify({ title: "New booking request", body: "Rahul · Haircut + Beard · Sat 13:00", url: "/admin/bookings/12" });
    const out = await encryptPayload(new TextEncoder().encode(message), {
      p256dh: bytesToB64url(new Uint8Array(browser.getPublicKey())),
      auth: bytesToB64url(auth),
    });
    const plain = ece!.decrypt(Buffer.from(out), { version: "aes128gcm", privateKey: browser, authSecret: Buffer.from(auth) });
    expect(plain.toString("utf8")).toBe(message);
  });
});

describe("VAPID", () => {
  it("produces a valid ES256 token for the push service origin", async () => {
    const pair = (await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
    const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
    const header = await vapidAuthorization(
      "https://web.push.apple.com/QGuQyavXutnMtdaMS8sIdNTF/abc",
      { publicKey: bytesToB64url(pub), privateKey: jwk.d!, subject: "https://qatarsaloon.com" },
      1_800_000_000
    );
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, h, c, s, k] = m!;
    expect(k).toBe(bytesToB64url(pub));
    const claims = JSON.parse(Buffer.from(b64urlToBytes(c)).toString());
    expect(claims).toEqual({ aud: "https://web.push.apple.com", exp: 1_800_000_000 + 12 * 3600, sub: "https://qatarsaloon.com" });
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! }, format: "jwk" });
    const ok = verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(b64urlToBytes(s)));
    expect(ok).toBe(true);
  });

  it("only accepts real push services", () => {
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://evil.example.com/push")).toBe(false);
    expect(isPushEndpoint("http://web.push.apple.com/abc")).toBe(false);
  });
});
