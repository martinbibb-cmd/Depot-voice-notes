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

// Canonical keyword → section map (lowercase)
const HINTS_DEFAULT = {
  // controls
  "hive": "New boiler and controls",
  "smart control": "New boiler and controls",
  "smart thermostat": "New boiler and controls",
  "controller": "New boiler and controls",
  "control": "New boiler and controls",
  "magnetic filter": "New boiler and controls",
  "filter": "New boiler and controls",
  "pump": "New boiler and controls",
  "valve": "New boiler and controls",
  "motorised valve": "New boiler and controls",

  // pipework
  "condensate": "Pipe work",
  "condensate pump": "Pipe work",
  "condensate upgrade": "Pipe work",
  "pipework": "Pipe work",
  "pipe work": "Pipe work",
  "pipe": "Pipe work",
  "gas run": "Pipe work",
  "gas pipe": "Pipe work",
  "gas supply": "Pipe work",
  "increase gas": "Pipe work",
  "increasing the gas": "Pipe work",

  // flue
  "plume kit": "Flue",
  "terminal": "Flue",
  "turret": "Flue",
  "rear flue": "Flue",
  "side flue": "Flue",
  "vertical flue": "Flue",
  "direct rear": "Flue",
  "offset": "Flue",

  // heights
  "ladders": "Working at heights",
  "ladder": "Working at heights",
  "steps": "Working at heights",
  "loft": "Working at heights",
  "tower": "Working at heights",
  "scaffold": "Working at heights",
  "edge protection": "Working at heights",
  "bridging tower": "Working at heights",
  "internal scaffold": "Working at heights",

  // restrictions
  "parking": "Restrictions to work",
  "permit": "Restrictions to work",
  "no parking": "Restrictions to work",
  "double yellow": "Restrictions to work",
  "access": "Restrictions to work",

  // office/admin
  "planning permission": "Office notes",
  "listed building": "Office notes",
  "conservation area": "Office notes",
  "needs permission": "Office notes",

  // assistance
  "double handed": "Components that require assistance",
  "double-hand": "Components that require assistance",
  "2 man": "Components that require assistance",
  "two man": "Components that require assistance",
  "two engineers": "Components that require assistance",
  "2 engineers": "Components that require assistance",

  // disruption trigger
  "power flush": "Disruption",
  "powerflush": "Disruption"
};

function norm(s){ return String(s || "").trim(); }
function lc(s){ return norm(s).toLowerCase(); }
function endsSemi(s){ return s.endsWith(";") ? s : (s + ";"); }
function dedupeWhitespace(s){ return norm(s).replace(/\s+/g," "); }

