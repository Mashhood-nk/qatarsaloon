// Sets a new password for any existing login (platform admin, shop owner or barber).
// It writes reset.sql in this folder and signs that user out everywhere.
//
//   node scripts/reset-password.mjs <username> <new password>
//   npx wrangler d1 execute barber-db --remote --file=reset.sql
//
// reset.sql holds only the scrambled password, never the real one. Delete it afterwards.
import { webcrypto as crypto } from "node:crypto";
import { writeFileSync } from "node:fs";

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: node scripts/reset-password.mjs <username> <new password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}

const ITERATIONS = 100000; // must match the Worker
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
const b64 = (u8) => Buffer.from(u8).toString("base64");
const hash = `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
const user = username.toLowerCase().replace(/'/g, "''");

// Written by the script itself (not with ">") so Windows PowerShell can't save it in the wrong encoding.
writeFileSync(
  "reset.sql",
  `DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = '${user}');\n` +
    `UPDATE users SET password_hash = '${hash}', active = 1 WHERE username = '${user}';\n`
);
console.log(`reset.sql is ready for "${username.toLowerCase()}". Now run:`);
console.log("  npx wrangler d1 execute barber-db --remote --file=reset.sql");
console.log('If it reports "changes: 0" for the UPDATE, that username does not exist.');
