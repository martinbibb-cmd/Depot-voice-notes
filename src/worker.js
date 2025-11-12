export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    if (request.method === "GET" && url.pathname === "/health") {
      return cors(json({ ok: true, service: "depot-voice-notes" }));
    }

    if (request.method === "POST" && url.pathname === "/api/recommend") {
      const { data } = await readBodyFlexible(request);
      const transcript = data?.transcript ?? data?.text ?? "";
      const expectedSections = data?.expectedSections ?? DEFAULT_SECTION_ORDER_NAMES;
      const sectionHints = data?.sectionHints ?? DEFAULT_SECTION_HINTS;
      const forceStructured = !!(data?.forceStructured);

      const result = structureDepotNotes(transcript, { expectedSections, sectionHints, forceStructured });
      return cors(json({
        summary: result.customerSummary,
        customerSummary: result.customerSummary,
        missingInfo: result.missingInfo,
        depotNotes: { exportedAt: new Date().toISOString(), sections: result.sections },
        depotSectionsSoFar: result.sections
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/transcribe") {
      // Accept either raw audio or JSON with audioDataUrl
      const ct = request.headers.get("content-type") || "";
      let audioBytes;

      if (ct.startsWith("application/json") || ct.startsWith("text/plain")) {
        const { data } = await readBodyFlexible(request);
        const dataUrl = data?.audioDataUrl || data?.dataUrl || null;
        if (!dataUrl || !/^data:audio\/[\w+.-]+;base64,/.test(dataUrl)) {
          return cors(bad(400, { error: "Provide audioDataUrl as a valid data:audio/*;base64,..." }));
        }
        const b64 = dataUrl.split(",")[1];
        audioBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      } else {
        // Raw bytes
        const buf = await request.arrayBuffer();
        audioBytes = new Uint8Array(buf);
      }

      let transcript = "";

      // Optional STT via OpenAI Whisper if OPENAI_API_KEY is configured
      if (env.OPENAI_API_KEY) {
        try {
          // Multipart form per OpenAI audio transcription API (whisper-1)
          const form = new FormData();
          // Build a File from bytes; Workers support this in 2025 runtimes
          form.append("file", new File([audioBytes], "audio.webm", { type: "audio/webm" }));
          form.append("model", "whisper-1");
          const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
            body: form
          });
          const txt = await r.text();
          let j; try { j = JSON.parse(txt); } catch {}
          if (!r.ok) throw new Error(`Whisper ${r.status}: ${txt.slice(0,200)}`);
          transcript = j?.text || "";
        } catch (e) {
          console.warn("Whisper failed:", e);
          // Fall through: return empty transcript rather than 5xx
        }
      }

      // Return something useful even if STT not configured
      const payload = { ok: true, transcript };

      // If we did get text, also structure it so the client can render immediately
      if (transcript) {
        const result = structureDepotNotes(transcript, {
          expectedSections: DEFAULT_SECTION_ORDER_NAMES,
          sectionHints: DEFAULT_SECTION_HINTS,
          forceStructured: true
        });
        payload.depotNotes = { exportedAt: new Date().toISOString(), sections: result.sections };
      }

      return cors(json(payload));
    }

    return cors(bad(404, { error: "Not found" }));
  }
};

/* ---------- shared helpers ---------- */
function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
function bad(status, obj) { return json(obj, status); }

async function readBodyFlexible(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return { data: await request.json() }; } catch {}
    return { data: {} };
  }
  const text = await request.text();
  try { return { data: text ? JSON.parse(text) : {} }; } catch { return { data: { text } }; }
}

/* ---------- structuring logic ---------- */
const SECTION_ORDER = {
  "Needs": 1,
  "Working at heights": 2,
  "System characteristics": 3,
  "Components that require assistance": 4,
  "Restrictions to work": 5,
  "External hazards": 6,
  "Delivery notes": 7,
  "Office notes": 8,
  "New boiler and controls": 9,
  "Flue": 10,
  "Pipe work": 11,
  "Disruption": 12,
  "Customer actions": 13,
  "Future plans": 14
};
const SECTION_NAMES = Object.keys(SECTION_ORDER);

/* ---------- Phase-aware helpers ---------- */

