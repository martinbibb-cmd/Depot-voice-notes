export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // CORS / preflight
      if (request.method === "OPTIONS") {
        return handleOptions();
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ status: "ok" }, 200);
      }

      if (request.method === "POST" && url.pathname === "/text") {
        return handleText(request, env);
      }

      if (request.method === "POST" && url.pathname === "/audio") {
        return handleAudio(request, env);
      }

      return jsonResponse({ error: "not_found" }, 404);
    } catch (err) {
      console.error("Worker fatal error:", err);
      return jsonResponse({ error: "server_error", message: String(err) }, 500);
    }
  }
};

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
    ...extra
  };
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders()
  });
}

/* ---------- /text ---------- */

async function handleText(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const transcript = typeof payload.transcript === "string"
    ? payload.transcript.trim()
    : "";

  if (!transcript) {
    return jsonResponse(
      { error: "bad_request", message: "transcript required" },
      400
    );
  }

  const checklistItems = Array.isArray(payload.checklistItems)
    ? payload.checklistItems
    : [];

  const depotSectionsRaw = payload.depotSections;
  const depotSections = Array.isArray(depotSectionsRaw)
    ? depotSectionsRaw
    : (depotSectionsRaw && Array.isArray(depotSectionsRaw.sections))
      ? depotSectionsRaw.sections
      : [];

  try {
    const result = await callNotesModel(env, transcript, checklistItems, depotSections);
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleText model error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
      500
    );
  }
}

/* ---------- /audio ---------- */

async function handleAudio(request, env) {
  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.startsWith("audio/") && !contentType.startsWith("application/octet-stream")) {
    return jsonResponse(
      { error: "bad_request", message: "audio content-type required" },
      400
    );
  }

  const audioData = await request.arrayBuffer();

  try {
    const transcript = await transcribeAudio(env, audioData, contentType);
    const result = await callNotesModel(env, transcript, [], []);
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleAudio error:", err);
    return jsonResponse(
      { error: "audio_error", message: String(err) },
      500
    );
  }
}

/* ---------- OpenAI helpers ---------- */

async function transcribeAudio(env, audioBuffer, mime) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const form = new FormData();
  const file = new File([audioBuffer], "audio.webm", { type: mime || "audio/webm" });
  form.append("file", file);
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: form
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`transcription error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.text || "";
}

async function callNotesModel(env, transcript, checklistItems, depotSections) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  // IMPORTANT: we do NOT use response_format here.
  // Instead we *ask* for JSON and parse it ourselves.
  const systemPrompt = `
You are Survey Brain, a heating survey assistant for a British Gas style boiler installation surveyor.

You receive:
- A transcript of what was discussed.
- A list of known checklist items (with ids).
- A list of depot section names.

Your job is to:
1. Decide which checklist ids are clearly satisfied by the transcript.
2. Write depot notes grouped into the given section names.
3. Suggest a small list of materials/parts.
4. Write a short customer-friendly summary of the job.

You MUST respond with ONLY valid JSON matching this shape:

{
  "checkedItems": ["<checklistId>", ...],
  "sections": [
    {
      "section": "<one of the depot section names>",
      "plainText": "Short semi-bullet summary; clauses separated by semicolons;",
      "naturalLanguage": "Human sentence description for depot notes."
    }
  ],
  "materials": [
    {
      "category": "Boiler | Cylinder | Flue | Controls | System clean | Filter | Misc",
      "item": "Exact part description (include make and model for boilers/cylinders where known).",
      "qty": 1,
      "notes": "Optional short note such as size, orientation or location."
    }
  ],
  "missingInfo": [
    { "target": "engineer | customer", "question": "Short question if anything important is unclear." }
  ],
  "customerSummary": "2–4 sentence summary suitable to show the customer."
}

Do not wrap the JSON in backticks or markdown.
Do not include any explanation outside the JSON.
If something isn't mentioned, leave it out rather than guessing.
Always preserve boiler/cylinder make & model exactly as spoken.
`.trim();

  const userPayload = {
    transcript,
    checklistItems,
    depotSections
  };

  const body = {
    model: "gpt-4.1",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) }
    ]
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const rawText = await res.text();

  if (!res.ok) {
    // Surface the OpenAI error cleanly to the front-end
    throw new Error(`chat.completions ${res.status}: ${rawText}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`OpenAI returned non-JSON response: ${String(err)} :: ${rawText}`);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("No content from model");
  }

  let jsonOut;
  try {
    jsonOut = JSON.parse(content);
  } catch (err) {
    throw new Error(`Model content was not valid JSON: ${String(err)} :: ${content}`);
  }

  // Safety defaults
  if (!Array.isArray(jsonOut.sections)) jsonOut.sections = [];
  if (!Array.isArray(jsonOut.materials)) jsonOut.materials = [];
  if (!Array.isArray(jsonOut.checkedItems)) jsonOut.checkedItems = [];
  if (!Array.isArray(jsonOut.missingInfo)) jsonOut.missingInfo = [];
  if (typeof jsonOut.customerSummary !== "string") jsonOut.customerSummary = "";

  return jsonOut;
}