function splitIntoLines(text){
  const raw = String(text || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap(line => line.split(/(?<=[.?!])\s+(?=[A-Z])/));
  return raw.map(s => s.trim()).filter(Boolean);
}

function normaliseForRouting(s){
  let t = lc(s);
  t = t.replace(/\bcombini\b/g, "combi"); // ASR typo
  return t;
}

function routeLine(line, hints){
  const l = normaliseForRouting(line);

  // explicit section headers like "Flue:" or "Pipe work - ..."
  for (const name of SECTION_NAMES){
    const rx = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")}\\s*[:\\-]`, "i");
    if (rx.test(line)) return name;
  }
  // keyword routing
  for (const [kw, sec] of Object.entries(hints)){
    if (l.includes(kw)) return sec;
  }
  return ""; // unclassified
}

function appendSection(bucket, name, ptAdd, nlAdd=""){
  const b = bucket.get(name) || { section: name, plainText: "", naturalLanguage: "" };
  if (ptAdd) b.plainText = (b.plainText ? b.plainText + " " : "") + endsSemi(ptAdd.trim());
  if (nlAdd) b.naturalLanguage = (b.naturalLanguage ? b.naturalLanguage + " " : "") + nlAdd.trim();
  bucket.set(name, b);
}

function summariseFlue(allText){
  const t = lc(allText);
  const side = /\bside flue\b/.test(t) || /\bturret to the side flue\b/.test(t);
  const rear = /\brear flue\b/.test(t) || /\bturret rear flue\b/.test(t) || /\bdirect rear\b/.test(t);
  const vertical = /\bvertical flue\b/.test(t);
  let bits = [];
  if (side) bits.push("side/offset turret");
  if (rear) bits.push("rear/turret");
  if (vertical) bits.push("vertical");
  if (/\bplume kit\b/.test(t)) bits.push("plume kit");
  if (!bits.length && /\bflue\b/.test(t)) bits.push("flue changes");
  return bits.length ? `Flue: ${bits.join(", ")}.` : "";
}

function structureDepotNotes(input, cfg = {}){
  const expected = Array.isArray(cfg.expectedSections) && cfg.expectedSections.length ? cfg.expectedSections : SECTION_NAMES;
  const userHints = cfg.sectionHints && Object.keys(cfg.sectionHints).length ? cfg.sectionHints : HINTS_DEFAULT;
  const forceStructured = !!cfg.forceStructured;

  const lines = splitIntoLines(input);
  const bucket = new Map();

  // 1) Route each line
  for (const line of lines){
    const target = routeLine(line, userHints);
    if (!target) continue;
    appendSection(bucket, target, line);
  }

  // 2) Post-rules (merges/normalisation)
  // Controls: ensure Hive/filter land in controls
  for (const [name, obj] of [...bucket]) {
    if (name === "New boiler and controls") continue;
    const l = lc(obj.plainText + " " + obj.naturalLanguage);
    if (/\b(hive|smart control|smart thermostat|controller|control|magnetic filter|filter|pump|valve|motorised valve)\b/.test(l)){
      appendSection(bucket, "New boiler and controls", obj.plainText, obj.naturalLanguage);
      bucket.delete(name);
    }
  }

  // Pipe work: condensate / pipe / gas supply
  for (const [name, obj] of [...bucket]) {
    if (name === "Pipe work") continue;
    const l = lc(obj.plainText + " " + obj.naturalLanguage);
    if (/\b(condensate|condensate pump|pipework|pipe|gas run|gas pipe|gas supply|increase gas|increasing the gas)\b/.test(l)){
      appendSection(bucket, "Pipe work", obj.plainText, obj.naturalLanguage);
      bucket.delete(name);
    }
  }

  // Restrictions to work
  for (const [name, obj] of [...bucket]) {
    if (name === "Restrictions to work") continue;
    const l = lc(obj.plainText + " " + obj.naturalLanguage);
    if (/\b(parking|permit|no parking|double yellow|access)\b/.test(l)){
      appendSection(bucket, "Restrictions to work", obj.plainText, obj.naturalLanguage);
      bucket.delete(name);
    }
  }

  // Office notes
  for (const [name, obj] of [...bucket]) {
    if (name === "Office notes") continue;
    const l = lc(obj.plainText + " " + obj.naturalLanguage);
    if (/\b(planning permission|listed building|conservation area|needs permission)\b/.test(l)){
      appendSection(bucket, "Office notes", obj.plainText, obj.naturalLanguage);
      bucket.delete(name);
    }
  }

  // Components that require assistance
  for (const [name, obj] of [...bucket]) {
    if (name === "Components that require assistance") continue;
    const l = lc(obj.plainText + " " + obj.naturalLanguage);
    if (/\b(double handed|double-hand|2 ?man|two (man|engineers)|2 engineers)\b/.test(l)){
      appendSection(bucket, "Components that require assistance", obj.plainText, obj.naturalLanguage);
      bucket.delete(name);
    }
  }

  // Disruption (single entry only if power flush anywhere)
  const allText = lines.join(" ");
  if (/\bpower ?flush\b/i.test(allText)) {
    bucket.set("Disruption", {
      section: "Disruption",
      plainText: "✅ Power flush to be carried out | Allow extra time and clear access;",
      naturalLanguage: "A power flush will be carried out, so extra time and access are needed."
    });
  }

  // Flue summary: if any flue/turret/plume keywords present, add a clean NL line
  if (/\b(flue|turret|plume|terminal|rear flue|side flue|vertical flue|direct rear)\b/i.test(allText)) {
    const summary = summariseFlue(allText);
    if (summary) {
      const existing = bucket.get("Flue") || { section: "Flue", plainText: "", naturalLanguage: "" };
      existing.naturalLanguage = dedupeWhitespace((existing.naturalLanguage ? existing.naturalLanguage + " " : "") + summary);
      bucket.set("Flue", existing);
    }
  }

  // 3) Build ordered list, ensure semicolons, remove empties & duplicates
  let sections = [...bucket.values()]
    .map(s => ({
      section: s.section,
      plainText: norm(s.plainText).split(/\s*;\s*/).filter(Boolean).map(x => endsSemi(x)).join(" "),
      naturalLanguage: norm(s.naturalLanguage)
    }))
    .filter(s => s.plainText || s.naturalLanguage);

  // Coalesce duplicates by section name (defensive)
  const byName = new Map();
  for (const s of sections) {
    const key = s.section;
    if (!byName.has(key)) byName.set(key, { section:key, plainText:"", naturalLanguage:"" });
    const acc = byName.get(key);
    acc.plainText = norm((acc.plainText ? acc.plainText + " " : "") + s.plainText);
    acc.naturalLanguage = norm((acc.naturalLanguage ? acc.naturalLanguage + " " : "") + s.naturalLanguage);
  }
  sections = [...byName.values()];
  sections.sort((a,b) => (SECTION_ORDER[a.section]||999) - (SECTION_ORDER[b.section]||999));

  // 4) Skeleton when forced
  if (forceStructured && sections.length === 0) {
    sections = expected.map(name => ({ section: name, plainText: "", naturalLanguage: "" }));
  }

  // Customer summary: first substantive line (skip “test”, “let’s give this a test” etc.)
  const firstGood = splitIntoLines(input).find(l => !/^test\b/i.test(l) && !/^let['’]s give this a test/i.test(l)) || "";
  const customerSummary = firstGood.slice(0,180);

  // Minimal question stubs
  const missingInfo = [];
  if (!/\b(hive|smart control|controller|smart thermostat)\b/i.test(allText)) {
    missingInfo.push({ target: "customer", question: "Do you want a smart control (e.g., Hive)?" });
  }
  if (!/\b(condensate)\b/i.test(allText)) {
    missingInfo.push({ target: "engineer", question: "Confirm condensate route and termination." });
  }

  return { sections, customerSummary, missingInfo };
}

const DEFAULT_SECTION_ORDER_NAMES = SECTION_NAMES;
const DEFAULT_SECTION_HINTS = HINTS_DEFAULT;