const ASR_NORMALISE = [
  [/\bcombini\b/gi, "combi"],
  [/\bglow ?worm\b/gi, "Glow-worm"],
  [/\b(2 ?man|two ?man)\b/gi, "two engineers"],
];

function normText(s){ return String(s||"").trim(); }
function lc(s){ return normText(s).toLowerCase(); }
function endSemi(s){ s = normText(s); return !s ? s : (s.endsWith(";") ? s : s + ";"); }
function escapeRx(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

function normaliseASR(s){
  let out = String(s||"");
  for (const [rx, rep] of ASR_NORMALISE) out = out.replace(rx, rep);
  return out;
}

// Split real speech into "statements" — not just sentences.
// Break on ., !, ?, line breaks, AND soft cue words/commas.
function splitStatements(raw){
  const text = normaliseASR(raw).replace(/\r/g," ").replace(/\s+/g," ").trim();
  if (!text) return [];
  // Hard splits on sentence ends
  const hard = text.split(/(?<=[.!?])\s+/);
  // Then soften further on cue phrases/comma followed by verbs
  const out = [];
  for (const seg of hard){
    const bits = seg.split(/\s*(?:—|-|–|,)\s+(?=(?:so|that means|which|we(?:'|’)ll|i(?:'|’)ll|need to|let'?s|then)\b)/i);
    for (const b of bits){
      const t = b.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/* ---------- Intent classification ---------- */

// Core verb families (lowercase tests)
const INTENT = {
  controls: /\b(fit|install|swap|replace|upgrade|add|set up|commission)\b.*\b(hive|smart (?:control|thermostat)|controller|receiver|filter|magnetic filter|pump|valve|motorised valve|timer|thermostat)\b/i,

  pipe: /\b(re-?pipe|repiping|reconfigure|reroute|re-?route|extend|increase|upgrade|replace|tidy|clip)\b.*\b(pipe|pipework|condensate|condensate pump|gas (?:run|pipe|supply)|22 ?mm|32 ?mm)\b/i,

  flue: /\b(flue|plume kit|terminal|turret|rear flue|side flue|vertical flue|direct rear|soffit|eaves)\b/i,

  heights: /\b(loft|ladder|ladders|steps|tower|scaffold|edge protection|bridging tower|internal scaffold|headroom)\b/i,

  office: /\b(office|planning|listed building|conservation area|permission|permit application|approval|sign[- ]off|building control)\b/i,

  restrict: /\b(parking|double yellow|permit\b|no parking|access(?: issues)?|road closure|limited access)\b/i,

  assist: /\b(two engineers|double[- ]handed|2 ?man|team lift|second person)\b/i,

  disruption: /\b(power ?flush|flush the system|system flush|inhibitor)\b/i,

  // fallbacks
  replaceBoiler: /\b(replace|swap)\b.*\b(boiler|combi|system)\b/i,
};

/* ---------- Routing ---------- */

function appendSection(bucket, name, pt, nl=""){
  if (!name) return;
  const b = bucket.get(name) || { section: name, plainText: "", naturalLanguage: "" };
  if (pt) b.plainText = (b.plainText ? b.plainText + " " : "") + endSemi(pt);
  if (nl) b.naturalLanguage = (b.naturalLanguage ? b.naturalLanguage + " " : "") + nl.trim();
  bucket.set(name, b);
}

function routeStatement(stmt){
  const s = stmt.trim();
  const low = lc(s);

  // Explicit section headers if user dictates them
  for (const name of SECTION_NAMES){
    const rx = new RegExp("^\\s*" + escapeRx(name) + "\\s*[:\\-]");
    if (rx.test(s)) return { section: name, text: s };
  }

  // Priority routing: some statements match multiple intents; choose the most specific
  if (INTENT.controls.test(s)) return { section: "New boiler and controls", text: s };
  if (INTENT.pipe.test(s))     return { section: "Pipe work", text: s };
  if (INTENT.flue.test(s))     return { section: "Flue", text: s };
  if (INTENT.heights.test(s))  return { section: "Working at heights", text: s };
  if (INTENT.office.test(s))   return { section: "Office notes", text: s };
  if (INTENT.restrict.test(s)) return { section: "Restrictions to work", text: s };
  if (INTENT.assist.test(s))   return { section: "Components that require assistance", text: s };
  if (INTENT.disruption.test(s)) return { section: "Disruption", text: "✅ Power flush to be carried out | Allow extra time and clear access;" };

  // Boiler replacement mentions without specific parts → treat as overall System characteristics
  if (INTENT.replaceBoiler.test(s)) return { section: "System characteristics", text: s };

  // No route
  return { section: "", text: s };
}

function summariseFlueFromAll(statements){
  const all = lc(statements.join(" "));
  const side = /\b(side flue|turret.*side|kick sideways)\b/.test(all);
  const rear = /\b(rear flue|direct rear|turret rear)\b/.test(all);
  const vertical = /\b(vertical flue|through the roof)\b/.test(all);
  const plume = /\b(plume kit)\b/.test(all);

  const bits = [];
  if (side) bits.push("side/offset turret");
  if (rear) bits.push("rear/turret");
  if (vertical) bits.push("vertical");
  if (plume) bits.push("plume kit");
  return bits.length ? `Flue: ${bits.join(", ")}.` : "";
}

function firstSubstantiveLine(raw){
  const lines = splitStatements(raw);
  for (const l of lines){
    if (/^(test|let[’']?s give this a test|okay|alright|right)\b/i.test(l)) continue;
    return l.slice(0,180);
  }
  return (lines[0] || "").slice(0,180);
}

/* ---------- Main structurer ---------- */

function structureDepotNotes(input, cfg = {}){
  const bucket = new Map();
  const statements = splitStatements(input);

  // Route each statement
  for (const stmt of statements){
    const routed = routeStatement(stmt);
    if (routed.section) appendSection(bucket, routed.section, routed.text);
  }

  // Flue: add a clean NL summary if we saw any flue context
  if (statements.some(s => INTENT.flue.test(s))){
    const summary = summariseFlueFromAll(statements);
    if (summary){
      const exist = bucket.get("Flue") || { section: "Flue", plainText: "", naturalLanguage: "" };
      exist.naturalLanguage = (exist.naturalLanguage ? exist.naturalLanguage + " " : "") + summary;
      bucket.set("Flue", exist);
    }
  }

  // Disruption de-dupe: ensure exactly one standard line if “flush” was mentioned anywhere
  const flushMentioned = statements.some(s => INTENT.disruption.test(s));
  if (flushMentioned){
    bucket.set("Disruption", {
      section: "Disruption",
      plainText: "✅ Power flush to be carried out | Allow extra time and clear access;",
      naturalLanguage: "A power flush will be carried out, so extra time and access are needed."
    });
  }

  // Merge & order
  const merged = new Map();
  for (const [name, obj] of bucket){
    const acc = merged.get(name) || { section: name, plainText: "", naturalLanguage: "" };
    acc.plainText = normText((acc.plainText ? acc.plainText + " " : "") + obj.plainText);
    acc.naturalLanguage = normText((acc.naturalLanguage ? acc.naturalLanguage + " " : "") + obj.naturalLanguage);
    merged.set(name, acc);
  }
  let sections = [...merged.values()].filter(s => s.plainText || s.naturalLanguage);
  sections.sort((a,b) => (SECTION_ORDER[a.section]||999) - (SECTION_ORDER[b.section]||999));

  // Force skeleton if requested
  if (cfg.forceStructured && sections.length === 0){
    sections = (cfg.expectedSections && cfg.expectedSections.length ? cfg.expectedSections : SECTION_NAMES)
      .map(n => ({ section: n, plainText: "", naturalLanguage: "" }));
  }

  // Customer summary & minimal questions
  const customerSummary = firstSubstantiveLine(input);
  const all = lc(input);
  const missingInfo = [];
  if (!/\b(hive|smart (?:control|thermostat)|controller)\b/.test(all)){
    missingInfo.push({ target: "customer", question: "Do you want a smart control (e.g., Hive)?" });
  }
  if (!/\b(condensate)\b/.test(all)){
    missingInfo.push({ target: "engineer", question: "Confirm condensate route and termination." });
  }

  return { sections, customerSummary, missingInfo };
}

const DEFAULT_SECTION_ORDER_NAMES = SECTION_NAMES;
const DEFAULT_SECTION_HINTS = {};

