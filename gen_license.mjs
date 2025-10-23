/*
Generate signed unlock codes (run locally):
  node gen_license.mjs issue --email user@example.com --days 30

First run once to create keys:
  node gen_license.mjs keygen

It writes:
  private_key.jwk (keep secret) and public_key.jwk (paste x into index.html PUBLIC_KEY_JWK.x)
*/
import { readFileSync, writeFileSync, existsSync } from "fs";
import { webcrypto } from "crypto";

const { subtle } = webcrypto;

function b64u(bytes){
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

const args = process.argv.slice(2);
const cmd = args[0];

function usage(){
  console.log("Usage:\n  node gen_license.mjs keygen\n  node gen_license.mjs issue --email user@example.com --days 30");
}

function getArgValue(flag){
  const idx = args.indexOf(flag);
  if(idx === -1 || idx === args.length - 1) return null;
  return args[idx + 1];
}

if(cmd === "keygen"){
  const key = await subtle.generateKey({ name: "Ed25519", namedCurve:"Ed25519" }, true, ["sign","verify"]);
  const priv = await subtle.exportKey("jwk", key.privateKey);
  const pub  = await subtle.exportKey("jwk", key.publicKey);
  writeFileSync("private_key.jwk", JSON.stringify(priv,null,2));
  writeFileSync("public_key.jwk", JSON.stringify(pub,null,2));
  console.log("Wrote private_key.jwk and public_key.jwk");
  process.exit(0);
}

if(cmd === "issue"){
  const email = getArgValue("--email");
  const daysVal = getArgValue("--days");
  const parsedDays = daysVal === null ? NaN : Number.parseInt(daysVal ?? "", 10);
  const days = Number.isFinite(parsedDays) ? parsedDays : 30;
  if(!email){ console.error("Missing --email"); process.exit(1); }
  if(!existsSync("private_key.jwk")){ console.error("Run keygen first."); process.exit(1); }
  const jwk = JSON.parse(readFileSync("private_key.jwk","utf8"));
  const key = await subtle.importKey("jwk", jwk, { name:"Ed25519", namedCurve:"Ed25519" }, false, ["sign"]);
  const exp = new Date(Date.now()+days*24*60*60*1000).toISOString();
  const payload = { email, exp, plan:"pro-v1" };
  const payloadBytes = Buffer.from(JSON.stringify(payload));
  const sigBuf = Buffer.from(await subtle.sign("Ed25519", key, payloadBytes));
  const code = b64u(payloadBytes) + "." + b64u(sigBuf);
  console.log("CODE:", code);
  console.log("Paste PUBLIC x to index.html PUBLIC_KEY_JWK.x from public_key.jwk");
  process.exit(0);
}

usage();
