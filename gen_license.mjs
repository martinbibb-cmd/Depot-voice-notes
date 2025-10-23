/*
Usage:
  node gen_license.mjs keygen
  node gen_license.mjs issue --email user@example.com --days 30

Outputs:
  - keygen: private_key.jwk (KEEP SECRET), public_key.jwk (share x in app)
  - issue : prints CODE: <payloadB64u>.<sigB64u>
Paste the public_key.jwk.x into index.html (PUBLIC_KEY_JWK.x).
*/
import { readFileSync, writeFileSync, existsSync } from "fs";
import { webcrypto as crypto } from "crypto";
const { subtle } = crypto;

function b64u(buf) {
  const s = Buffer.from(buf).toString("base64");
  return s.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

const cmd = process.argv[2];

if (cmd === "keygen") {
  const key = await subtle.generateKey({ name: "Ed25519" }, true, ["sign","verify"]);
  const priv = await subtle.exportKey("jwk", key.privateKey);
  const pub  = await subtle.exportKey("jwk", key.publicKey);
  writeFileSync("private_key.jwk", JSON.stringify(priv,null,2));
  writeFileSync("public_key.jwk", JSON.stringify(pub,null,2));
  console.log("Wrote private_key.jwk and public_key.jwk");
  process.exit(0);
}

if (cmd === "issue") {
  const iEmail = process.argv.indexOf("--email");
  const iDays  = process.argv.indexOf("--days");
  const email  = iEmail > -1 ? process.argv[iEmail+1] : null;
  const days   = iDays  > -1 ? parseInt(process.argv[iDays+1]||"30",10) : 30;
  if (!email) { console.error("Missing --email"); process.exit(1); }
  if (!existsSync("private_key.jwk")) { console.error("Run keygen first."); process.exit(1); }
  const jwk = JSON.parse(readFileSync("private_key.jwk","utf8"));
  const key = await subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  const exp = new Date(Date.now() + days*24*60*60*1000).toISOString();
  const payload = { email, exp, plan: "pro-v1" };
  const payloadBytes = Buffer.from(JSON.stringify(payload));
  const sig = new Uint8Array(await subtle.sign("Ed25519", key, payloadBytes));
  const code = `${b64u(payloadBytes)}.${b64u(sig)}`;
  console.log("CODE:", code);
  console.log("Reminder: paste public_key.jwk.x into PUBLIC_KEY_JWK.x in index.html");
  process.exit(0);
}

console.log("Usage:\n  node gen_license.mjs keygen\n  node gen_license.mjs issue --email user@example.com --days 30");
