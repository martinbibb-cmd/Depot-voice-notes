import checklistConfig from "../checklist.config.json" assert { type: "json" };
import depotSchema from "../depot.output.schema.json" assert { type: "json" };

let __CONFIG_CACHE = { at: 0, data: null };
const CONFIG_TTL_MS = 5 * 60 * 1000;

const BUILTIN_SECTION_FALLBACK = [
  { name: "Needs", order: 1 },
  { name: "Working at heights", order: 2 },
  { name: "System characteristics", order: 3 },
  { name: "Components that require assistance", order: 4 },
  { name: "Restrictions to work", order: 5 },
  { name: "External hazards", order: 6 },
  { name: "Delivery notes", order: 7 },
  { name: "Office notes", order: 8 },
  { name: "New boiler and controls", order: 9 },
  { name: "Flue", order: 10 },
  { name: "Pipe work", order: 11 },
  { name: "Disruption", order: 12 },
  { name: "Customer actions", order: 13 },
  { name: "Future plans", order: 14 }
];

const DEFAULT_SECTION_META = normaliseSectionMeta(
  depotSchema?.sections || BUILTIN_SECTION_FALLBACK
);
const DEFAULT_CHECKLIST_ITEMS = normaliseChecklistItems(checklistConfig?.items || []);
const SECTION_ORDER = Object.fromEntries(
  DEFAULT_SECTION_META.map(sec => [sec.name, typeof sec.order === "number" ? sec.order : 999])
);
const SECTION_NAMES = DEFAULT_SECTION_META.map(sec => sec.name);

async function getConfig(env) {
  const now = Date.now();
  if (__CONFIG_CACHE.data && now - __CONFIG_CACHE.at < CONFIG_TTL_MS) {
    return __CONFIG_CACHE.data;
  }

  const url = env?.CONFIG_URL;
  const kv = env?.ROUTING;

  let cfg = null;
  if (url) {
    try {
      const r = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 300 } });
      if (r.ok) cfg = await r.json();
    } catch (_) {}
  }

  if (!cfg && kv) {
    try {
      const text = await kv.get("routing.json");
      if (text) cfg = JSON.parse(text);
    } catch (_) {}
  }

  if (!cfg) cfg = defaultRoutingConfig();

  __CONFIG_CACHE = { at: now, data: cfg };
  return cfg;
}

function defaultRoutingConfig() {
  return {
    asr_normalise: [
      ["\\bcombini\\b", "combi"],
      ["\\bglow ?worm\\b", "Glow-worm"],
      ["\\b(2 ?man|two ?man)\\b", "two engineers"],
    ],
    phrase_overrides: {
      "two engineers": "Components that require assistance",
      "double handed": "Components that require assistance",
      "planning permission": "Office notes",
      "listed building": "Office notes",
      "conservation area": "Office notes",
      "permit required": "Restrictions to work"
    },
    intents: {
      controls: [
        "hive", "smart control", "smart thermostat", "controller",
        "receiver", "filter", "magnetic filter", "pump", "valve", "motorised valve", "timer", "thermostat"
      ],
      pipe: [
        "re-?pipe", "reconfigure", "re-?route", "reroute", "extend",
        "increase", "upgrade", "replace", "tidy", "clip",
        "pipe", "pipework", "condensate", "condensate pump",
        "gas run", "gas pipe", "gas supply", "22 ?mm", "32 ?mm"
      ],
      flue: [
        "flue", "plume kit", "terminal", "turret", "rear flue",
        "side flue", "vertical flue", "direct rear", "soffit", "eaves"
      ],
      heights: [
        "loft", "ladder", "ladders", "steps", "tower", "scaffold",
        "edge protection", "bridging tower", "internal scaffold", "headroom"
      ],
      office: [
        "office", "planning", "listed building", "conservation area",
        "permission", "approval", "building control"
      ],
      restrict: [
        "parking", "double yellow", "\\bpermit\\b", "no parking", "access( issues)?", "road closure", "limited access"
      ],
      assist: [
        "two engineers", "double[- ]handed", "2 ?man", "team lift", "second person"
      ],
      disruption: [
        "power ?flush", "flush the system", "system flush", "inhibitor"
      ],
      replaceBoiler: [
        "(replace|swap).*(boiler|combi|system)"
      ]
    }
  };
}

