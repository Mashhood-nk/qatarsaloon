// One-time setup for push notifications: creates the VAPID key pair and stores it in Cloudflare
// as Worker secrets (and in .dev.vars for local testing).
//
//   npm run setup-push            create keys (refuses if they already exist)
//   npm run setup-push -- --force replace keys (every device must turn notifications on again)
import { webcrypto as crypto } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const force = process.argv.includes("--force");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const list = spawnSync(npx, ["wrangler", "secret", "list", "--format", "json"], { encoding: "utf8", shell: process.platform === "win32" });
if (list.status === 0 && /"VAPID_PRIVATE_KEY"/.test(list.stdout) && !force) {
  console.log("Push keys are already set up in Cloudflare. Nothing to do.");
  console.log("(To replace them, run: npm run setup-push -- --force. Every device then has to turn notifications on again.)");
  process.exit(0);
}

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const b64url = (u8) => Buffer.from(u8).toString("base64url");
const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;

for (const [name, value] of [
  ["VAPID_PUBLIC_KEY", publicKey],
  ["VAPID_PRIVATE_KEY", privateKey],
]) {
  console.log(`Saving ${name} to Cloudflare…`);
  const r = spawnSync(npx, ["wrangler", "secret", "put", name], { input: value, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\nCouldn't save ${name}. Check you're logged in (npx wrangler login) and try again.`);
    process.exit(1);
  }
}

// Local testing (npm run dev) reads secrets from .dev.vars, which is git-ignored.
let vars = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8") : "";
vars = vars.replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=.*\n?/gm, "");
vars += `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`;
writeFileSync(".dev.vars", vars);

console.log("\nDone. Push notifications are set up. Deploy with: npm run deploy");
