const PRO_MAX_SECONDS = 20;

function parseAllowedOrigins(env) {
  const raw = env.ALLOWED_ORIGIN || "";
  return raw
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function resolveCors(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = parseAllowedOrigins(env);
  if (allowed.length === 0) {
    return { allowed: true, header: origin || "*" };
  }
  if (!origin) {
    return { allowed: true, header: allowed[0] };
  }
  if (allowed.includes("*")) {
    return { allowed: true, header: "*" };
  }
  if (allowed.includes(origin)) {
    return { allowed: true, header: origin };
  }
  return { allowed: false, origin };
}

function corsHeaders(originHeader, extra = {}) {
  const headers = new Headers(extra);
  if (originHeader) {
    headers.set("Access-Control-Allow-Origin", originHeader);
  }
  headers.set("Vary", "Origin");
  return headers;
}

function jsonResponse(data, status, corsHeader) {
  const headers = corsHeaders(corsHeader, { "Content-Type": "application/json" });
  return new Response(JSON.stringify(data), { status, headers });
}

function b64uToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const binary = atob(s + "=".repeat(pad));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

async function verifyLicense(code, env) {
  const publicKeyX = env.PUBLIC_KEY_JWK_X;
  if (!publicKeyX) {
    throw new Error("PUBLIC_KEY_JWK_X not configured");
  }
  const jwk = { kty: "OKP", crv: "Ed25519", x: publicKeyX };
  const [payloadPart, signaturePart] = code.split(".");
  if (!payloadPart || !signaturePart) {
    return { ok: false, reason: "Bad format" };
  }
  const payloadBytes = b64uToBytes(payloadPart);
  const signatureBytes = b64uToBytes(signaturePart);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519", namedCurve: "Ed25519" }, false, ["verify"]);
  const verified = await crypto.subtle.verify("Ed25519", key, signatureBytes, payloadBytes);
  if (!verified) {
    return { ok: false, reason: "Signature check failed" };
  }
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  if (!payload?.email || !payload?.exp) {
    return { ok: false, reason: "Invalid payload" };
  }
  if (payload.plan && payload.plan !== "pro-v1") {
    return { ok: false, reason: "Unsupported plan" };
  }
  const expiry = Date.parse(payload.exp);
  if (!Number.isFinite(expiry)) {
    return { ok: false, reason: "Invalid expiry" };
  }
  const now = Date.now();
  if (now > expiry) {
    return { ok: false, reason: "Expired", payload };
  }
  const daysLeft = Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)));
  return { ok: true, payload, daysLeft };
}

function detectAudioFormat(type = "") {
  if (!type) return "webm";
  const [mime] = type.split(";");
  if (!mime) return "webm";
  const parts = mime.split("/");
  return parts.length > 1 ? parts[1] : "webm";
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function callOpenAI(audioFile, env) {
  const arrayBuffer = await audioFile.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  const format = detectAudioFormat(audioFile.type);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-transcribe",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              audio: {
                data: base64,
                format
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const fallback = Array.isArray(data.output)
    ? data.output
        .filter(item => item.type === "output_text")
        .flatMap(item => (item.content || [])
          .filter(chunk => chunk.type === "output_text" && chunk.text)
          .map(chunk => chunk.text))
        .join("\n")
        .trim()
    : "";
  const text = (data.output_text || fallback || "").trim();
  if (!text) {
    throw new Error("OpenAI returned no text");
  }
  return text;
}

async function handleTranscribe(request, env) {
  const cors = resolveCors(request, env);
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500, cors.header);
  }

  const form = await request.formData();
  const license = (form.get("license") || "").toString().trim();
  const duration = Number.parseFloat((form.get("duration") || "").toString());
  const audio = form.get("audio");

  if (!license) {
    return jsonResponse({ error: "Missing license" }, 401, cors.header);
  }
  if (!(audio instanceof File) || audio.size === 0) {
    return jsonResponse({ error: "Missing audio clip" }, 400, cors.header);
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return jsonResponse({ error: "Duration required" }, 400, cors.header);
  }
  if (duration > PRO_MAX_SECONDS + 1) {
    return jsonResponse({ error: "Clip exceeds 20 second limit" }, 400, cors.header);
  }

  const verification = await verifyLicense(license, env).catch(err => ({ ok: false, reason: err.message }));
  if (!verification.ok) {
    return jsonResponse({ error: verification.reason || "Invalid license" }, 401, cors.header);
  }

  try {
    const text = await callOpenAI(audio, env);
    console.log(`Transcribed ${Math.round(duration)}s clip for ${verification.payload.email}`);
    return jsonResponse({ text, duration, email: verification.payload.email, daysLeft: verification.daysLeft }, 200, cors.header);
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: err.message || "Transcription failed" }, 502, cors.header);
  }
}

async function handleOptions(request, env) {
  const cors = resolveCors(request, env);
  if (!cors.allowed) {
    return new Response(null, { status: 403 });
  }
  const headers = corsHeaders(cors.header, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  });
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }
    if (url.pathname === "/transcribe" && request.method === "POST") {
      return handleTranscribe(request, env);
    }
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  }
};