function rxUnion(list, flags = "i") {
  const body = list.map(s => `(?:${s})`).join("|");
  return new RegExp(body || "(?!.)", flags);
}

function applyASRNormalise(s, cfg) {
  let out = String(s || "");
  for (const [pat, rep] of (cfg.asr_normalise || [])) {
    out = out.replace(new RegExp(pat, "gi"), rep);
  }
  return out;
}

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

      const result = await structureDepotNotes(transcript, {
        env,
        expectedSections,
        sectionHints,
        forceStructured,
        checklistItems: data?.checklistItems,
        depotSections: data?.depotSections
      });
      return cors(json({
        summary: result.customerSummary,
        customerSummary: result.customerSummary,
        missingInfo: result.missingInfo,
        checkedItems: result.checkedItems,
        sections: result.sections,
        materials: result.materials,
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
        const result = await structureDepotNotes(transcript, {
          env,
          expectedSections: DEFAULT_SECTION_ORDER_NAMES,
          sectionHints: DEFAULT_SECTION_HINTS,
          forceStructured: true
        });
        payload.customerSummary = result.customerSummary;
        payload.summary = result.customerSummary;
        payload.missingInfo = result.missingInfo;
        payload.checkedItems = result.checkedItems;
        payload.sections = result.sections;
        payload.materials = result.materials;
        payload.depotNotes = { exportedAt: new Date().toISOString(), sections: result.sections };
        payload.depotSectionsSoFar = result.sections;
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
function splitStatements(raw) {
  const text = String(raw || "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const hard = text.split(/(?<=[.!?])\s+/);
  const out = [];
  for (const seg of hard) {
    const bits = seg.split(/\s*(?:—|-|–|,)\s+(?=(?:so|that means|which|we(?:'|’)ll|i(?:'|’)ll|need to|let'?s|then)\b)/i);
    for (const b of bits) {
      const t = b.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function splitClauses(s) {
  // break a routed sentence into smaller, meaningful bits
  return String(s || "")
    .split(/;|—|–|—|,|\band\b|\bbut\b|\bso\b|\bthen\b/i)
    .map(x => x.trim())
    .filter(Boolean);
}
function ensureSemi(s){ s=String(s||"").trim(); return s ? (s.endsWith(";")?s:s+";") : s; }
function stripSequencingPreamble(line){
  // Remove order/agent phrasing at the start of a clause
  let s = String(line||"").trim();
  s = s
    .replace(/^(then|next|first|second|after|before|finally|so)\b[:,\s-]*/i, "")
    .replace(/^(we(?:'|’)ll|we will|i(?:'|’)ll|engineer will|installer will|we need to|need to|we can|we should)\b[:,\s-]*/i, "")
    .replace(/^(please|note|recommend(?:ed)? to)\b[:,\s-]*/i, "");
  // De-agent “will need to” → “required”
  s = s.replace(/\bwill need to\b/gi, "required to");
  // Soften imperatives “fit/install/replace” at start → noun phrase
  s = s.replace(/^(fit|install|replace|repipe|re-pipe|reroute|re-route|upgrade)\b/i, (m)=>m.toLowerCase());
  return s.trim();
}
function bulletify(lines){
  const out=[];
  for (let raw of lines){
    const t = stripSequencingPreamble(raw);
    if (!t) continue;
    out.push("• " + ensureSemi(t));
  }
  return out.join("\n");
}
function endSemi(s) {
  s = String(s || "").trim();
  return s ? (s.endsWith(";") ? s : s + ";") : s;
}
function appendSection(bucket, name, pt, nl = "") {
  const b = bucket.get(name) || { section: name, plainText: "", naturalLanguage: "" };
  if (pt) b.plainText = (b.plainText ? b.plainText + " " : "") + endSemi(pt);
  if (nl) b.naturalLanguage = (b.naturalLanguage ? b.naturalLanguage + " " : "") + nl.trim();
  bucket.set(name, b);
}

function splitGeneralClauses(text){
  return String(text||"")
    .split(/[\n;]+/)
    .map(s=>s.trim()).filter(Boolean);
}

function splitPipeRoute(text){
  const cues = [
    "from ","off the ","pick up ","drop to ","under ","behind ","through ",
    "along ","across ","continue ","then ","past ","to ","into ","up ",
    "come up ","rise in ","down ","fall to "
  ];
  const rx = new RegExp("(?:;|—|–|,)|\\b(" + cues.map(c=>c.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")).join("|") + ")", "ig");
  const bits=[]; let cur="";
  (" "+String(text||"").replace(/\s+/g," ").trim()+" ").split(rx).forEach(ch=>{
    if (!ch) return;
    const isCue = cues.some(c=>ch.toLowerCase().startsWith(c.trim()));
    if (isCue && cur.trim()){ bits.push(cur.trim()); cur=ch; } else { cur += ch; }
  });
  if (cur.trim()) bits.push(cur.trim());
  return bits.map(s=>s.replace(/^and\s+/i,"").trim()).filter(Boolean);
}

function formatPlainTextForSection(section, plain){
  if (!plain) return "";
  const normalized = plain.replace(/^•\s*/gm, "").trim();
  if (!normalized) return "";
  if (section === "Pipe work"){
    const steps = splitPipeRoute(normalized);
    if (steps.length) return bulletify(steps);
  }
  return bulletify(splitGeneralClauses(normalized));
}

const BOILER_TYPES_RX = /\b(combi|combination|system|regular|open[- ]vented|storage combi|highflow)\b/i;
const BRAND_RX = /\b(ideal|worcester(?: bosch)?|vaillant|glow[- ]?worm|viessmann|baxi|main|ariston|alpha|intergas)\b/i;

function extractSystemCharacteristics(text){
  const t = String(text||"");
  const lines = splitGeneralClauses(t);
  let existing = null, proposed = null, cylinder = null, location = null;

  const replaceMatch = t.match(/replace(?:d)?\s+([^.,;]+?)\s+(?:with|by|for)\s+([^.,;]+?)(?:[.;;,]|$)/i);
  if (replaceMatch){
    existing = replaceMatch[1].trim();
    proposed = replaceMatch[2].trim();
  }
  const existingLine = lines.find(l=>/\b(existing|current)\b/i.test(l));
  if (existingLine && !existing) existing = existingLine.replace(/\b(existing|current)\b[:\s-]*/i,"").trim();

  const movingLine = lines.find(l=>/\b(moving to|switching to|new)\b/i.test(l));
  if (movingLine && !proposed) proposed = movingLine.replace(/\b(moving to|switching to|new)\b[:\s-]*/i,"").trim();

  function normModel(s){
    if (!s) return null;
    const brand = (s.match(BRAND_RX)||[])[0] || "";
    const type  = (s.match(BOILER_TYPES_RX)||[])[0] || "";
    return (brand||type) ? `${brand ? capitalise(brand) : ""} ${type ? type.toLowerCase() : ""}`.trim() : s;
  }
  function capitalise(w){ return w ? w[0].toUpperCase()+w.slice(1) : w; }

  const cylMatch = t.match(/\b(mixergy|unvented|vented)\b(?:[^.,;]*\b(\d{2,3})\s*l)?/i);
  if (cylMatch){
    cylinder = cylMatch[1] ? cylMatch[1].toLowerCase() : null;
    if (cylMatch[2]) cylinder += ` ${cylMatch[2]}l`;
  }

  const locMatch = t.match(/\b(kitchen|utility|garage|loft|airing cupboard|bedroom|cupboard|hallway)\b/i);
  if (locMatch) location = locMatch[0].toLowerCase();

  const bullets = [];
  if (existing) bullets.push(`existing: ${normModel(existing)}${location ? `, located in ${location}` : ""}`);
  if (proposed) bullets.push(`proposed: ${normModel(proposed)}${cylinder ? ` + ${cylinder} cylinder` : ""}`);
  if (!existing && /existing|current/i.test(t) && BOILER_TYPES_RX.test(t)) {
    bullets.push(`existing: ${(t.match(BOILER_TYPES_RX)||[])[0].toLowerCase()}`);
  }
  if (!proposed && /\b(new|replace|switching|moving)\b/i.test(t) && BOILER_TYPES_RX.test(t)) {
    const second = [...t.matchAll(BOILER_TYPES_RX)].map(m=>m[0].toLowerCase())[1];
    if (second) bullets.push(`proposed: ${second}`);
  }

  return bullets.length ? bulletify(bullets) : "";
}

function reassignClauses(bucket, intents) {
  const from = bucket.get("Flue");
  if (!from || !from.plainText) return;

  const keep = [];
  const sendHeights = [];
  const sendOffice = [];
  const sendRestr = [];

  for (const clause of splitClauses(from.plainText)) {
    const c = clause.trim();
    // If clause also contains explicit flue bits, keep it in Flue
    if (intents.flue.test(c)) { keep.push(c); continue; }
    // Otherwise test the other strong intents and shunt accordingly
    if (intents.heights.test(c)) { sendHeights.push(c); continue; }
    if (intents.office.test(c)) { sendOffice.push(c); continue; }
    if (intents.restrict.test(c)) { sendRestr.push(c); continue; }
    // If nothing else matches, keep with Flue (defensive)
    keep.push(c);
  }

  // Write back
  from.plainText = keep.map(x => x.endsWith(";") ? x : x + ";").join(" ");
  bucket.set("Flue", from);

  if (sendHeights.length) {
    const t = sendHeights.map(x => x.endsWith(";") ? x : x + ";").join(" ");
    const ex = bucket.get("Working at heights") || { section: "Working at heights", plainText: "", naturalLanguage: "" };
    ex.plainText = (ex.plainText ? ex.plainText + " " : "") + t;
    bucket.set("Working at heights", ex);
  }
  if (sendOffice.length) {
    const t = sendOffice.map(x => x.endsWith(";") ? x : x + ";").join(" ");
    const ex = bucket.get("Office notes") || { section: "Office notes", plainText: "", naturalLanguage: "" };
    ex.plainText = (ex.plainText ? ex.plainText + " " : "") + t;
    bucket.set("Office notes", ex);
  }
  if (sendRestr.length) {
    const t = sendRestr.map(x => x.endsWith(";") ? x : x + ";").join(" ");
    const ex = bucket.get("Restrictions to work") || { section: "Restrictions to work", plainText: "", naturalLanguage: "" };
    ex.plainText = (ex.plainText ? ex.plainText + " " : "") + t;
    bucket.set("Restrictions to work", ex);
  }
}

function firstSubstantiveLine(raw) {
  const lines = splitStatements(raw);
  for (const l of lines) {
    if (/^(test|let[’']?s give this a test|okay|alright|right)\b/i.test(l)) continue;
    return l.slice(0, 180);
  }
  return (lines[0] || "").slice(0, 180);
}
function summariseFlue(statements, flueRx) {
  const all = statements.join(" ").toLowerCase();
  const side = /\b(side flue|turret.*side|kick sideways)\b/.test(all);
  const rear = /\b(rear flue|direct rear|turret rear)\b/.test(all);
  const vertical = /\b(vertical flue|through the roof)\b/.test(all);
  const plume = /\b(plume kit)\b/.test(all);
  const bits = [];
  if (side) bits.push("side/offset turret");
  if (rear) bits.push("rear/turret");
  if (vertical) bits.push("vertical");
  if (plume) bits.push("plume kit");
  return bits.length ? `Flue: ${bits.join(", ")}.` : (flueRx.test(all) ? "Flue: flue changes." : "");
}

function buildIntents(cfg) {
  const i = cfg.intents || {};
  return {
    controls: rxUnion(i.controls || [], "i"),
    pipe: rxUnion(i.pipe || [], "i"),
    flue: rxUnion(i.flue || [], "i"),
    heights: rxUnion(i.heights || [], "i"),
    office: rxUnion(i.office || [], "i"),
    restrict: rxUnion(i.restrict || [], "i"),
    assist: rxUnion(i.assist || [], "i"),
    disruption: rxUnion(i.disruption || [], "i"),
    replaceBoiler: rxUnion(i.replaceBoiler || [], "i")
  };
}

function routeStatement(stmt, intents, overrides, sectionNames = SECTION_NAMES) {
  const s = stmt.trim();
  const low = s.toLowerCase();

  for (const name of sectionNames) {
    const rx = new RegExp("^\\s*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:\\-]", "i");
    if (rx.test(s)) return { section: name, text: s };
  }

  for (const [needle, target] of Object.entries(overrides || {})) {
    if (low.includes(needle.toLowerCase())) return { section: target, text: s };
  }

  if (intents.controls.test(s)) return { section: "New boiler and controls", text: s };
  if (intents.pipe.test(s)) return { section: "Pipe work", text: s };
  if (intents.flue.test(s)) return { section: "Flue", text: s };
  if (intents.heights.test(s)) return { section: "Working at heights", text: s };
  if (intents.office.test(s)) return { section: "Office notes", text: s };
  if (intents.restrict.test(s)) return { section: "Restrictions to work", text: s };
  if (intents.assist.test(s)) return { section: "Components that require assistance", text: s };
  if (intents.disruption.test(s)) return { section: "Disruption", text: s };
  if (intents.replaceBoiler.test(s)) return { section: "System characteristics", text: s };

  return { section: "", text: s };
}

async function structureDepotNotes(input, cfg = {}) {
  const env = cfg.env || {};
  const routingCfg = await getConfig(env);
  const text = applyASRNormalise(String(input || ""), routingCfg);
  const sectionMeta = resolveSectionMeta(cfg.depotSections || routingCfg.depotSections);
  const resolvedSectionOrder = Object.fromEntries(
    sectionMeta.map((sec, idx) => [sec.name, typeof sec.order === "number" ? sec.order : idx + 1])
  );
  const resolvedSectionNames = sectionMeta.map(sec => sec.name);
  const checklistItems = resolveChecklistItems(cfg.checklistItems || routingCfg.checklist);

  const intents = buildIntents(routingCfg);
  const overrides = routingCfg.phrase_overrides || {};
  const statements = splitStatements(text);
  const bucket = new Map();

  for (const stmt of statements) {
    const routed = routeStatement(stmt, intents, overrides, resolvedSectionNames);
    if (routed.section) appendSection(bucket, routed.section, routed.text);
  }

  // clause-level clean-up so Flue doesn't swallow access/office/parking
  reassignClauses(bucket, intents);

  if (statements.some(s => intents.flue.test(s))) {
    const nl = summariseFlue(statements, intents.flue);
    const ex = bucket.get("Flue") || { section: "Flue", plainText: "", naturalLanguage: "" };
    ex.naturalLanguage = (ex.naturalLanguage ? ex.naturalLanguage + " " : "") + nl.trim();
    bucket.set("Flue", ex);
  }

  (function ensureSystemCharacteristics(){
    const sysBullets = extractSystemCharacteristics(input);
    if (sysBullets){
      const existing = bucket.get("System characteristics") || { section:"System characteristics", plainText:"", naturalLanguage:"" };
      existing.plainText = existing.plainText
        ? (sysBullets + "\n" + existing.plainText)
        : sysBullets;
      bucket.set("System characteristics", existing);
    }
  })();

  const merged = new Map();
  for (const [name, obj] of bucket){
    const acc = merged.get(name) || { section:name, plainText:"", naturalLanguage:"" };
    acc.plainText = ((acc.plainText?acc.plainText+" ":"") + (obj.plainText||"")).trim();
    acc.naturalLanguage = ((acc.naturalLanguage?acc.naturalLanguage+" ":"") + (obj.naturalLanguage||"")).trim();
    merged.set(name, acc);
  }

  for (const [name, obj] of merged){
    obj.plainText = formatPlainTextForSection(name, obj.plainText);
    merged.set(name, obj);
  }

  const buildSections = () => {
    const arr = [...merged.values()]
      .map(s => ({
        section: s.section,
        plainText: s.plainText.trim(),
        naturalLanguage: s.naturalLanguage.trim()
      }))
      .filter(s => s.plainText || s.naturalLanguage);
    arr.sort((a, b) => (resolvedSectionOrder[a.section] || 999) - (resolvedSectionOrder[b.section] || 999));
    return arr;
  };

  let sections = buildSections();

  (function duplicateCustomerImpact(){
    const impactRx = /\b(cupboard|wardrobe|furniture|decorating|make good|permit|parking|clear access)\b/i;
    const collected = [];
    for (const obj of merged.values()){
      if (!obj.plainText) continue;
      const lines = obj.plainText.split(/\n/).map(s => s.replace(/^•\s*/,""));
      lines.forEach(l => { if (impactRx.test(l)) collected.push(l); });
    }
    if (collected.length){
      const ca = merged.get("Customer actions") || { section: "Customer actions", plainText: "", naturalLanguage: "" };
      const bullets = bulletify(collected);
      ca.plainText = ca.plainText ? `${ca.plainText}\n${bullets}` : bullets;
      merged.set("Customer actions", ca);
      sections = buildSections();
    }
  })();

  if (cfg.forceStructured && sections.length === 0) {
    const expected = cfg.expectedSections && cfg.expectedSections.length ? cfg.expectedSections : resolvedSectionNames;
    sections = expected.map(n => ({ section: n, plainText: "", naturalLanguage: "" }));
  }

  const FORBIDDEN_AUTO = [
    /flush during commissioning/gi,
    /electrical works at commissioning stage/gi
  ];

  sections = sections.map(sec => {
    let pt = sec.plainText || "";
    let nl = sec.naturalLanguage || "";
    FORBIDDEN_AUTO.forEach(rx => {
      pt = pt.replace(rx, "");
      nl = nl.replace(rx, "");
    });
    return {
      section: sec.section,
      plainText: pt.trim(),
      naturalLanguage: nl.trim()
    };
  });

  const customerSummary = firstSubstantiveLine(text);
  const all = text.toLowerCase();
  const missingInfo = [];
  if (!/\b(hive|smart (?:control|thermostat)|controller)\b/.test(all)) {
    missingInfo.push({ target: "customer", question: "Do you want a smart control (e.g., Hive)?" });
  }
  if (!/\b(condensate)\b/.test(all)) {
    missingInfo.push({ target: "engineer", question: "Confirm condensate route and termination." });
  }

  const checkedItems = computeCheckedItems(input, text, sections, checklistItems);
  const materials = inferMaterials(input, sections);

  return { sections, customerSummary, missingInfo, checkedItems, materials };
}

const DEFAULT_SECTION_ORDER_NAMES = SECTION_NAMES;
const DEFAULT_SECTION_HINTS = {};

function resolveChecklistItems(overrides) {
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    if (Array.isArray(overrides.items)) {
      return normaliseChecklistItems(overrides.items);
    }
  }
  if (Array.isArray(overrides) && overrides.length) {
    const normalised = normaliseChecklistItems(overrides);
    return normalised.length ? normalised : DEFAULT_CHECKLIST_ITEMS;
  }
  return DEFAULT_CHECKLIST_ITEMS;
}

function normaliseChecklistItems(items) {
  if (items && typeof items === "object" && !Array.isArray(items)) {
    if (Array.isArray(items.items)) return normaliseChecklistItems(items.items);
  }
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    if (!raw) continue;
    if (raw.__normalized) { out.push(raw); continue; }
    const id = raw.id != null ? String(raw.id).trim() : "";
    if (!id) continue;
    const normalised = {
      id,
      group: raw.group || raw.category || "",
      section: raw.section || raw.sectionName || "",
      label: raw.label || raw.name || id,
      hint: raw.hint || raw.description || "",
      match: normaliseChecklistMatch(raw.match)
    };
    Object.defineProperty(normalised, "__normalized", { value: true, enumerable: false });
    out.push(normalised);
  }
  return out;
}

function normaliseChecklistMatch(match) {
  if (match && match.__normalized) return match;
  if (!match) {
    const empty = { any: [], all: [], not: [] };
    Object.defineProperty(empty, "__normalized", { value: true, enumerable: false });
    return empty;
  }
  if (typeof match === "string" || match instanceof RegExp) {
    const rx = toRegExp(match);
    const single = { any: rx ? [rx] : [], all: [], not: [] };
    Object.defineProperty(single, "__normalized", { value: true, enumerable: false });
    return single;
  }
  const any = ensureArray(match.any || match.includes || match.patterns || match.regex || match.contains)
    .map(toRegExp)
    .filter(Boolean);
  const all = ensureArray(match.all || match.required)
    .map(toRegExp)
    .filter(Boolean);
  const not = ensureArray(match.not || match.excludes || match.never)
    .map(toRegExp)
    .filter(Boolean);
  const normalised = { any, all, not };
  Object.defineProperty(normalised, "__normalized", { value: true, enumerable: false });
  return normalised;
}

function ensureArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.filter(v => v != null) : [value];
}

function toRegExp(value) {
  if (value instanceof RegExp) return value;
  const str = value != null ? String(value) : "";
  if (!str) return null;
  try {
    return new RegExp(str, "i");
  } catch (_) {
    return null;
  }
}

function normaliseSectionMeta(entries) {
  if (!Array.isArray(entries)) return [];
  const out = [];
  entries.forEach((entry, idx) => {
    if (entry == null) return;
    if (entry.__normalizedSection) { out.push(entry); return; }
    if (typeof entry === "string") {
      const name = entry.trim();
      if (!name) return;
      const obj = { name, order: idx + 1, description: "" };
      Object.defineProperty(obj, "__normalizedSection", { value: true, enumerable: false });
      out.push(obj);
      return;
    }
    const name = String(entry.name || entry.section || "").trim();
    if (!name) return;
    const order = typeof entry.order === "number" ? entry.order : idx + 1;
    const description = String(entry.description || entry.hint || "").trim();
    const obj = { name, order, description };
    Object.defineProperty(obj, "__normalizedSection", { value: true, enumerable: false });
    out.push(obj);
  });
  return out;
}

function resolveSectionMeta(overrides) {
  let candidate = overrides;
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    if (Array.isArray(overrides.sections)) candidate = overrides.sections;
  }
  const meta = normaliseSectionMeta(candidate);
  if (meta.length) return meta;
  return DEFAULT_SECTION_META;
}

function computeCheckedItems(transcriptRaw, normalizedText, sections, checklistItems) {
  const sectionText = (sections || [])
    .map(sec => `${sec.section || ""}: ${sec.plainText || ""} ${sec.naturalLanguage || ""}`)
    .join(" ");
  const haystack = `${transcriptRaw || ""} ${normalizedText || ""} ${sectionText}`.trim();
  if (!haystack) return [];
  const out = [];
  const seen = new Set();
  for (const item of checklistItems || []) {
    if (!item || !item.id || seen.has(item.id)) continue;
    if (evaluateChecklistMatch(item.match, haystack)) {
      out.push(item.id);
      seen.add(item.id);
    }
  }
  return out;
}

function evaluateChecklistMatch(match, haystack) {
  if (!match || !haystack) return false;
  const { any = [], all = [], not = [] } = match;
  if (not.length && not.some(rx => regexTest(rx, haystack))) {
    // if any exclusion matches, bail out
    return false;
  }
  if (all.length && !all.every(rx => regexTest(rx, haystack))) {
    return false;
  }
  if (any.length) {
    if (!any.some(rx => regexTest(rx, haystack))) return false;
  } else if (!all.length) {
    return false;
  }
  return true;
}

function regexTest(pattern, haystack) {
  if (!pattern) return false;
  try {
    if (pattern instanceof RegExp) {
      pattern.lastIndex = 0;
      return pattern.test(haystack);
    }
    const rx = new RegExp(pattern, "i");
    return rx.test(haystack);
  } catch (_) {
    return false;
  }
}

function inferMaterials(transcriptRaw, sections) {
  const raw = String(transcriptRaw || "");
  const sectionText = (sections || [])
    .map(sec => `${sec.section || ""}: ${sec.plainText || ""} ${sec.naturalLanguage || ""}`)
    .join(" ");
  const combined = `${raw} ${sectionText}`.trim();
  if (!combined) return [];

  const materials = [];
  const seen = new Set();
  const add = (category, item, qty = 1, notes = "") => {
    const clean = cleanupMaterial(item);
    if (!clean) return;
    const normalisedNotes = cleanupMaterial(notes);
    const key = `${category}|${clean}|${normalisedNotes}`.toLowerCase();
    if (seen.has(key)) return;
    materials.push({
      category,
      item: clean,
      qty: typeof qty === "number" && qty > 0 ? qty : 1,
      notes: normalisedNotes || ""
    });
    seen.add(key);
  };

  const boilerPatterns = [
    "\\b(?:worcester(?: bosch)?|vaillant|glow[- ]?worm|viessmann|baxi|ideal|alpha|intergas|ariston|main)\\b[^.\n]{0,80}\\b(?:boiler|combi|system|regular|heat only)\\b",
    "\\b(?:combi|system|regular|heat only|storage combi|highflow)\\b[^.\n]{0,80}\\bboiler\\b"
  ];
  const boiler = extractFirstMatch(raw, boilerPatterns) || extractFirstMatch(combined, boilerPatterns);
  if (boiler) add("Boiler", boiler);

  const cylinderPatterns = [
    "\\b(?:mixergy|megaflo|joule|ideal|glow[- ]?worm|baxi|main|ariston|vaillant)\\b[^.\n]{0,80}\\b(?:cylinder|store)\\b",
    "\\b(?:unvented|open vent(?:ed)?|vented|thermal store|thermal battery)\\b[^.\n]{0,60}\\b(?:cylinder|store)\\b",
    "\\b\\d{2,3}\s*(?:l|litre|liter)\\b[^.\n]{0,40}\\b(?:cylinder|store)\\b"
  ];
  const cylinder = extractFirstMatch(raw, cylinderPatterns) || extractFirstMatch(combined, cylinderPatterns);
  if (cylinder) add("Cylinder", cylinder);

  const controlPatterns = [
    "\\bHive\\b[^.\n]{0,40}(?:control|thermostat|receiver)",
    "\\bNest\\b[^.\n]{0,40}(?:control|thermostat)",
    "smart control",
    "\\bwireless (?:stat|thermostat)\\b"
  ];
  const control = extractFirstMatch(combined, controlPatterns);
  if (control) add("Controls", control);

  const filterPatterns = [
    "\\b\\d{2}\s*mm[^.\n]{0,40}(?:magnetic|system|dirt) filter\\b",
    "\\b(?:magnetic|system|dirt) filter\\b[^.\n]{0,40}"
  ];
  const filter = extractFirstMatch(combined, filterPatterns);
  if (filter) add("Filter", filter);

  const flushPatterns = [
    "\\b(?:power|mains|chemical) flush\\b[^.\n]{0,40}",
    "\\bsystem (?:power )?flush\\b[^.\n]{0,40}",
    "\\bsystem clean\\b[^.\n]{0,40}"
  ];
  const flush = extractFirstMatch(combined, flushPatterns);
  if (flush) {
    const radMatch = combined.match(/(\d+)\s*(?:rads?|radiators?)/i);
    const notes = radMatch ? `${radMatch[1]} radiators mentioned` : "";
    add("System clean", flush, 1, notes);
  }

  const verticalFlue = extractFirstMatch(combined, ["\\bvertical flue[^.\n]{0,40}"]);
  if (verticalFlue) add("Flue", verticalFlue);
  const rearFlue = extractFirstMatch(combined, ["\\b(?:rear|turret rear) flue[^.\n]{0,40}", "\\brear flue\\b"]);
  if (rearFlue) add("Flue", rearFlue);
  const sideFlue = extractFirstMatch(combined, ["\\b(?:side|turret side) flue[^.\n]{0,40}", "\\bside flue\\b"]);
  if (sideFlue) add("Flue", sideFlue);
  const plumeMatches = findAllMatches(combined, /\bplume kit\b[^.\n]{0,40}/gi);
  plumeMatches.forEach(item => add("Flue", item));

  const condensatePump = extractFirstMatch(combined, ["\\bcondensate pump\b[^.\n]{0,40}"]);
  if (condensatePump) add("Misc", condensatePump);

  return materials;
}

function extractFirstMatch(text, patterns) {
  const haystack = String(text || "");
  if (!haystack) return null;
  for (const pat of patterns || []) {
    const rx = toRegExp(pat);
    if (!rx) continue;
    rx.lastIndex = 0;
    const m = rx.exec(haystack);
    if (m && m[0]) return cleanupMaterial(m[0]);
  }
  return null;
}

function findAllMatches(text, pattern) {
  const haystack = String(text || "");
  if (!haystack) return [];
  let rx;
  if (pattern instanceof RegExp) {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    rx = new RegExp(pattern.source, flags);
  } else {
    rx = new RegExp(String(pattern), "ig");
  }
  const out = [];
  let m;
  while ((m = rx.exec(haystack))) {
    if (m[0]) out.push(cleanupMaterial(m[0]));
    if (!rx.global) break;
  }
  return out;
}

function cleanupMaterial(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:.-]+/, "")
    .replace(/[\s,;:.-]+$/, "")
    .trim();
}

