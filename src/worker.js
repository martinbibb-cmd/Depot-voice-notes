export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname !== "/transcribe") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json", ...cors },
      });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { "content-type": "application/json", ...cors },
      });
    }
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json", ...cors },
      });
    }

    // Accept multipart or raw audio
    let formData;
    const ctype = request.headers.get("content-type") || "";
    if (ctype.includes("multipart/form-data")) {
      formData = await request.formData();
    } else {
      const blob = await request.blob();
      formData = new FormData();
      formData.append("file", blob, "audio.webm");
    }

    // Preferred model; fallback to whisper-1 if needed
    async function call(model) {
      formData.set("model", model);
      formData.set("language", "en");
      return fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: formData,
      });
    }

    let up = await call("gpt-4o-mini-transcribe");
    if (!up.ok) up = await call("whisper-1");
    if (!up.ok) {
      const detail = await up.text();
      return new Response(JSON.stringify({ error: "OpenAI error", detail }), {
        status: 502,
        headers: { "content-type": "application/json", ...cors },
      });
    }

    const data = await up.json();
    const text = (data.text || "").trim();
    return new Response(JSON.stringify({ text }), {
      headers: { "content-type": "application/json", ...cors },
    });
  },
};
