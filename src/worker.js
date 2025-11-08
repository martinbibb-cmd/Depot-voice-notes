const SYSTEM_PROMPT = `
You are a heating survey note-builder for a British Gas engineer.

You will receive short, speech-like transcripts of the engineer talking to the customer. Each time you are given text, do three things:

1. Create a short, friendly CUSTOMER SUMMARY of what the engineer appears to be promising or explaining. Keep it plain English, 1–3 sentences.
2. Extract and normalise any DEPOT / SURVEY information you can into the engineer’s standard sections:
   - Working at heights
   - Needs
   - System characteristics
   - Flue
   - Gas and water
   - Components that require assistance
   - Disruption
   - Customer actions
   For each section, produce both:
   - \`plainText\` using leading ticks and semicolons like: "✅ Ladders | Loft access;"
   - \`naturalLanguage\` in full sentences.
3. If you cannot confidently fill one or more sections, return clarification questions ONLY for those gaps. Mark each clarification as either:
   - target = "engineer" (technical, e.g. flue route, gas upsizing, condensate run)
   - target = "customer" (access, clearance, pets, disruption)
Ask concise, single-point questions.

You may also receive "alreadyCaptured" and "expectedSections" to help you decide what is still missing.

Output JSON ONLY with these keys:
- \`status\`: "needs_clarification" or "complete"
- \`customerSummary\`: string
- \`depotSectionsSoFar\`: array of section objects as described
- \`missingInfo\`: array of { "target": "...", "question": "...", "key": "..." }
- if complete, also include \`depotNotes\` with { "exportedAt": ISO-datetime, "sections": [...] }

Do NOT invent prices, product codes, or brand-specific rules.
Normalise spelling: "flu" -> "flue".
`.trim();

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

    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "content-type": "application/json", ...cors },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "content-type": "application/json", ...cors },
      });
    }

    if (url.pathname === "/audio") {
      return handleAudio(request, env, cors);
    }

    if (url.pathname === "/text" || url.pathname === "/") {
      return handleText(request, env, cors);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json", ...cors },
    });
  },
};

async function handleText(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body", detail: error.message }),
      {
        status: 400,
        headers: { "content-type": "application/json", ...cors },
      },
    );
  }

  const {
    transcript,
    alreadyCaptured = [],
    expectedSections = [],
  } = body || {};

  if (typeof transcript !== "string" || transcript.trim() === "") {
    return new Response(
      JSON.stringify({ error: "transcript must be a non-empty string" }),
      {
        status: 400,
        headers: { "content-type": "application/json", ...cors },
      },
    );
  }

  let payload = await callSurveyBrain(env, {
    transcript,
    alreadyCaptured,
    expectedSections,
  });

  if (typeof payload !== "object" || payload === null) {
    payload = { error: "Model returned non-object payload", raw: payload };
  }

  const status = payload && payload.error ? 502 : 200;

  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

async function handleAudio(request, env, cors) {
  const contentType = request.headers.get("content-type") || "audio/webm";
  const audioBytes = await request.arrayBuffer();

  if (!audioBytes || audioBytes.byteLength === 0) {
    return new Response(JSON.stringify({ error: "Audio body required" }), {
      status: 400,
      headers: { "content-type": "application/json", ...cors },
    });
  }

  const boundary = "----cfboundary" + Math.random().toString(16).slice(2);
  const header =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="audio.webm"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`;
  const footer =
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n` +
    `--${boundary}--\r\n`;

  const body = new Blob([
    new Blob([header], { type: "text/plain" }),
    new Uint8Array(audioBytes),
    new Blob([footer], { type: "text/plain" }),
  ]);

  const whisperRes = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!whisperRes.ok) {
    const detail = await whisperRes.text();
    return new Response(
      JSON.stringify({ error: "Whisper STT error", detail }),
      {
        status: 502,
        headers: { "content-type": "application/json", ...cors },
      },
    );
  }

  const whisperData = await whisperRes.json();
  const transcript = (whisperData.text || "").trim();

  if (!transcript) {
    return new Response(
      JSON.stringify({
        error: "Transcription returned empty text",
        transcript,
      }),
      {
        status: 502,
        headers: { "content-type": "application/json", ...cors },
      },
    );
  }

  let payload = await callSurveyBrain(env, {
    transcript,
    alreadyCaptured: [],
    expectedSections: [],
  });

  if (typeof payload !== "object" || payload === null) {
    payload = { error: "Model returned non-object payload", raw: payload };
  }

  payload.transcript = transcript;

  const status = payload && payload.error ? 502 : 200;

  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

async function callSurveyBrain(env, body) {
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(body) },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    return { error: "OpenAI chat error", detail };
  }

  const data = await openaiRes.json();
  try {
    return JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch (error) {
    return {
      error: "Model did not return JSON",
      raw: data.choices?.[0]?.message?.content,
    };
  }
}
