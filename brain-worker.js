/**
 * Survey Brain – Cloudflare Worker
 * Routes:
 *   POST /text  -> transcript -> AI JSON
 *   POST /audio -> audio -> transcription -> AI JSON
 *   GET  /health -> simple JSON for debugging
 *
 * Env: OPENAI_API_KEY (OpenAI secret)
 */

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // CORS preflight
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

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err) {
      console.error("Worker fatal error:", err);
      return jsonResponse({ error: "server_error", message: String(err) }, 500);
    }
  }
};

// --- Helpers ---

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
    ...extra
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

// --- TEXT HANDLER ---

async function handleText(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "bad_request", message: "JSON body required" }, 400);
  }

  const transcript = (payload && payload.transcript) ? String(payload.transcript).trim() : "";
  if (!transcript) {
    return jsonResponse({ error: "bad_request", message: "transcript required" }, 400);
  }

  const checklistItems = Array.isArray(payload.checklistItems) ? payload.checklistItems : [];
  const depotSections = Array.isArray(payload.depotSections) || (payload.depotSections && Array.isArray(payload.depotSections.sections))
    ? payload.depotSections
    : [];

  try {
    const result = await callNotesModel(env, transcript, checklistItems, depotSections);
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleText model error:", err);
    return jsonResponse({ error: "model_error", message: String(err) }, 500);
  }
}

// --- AUDIO HANDLER ---

async function handleAudio(request, env) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.startsWith("audio/") && !contentType.startsWith("application/octet-stream")) {
    return jsonResponse({ error: "bad_request", message: "audio content-type required" }, 400);
  }

  const audioData = await request.arrayBuffer();

  try {
    const transcript = await transcribeAudio(env, audioData, contentType);
    const result = await callNotesModel(env, transcript, [], []);
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleAudio error:", err);
    return jsonResponse({ error: "audio_error", message: String(err) }, 500);
  }
}

// --- OpenAI calls ---

async function transcribeAudio(env, audioBuffer, mime) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  // Use OpenAI Whisper transcription
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
    throw new Error(`Transcription error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.text || "";
}

async function callNotesModel(env, transcript, checklistItems, depotSections) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const body = {
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are Survey Brain, a heating survey assistant for a British Gas style boiler installation surveyor.",
          "You receive a transcript of a visit plus configuration for depot sections and checklist items.",
          "You MUST return ONLY valid JSON matching the schema below. NEVER include markdown or extra commentary.",
          "",
          "Your tasks:",
          "1) Decide what is important in the transcript for depot notes.",
          "2) Decide which checklist item IDs are true.",
          "3) Decide the key materials / parts, preserving boiler/cylinder make and model exactly as spoken.",
          "4) Write a short customer-friendly summary.",
          "",
          "JSON SCHEMA:",
          "{",
          "  \"checkedItems\": [\"<checklistId>\", ...]",
          "  \"sections\": [",
          "    {",
          "      \"section\": \"<one of the known depot section names>\"",
          "      \"plainText\": \"Short semi-bullet summary with clauses separated by semicolons.\"",
          "      \"naturalLanguage\": \"Full sentence version suitable for depot notes / reading back to customer.\"",
          "    }",
          "  ]",
          "  \"materials\": [",
          "    {",
          "      \"category\": \"Boiler | Cylinder | Flue | Controls | System clean | Filter | Misc\"",
          "      \"item\": \"Exact part description INCLUDING make and model for boilers/cylinders.\"",
          "      \"qty\": 1",
          "      \"notes\": \"Optional short note such as size, orientation or location.\"",
          "    }",
          "  ]",
          "  \"missingInfo\": [",
          "    {",
          "      \"target\": \"engineer | customer\"",
          "      \"question\": \"Short question about missing info if something important is unclear.\"",
          "    }",
          "  ]",
          "  \"customerSummary\": \"2–4 sentence summary suitable to show the customer of what is being proposed.\"",
          "}",
          "",
          "If something is not mentioned, omit it rather than guessing.",
          "Always include the boiler make and model exactly as in the transcript if one is clearly stated."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          transcript,
          checklistItems,
          depotSections,
          note: "Return JSON only matching the schema. Do not add any other text. This text itself tells you the JSON requirements."
        })
      }
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`chat.completions error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content from model");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error("Model returned non-JSON: " + String(err) + " :: " + content);
  }

  if (!Array.isArray(parsed.sections)) parsed.sections = [];
  if (!Array.isArray(parsed.materials)) parsed.materials = [];
  if (!Array.isArray(parsed.checkedItems)) parsed.checkedItems = [];
  if (!Array.isArray(parsed.missingInfo)) parsed.missingInfo = [];
  if (typeof parsed.customerSummary !== "string") parsed.customerSummary = "";

  return parsed;
}
