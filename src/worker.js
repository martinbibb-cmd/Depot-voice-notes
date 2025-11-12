let __CONFIG_CACHE = { at: 0, data: null };
const CONFIG_TTL_MS = 5 * 60 * 1000;

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

      const result = await structureDepotNotes(transcript, { env, expectedSections, sectionHints, forceStructured });
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
        const result = await structureDepotNotes(transcript, {
          env,
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
function ensureSemi(s) { s = String(s || "").trim(); return s ? (s.endsWith(";") ? s : s + ";") : s; }
function bulletifyLines(lines){
  const out = [];
  for (let raw of lines){
    const t = String(raw || "").trim();
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
  return String(text || "")
    .split(/(?:;|—|–|,| and | but | so | then)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
}

function splitPipeRoute(text){
  const t = " " + String(text || "").replace(/\s+/g," ").trim() + " ";
  const cues = [
    "from ", "off the ", "pick up ", "drop to ",
    "under ", "behind ", "through ", "along ", "across ",
    "continue ", "then ", "past ", "to ", "into ",
    "up ", "come up ", "rise in ", "down ", "fall to "
  ];
  const rx = new RegExp("(?:;|—|–|,)|\\b(" + cues.map(x => x.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")).join("|") + ")", "ig");

  const bits = [];
  let cur = "";
  t.split(rx).forEach(chunk => {
    if (!chunk) return;
    const isCue = cues.some(c => chunk.toLowerCase().startsWith(c.trim()));
    if (isCue && cur.trim()){
      bits.push(cur.trim());
      cur = chunk;
    } else {
      cur += (cur ? "" : "") + chunk;
    }
  });
  if (cur.trim()) bits.push(cur.trim());

  return bits
    .map(s => s.replace(/\s+/g," ").replace(/^and\s+/i,"").trim())
    .filter(Boolean);
}

function formatPlainTextForSection(sectionName, plainText){
  if (!plainText) return "";
  if (/^Pipe work$/i.test(sectionName)){
    const steps = splitPipeRoute(plainText);
    if (steps.length) return bulletifyLines(steps);
  }
  return bulletifyLines(splitGeneralClauses(plainText));
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

function routeStatement(stmt, intents, overrides) {
  const s = stmt.trim();
  const low = s.toLowerCase();

  for (const name of SECTION_NAMES) {
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
  if (intents.disruption.test(s)) {
    return { section: "Disruption", text: "✅ Power flush to be carried out | Allow extra time and clear access;" };
  }
  if (intents.replaceBoiler.test(s)) return { section: "System characteristics", text: s };

  return { section: "", text: s };
}

async function structureDepotNotes(input, cfg = {}) {
  const env = cfg.env || {};
  const routingCfg = await getConfig(env);
  const text = applyASRNormalise(String(input || ""), routingCfg);

  const intents = buildIntents(routingCfg);
  const overrides = routingCfg.phrase_overrides || {};
  const statements = splitStatements(text);
  const bucket = new Map();

  for (const stmt of statements) {
    const routed = routeStatement(stmt, intents, overrides);
    if (routed.section) appendSection(bucket, routed.section, routed.text);
  }

  // clause-level clean-up so Flue doesn't swallow access/office/parking
  reassignClauses(bucket, intents);

  // Single Disruption line if any disruption intent matched (and remove any earlier ones)
  const flushMentioned = statements.some(s => intents.disruption.test(s));
  if (flushMentioned) {
    bucket.delete("Disruption");
    bucket.set("Disruption", {
      section: "Disruption",
      plainText: "✅ Power flush to be carried out | Allow extra time and clear access;",
      naturalLanguage: "A power flush will be carried out, so extra time and access are needed."
    });
  }

  if (statements.some(s => intents.flue.test(s))) {
    const nl = summariseFlue(statements, intents.flue);
    const ex = bucket.get("Flue") || { section: "Flue", plainText: "", naturalLanguage: "" };
    ex.naturalLanguage = (ex.naturalLanguage ? ex.naturalLanguage + " " : "") + nl.trim();
    bucket.set("Flue", ex);
  }

  const merged = new Map();
  for (const [name, obj] of bucket) {
    const acc = merged.get(name) || { section: name, plainText: "", naturalLanguage: "" };
    acc.plainText = (acc.plainText ? acc.plainText + " " : "") + (obj.plainText || "");
    acc.naturalLanguage = (acc.naturalLanguage ? acc.naturalLanguage + " " : "") + (obj.naturalLanguage || "");
    merged.set(name, acc);
  }

  for (const [name, obj] of merged) {
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
    arr.sort((a, b) => (SECTION_ORDER[a.section] || 999) - (SECTION_ORDER[b.section] || 999));
    return arr;
  };

  let sections = buildSections();

  if (sections.some(s => s.section === "Disruption" && /Power flush/i.test(s.plainText))) {
    const bc = merged.get("New boiler and controls") || { section: "New boiler and controls", plainText: "", naturalLanguage: "" };
    const adds = [
      "Carry out system flush during commissioning",
      "Complete electrical works at commissioning stage"
    ];
    const added = bulletifyLines(adds);
    bc.plainText = bc.plainText ? `${bc.plainText}\n${added}` : added;
    merged.set("New boiler and controls", bc);
    sections = buildSections();
  }

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
      const bullets = bulletifyLines(collected);
      ca.plainText = ca.plainText ? `${ca.plainText}\n${bullets}` : bullets;
      merged.set("Customer actions", ca);
      sections = buildSections();
    }
  })();

  if (cfg.forceStructured && sections.length === 0) {
    const expected = cfg.expectedSections && cfg.expectedSections.length ? cfg.expectedSections : SECTION_NAMES;
    sections = expected.map(n => ({ section: n, plainText: "", naturalLanguage: "" }));
  }

  const customerSummary = firstSubstantiveLine(text);
  const all = text.toLowerCase();
  const missingInfo = [];
  if (!/\b(hive|smart (?:control|thermostat)|controller)\b/.test(all)) {
    missingInfo.push({ target: "customer", question: "Do you want a smart control (e.g., Hive)?" });
  }
  if (!/\b(condensate)\b/.test(all)) {
    missingInfo.push({ target: "engineer", question: "Confirm condensate route and termination." });
  }

  return { sections, customerSummary, missingInfo };
}

const DEFAULT_SECTION_ORDER_NAMES = SECTION_NAMES;
const DEFAULT_SECTION_HINTS = {};
