// Prints the SQL to create a login, with the password hashed the same way the Worker checks it.
// Usage: npm run hash-password -- <username> <password> <shop_slug> ["Display name"]
// Then run the printed SQL with: npx wrangler d1 execute barber-db --remote --command "<sql>"
import { webcrypto as crypto } from "node:crypto";

const [username, password, shopSlug, displayName] = process.argv.slice(2);
if (!username || !password || !shopSlug) {
  console.error('Usage: npm run hash-password -- <username> <password> <shop_slug> ["Display name"]');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}

const ITERATIONS = 100000; // the maximum Workers allows for PBKDF2
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
const b64 = (u8) => Buffer.from(u8).toString("base64");
const hash = `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
const esc = (s) => s.replace(/'/g, "''");
const name = displayName || username;

console.log(
  `INSERT INTO users (shop_id, barber_id, username, name, password_hash, role) ` +
    `SELECT s.id, (SELECT b.id FROM barbers b WHERE b.shop_id = s.id ORDER BY b.sort, b.id LIMIT 1), ` +
    `'${esc(username)}', '${esc(name)}', '${hash}', 'owner' FROM shops s WHERE s.slug = '${esc(shopSlug)}';`
);
