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
      return jsonResponse({ error: "model_error", message: String(err) }, 500);
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

  const alreadyCaptured = normaliseCapturedSections(payload.alreadyCaptured);
  const expectedSections = normaliseExpectedSections(payload.expectedSections);
  const sectionHints = normaliseSectionHints(payload.sectionHints);
  const forceStructured = Boolean(payload.forceStructured);

  try {
    const result = await callNotesModel(env, {
      transcript,
      checklistItems,
      depotSections: payload.depotSections,
      alreadyCaptured,
      expectedSections,
      sectionHints,
      forceStructured
    });
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
    const result = await callNotesModel(env, {
      transcript,
      checklistItems: [],
      depotSections: [],
      alreadyCaptured: [],
      expectedSections: [],
      sectionHints: {},
      forceStructured: true
    });
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleAudio error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
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

async function callNotesModel(env, payload) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const {
    transcript,
    checklistItems: rawChecklistItems = [],
    depotSections: depotSectionsRaw = [],
    alreadyCaptured = [],
    sectionHints = {},
    forceStructured = false
  } = payload || {};

  const checklistFromPayload = sanitiseChecklistConfig(rawChecklistItems);
  const checklistItems = checklistFromPayload.items.length
    ? checklistFromPayload.items
    : cloneChecklistItems(DEFAULT_CHECKLIST_CONFIG.items);

  const activeSchemaInfo = getSchemaInfoFromPayload(depotSectionsRaw);
  const sectionListText = activeSchemaInfo.names
    .map((name, idx) => `${idx + 1}. ${name}`)
    .join("\n");

  // IMPORTANT: we do NOT use response_format here.
  // Instead we *ask* for JSON and parse it ourselves.
  const systemPrompt = `
You are Survey Brain, a heating survey assistant for a British Gas style boiler installation surveyor.

You receive:
- A transcript of what was discussed.
- A list of known checklist items (with ids).
- The depot section names listed below (use them exactly, in this order).
- Optionally, a list of sections already captured so you can avoid duplicates.
- Optional hints that map keywords to section names.
- A forceStructured flag indicating you MUST return structured depot notes even if the transcript is sparse.

Depot section names (in order):
${sectionListText}

Always return all of these sections, even if a section has no notes. Use the exact names and order.

Your job is to:
1. Decide which checklist ids are clearly satisfied by the transcript.
2. Write depot notes grouped into the given section names.
3. Suggest a small list of materials/parts.
4. Write a short customer-friendly summary of the job.

CRITICAL DEDUPLICATION RULES:
- If alreadyCaptured contains information for a section, DO NOT repeat that information.
- Only add NEW information from the current transcript that isn't already captured.
- Do NOT rephrase or reword existing captured information - completely skip it.
- If a detail is semantically the same (e.g., "Worcester Bosch 35kW boiler" vs "35kW Worcester Bosch"), treat as duplicate.
- Within each section, avoid listing the same information multiple times even if worded differently.
- For materials, do NOT duplicate items already in the list (check item names, not just exact strings).
- If the transcript only repeats what's already captured, return empty or minimal content for that section.

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
    { "target": "expert | customer", "question": "Short question if anything important is unclear." }
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
    depotSections: activeSchemaInfo.schema,
    alreadyCaptured,
    expectedSections: activeSchemaInfo.names,
    sectionHints,
    forceStructured
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

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("Model content was empty");
  }

  let jsonOut;
  try {
    jsonOut = JSON.parse(trimmedContent);
  } catch (err) {
    throw new Error(`Model content was not valid JSON: ${String(err)} :: ${content}`);
  }

  // Safety defaults
  if (!Array.isArray(jsonOut.sections)) jsonOut.sections = [];
  if (!Array.isArray(jsonOut.materials)) jsonOut.materials = [];
  if (!Array.isArray(jsonOut.checkedItems)) jsonOut.checkedItems = [];
  if (!Array.isArray(jsonOut.missingInfo)) jsonOut.missingInfo = [];
  if (typeof jsonOut.customerSummary !== "string") jsonOut.customerSummary = "";

  jsonOut.sections = normaliseSectionsFromModel(jsonOut.sections, activeSchemaInfo);

  return jsonOut;
}

function normaliseCapturedSections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => {
      if (typeof entry === "string") {
        const section = entry.trim();
        if (!section) return null;
        return { section, plainText: "", naturalLanguage: "" };
      }
      if (!entry || typeof entry !== "object") return null;
      const section = entry.section != null ? String(entry.section).trim() : "";
      if (!section) return null;
      const plainText = entry.plainText != null ? String(entry.plainText) : "";
      const naturalLanguage = entry.naturalLanguage != null ? String(entry.naturalLanguage) : "";
      return { section, plainText, naturalLanguage };
    })
    .filter(Boolean);
}

function normaliseExpectedSections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(section => section != null ? String(section).trim() : "")
    .filter(Boolean);
}

function normaliseSectionHints(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const key = rawKey != null ? String(rawKey).trim() : "";
    if (!key) continue;
    const val = rawVal != null ? String(rawVal).trim() : "";
    if (!val) continue;
    out[key] = val;
  }
  return out;
}

function resolveCanonicalSectionName(name, schemaInfo) {
  const key = normaliseSectionKey(name);
  if (!key) return null;
  return schemaInfo.keyLookup.get(key) || null;
}

function normaliseSectionsFromModel(rawSections, schemaInfo) {
  const orderedNames = schemaInfo.names;
  const map = new Map();

  (Array.isArray(rawSections) ? rawSections : []).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const rawName = typeof entry.section === "string"
      ? entry.section.trim()
      : typeof entry.name === "string"
        ? entry.name.trim()
        : "";
    if (!rawName) return;
    const resolved = resolveCanonicalSectionName(rawName, schemaInfo);
    if (!resolved) return;
    if (map.has(resolved)) return;
    const plainText = typeof entry.plainText === "string" ? entry.plainText : String(entry.plainText || "");
    const naturalLanguage = typeof entry.naturalLanguage === "string"
      ? entry.naturalLanguage
      : String(entry.naturalLanguage || entry.summary || "");
    map.set(resolved, {
      section: resolved,
      plainText,
      naturalLanguage
    });
  });

  const missing = [];
  const normalised = orderedNames.map((name) => {
    const existing = map.get(name);
    if (existing) return existing;
    missing.push(name);
    return {
      section: name,
      plainText: "• No additional notes;",
      naturalLanguage: "No additional notes."
    };
  });

  if (missing.length) {
    console.warn("Depot notes: model response missing sections:", missing);
  }

  return normalised;
}
import schemaConfig from "./depot.output.schema.json" assert { type: "json" };
import checklistConfig from "./checklist.config.json" assert { type: "json" };

const FUTURE_PLANS_NAME = "Future plans";
const FUTURE_PLANS_DESCRIPTION = "Notes about any future work or follow-on visits.";

function sanitiseSectionSchema(input) {
  const asArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.sections)) {
      return value.sections;
    }
    return [];
  };

  const rawEntries = asArray(input);
  const prepared = [];
  rawEntries.forEach((entry, idx) => {
    if (!entry) return;
    const rawName = entry.name ?? entry.section ?? entry.title ?? entry.heading;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || name === "Arse_cover_notes") return;
    const rawDescription = entry.description ?? entry.hint ?? "";
    const description = typeof rawDescription === "string"
      ? rawDescription.trim()
      : String(rawDescription || "").trim();
    const order = typeof entry.order === "number" ? entry.order : idx + 1;
    prepared.push({ name, description, order, idx });
  });

  prepared.sort((a, b) => {
    const aHasOrder = typeof a.order === "number";
    const bHasOrder = typeof b.order === "number";
    if (aHasOrder && bHasOrder && a.order !== b.order) {
      return a.order - b.order;
    }
    if (aHasOrder && !bHasOrder) return -1;
    if (!aHasOrder && bHasOrder) return 1;
    return a.idx - b.idx;
  });

  const unique = [];
  const seen = new Set();
  prepared.forEach((entry) => {
    if (seen.has(entry.name)) return;
    seen.add(entry.name);
    unique.push({
      name: entry.name,
      description: entry.description || "",
      order: entry.order
    });
  });

  let withoutFuture = unique.filter((entry) => entry.name !== FUTURE_PLANS_NAME);
  let future = unique.find((entry) => entry.name === FUTURE_PLANS_NAME);
  if (!future) {
    future = {
      name: FUTURE_PLANS_NAME,
      description: FUTURE_PLANS_DESCRIPTION,
      order: withoutFuture.length + 1
    };
  } else if (!future.description) {
    future = { ...future, description: FUTURE_PLANS_DESCRIPTION };
  }

  const final = [...withoutFuture, future].map((entry, idx) => ({
    name: entry.name,
    description: entry.description || "",
    order: idx + 1
  }));

  return final;
}

function normaliseSectionKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildSchemaInfo(raw) {
  const schema = sanitiseSectionSchema(raw);
  const names = schema.map((entry) => entry.name);
  const keyLookup = new Map();
  schema.forEach((entry) => {
    const key = normaliseSectionKey(entry.name);
    if (!key) return;
    const variants = new Set([key]);
    if (key.endsWith("s")) variants.add(key.replace(/s$/, ""));
    if (key.endsWith("ies")) {
      variants.add(key.replace(/ies$/, "y"));
    } else if (key.endsWith("y")) {
      variants.add(key.replace(/y$/, "ies"));
    }
    if (key.includes(" and ")) {
      variants.add(key.replace(/\band\b/g, "").replace(/\s+/g, " ").trim());
    }
    variants.forEach((variant) => {
      if (variant && !keyLookup.has(variant)) {
        keyLookup.set(variant, entry.name);
      }
    });
  });
  return { schema, names, keyLookup };
}

function sanitiseChecklistConfig(raw) {
  const asArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.items)) {
      return value.items;
    }
    return [];
  };

  const items = [];
  const seen = new Set();

  asArray(raw).forEach((item) => {
    if (!item || typeof item !== "object") return;
    const id = item.id != null ? String(item.id).trim() : "";
    const label = item.label != null ? String(item.label).trim() : "";
    if (!id || !label || seen.has(id)) return;
    seen.add(id);

    const section = item.section != null
      ? String(item.section).trim()
      : item.depotSection != null
        ? String(item.depotSection).trim()
        : "";

    const cloneMaterials = () => {
      if (!Array.isArray(item.materials)) return [];
      return item.materials
        .map((mat) => {
          if (!mat || typeof mat !== "object") return null;
          const itemName = mat.item != null ? String(mat.item).trim() : "";
          if (!itemName) return null;
          const qtyNum = Number(mat.qty);
          const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;
          return {
            category: mat.category != null ? String(mat.category).trim() : "Misc",
            item: itemName,
            qty,
            notes: mat.notes != null ? String(mat.notes).trim() : ""
          };
        })
        .filter(Boolean);
    };

    items.push({
      id,
      group: item.group != null ? String(item.group).trim() : "",
      section,
      depotSection: section || undefined,
      label,
      hint: item.hint != null ? String(item.hint).trim() : "",
      plainText: item.plainText != null ? String(item.plainText).trim() : "",
      naturalLanguage: item.naturalLanguage != null ? String(item.naturalLanguage).trim() : "",
      materials: cloneMaterials()
    });
  });

  let sectionsOrder = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.sectionsOrder)) {
    sectionsOrder = raw.sectionsOrder
      .map((name) => String(name || "").trim())
      .filter(Boolean);
  }

  return {
    items,
    sectionsOrder
  };
}

function cloneChecklistItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    materials: Array.isArray(item.materials)
      ? item.materials.map((mat) => ({ ...mat }))
      : []
  }));
}

const DEFAULT_SCHEMA_INFO = buildSchemaInfo(schemaConfig);
const DEFAULT_CHECKLIST_CONFIG = sanitiseChecklistConfig(checklistConfig);

function getSchemaInfoFromPayload(raw) {
  const rawArrayLength = Array.isArray(raw)
    ? raw.length
    : raw && Array.isArray(raw.sections)
      ? raw.sections.length
      : 0;
  if (rawArrayLength > 0) {
    return buildSchemaInfo(raw);
  }
  return DEFAULT_SCHEMA_INFO;
}
