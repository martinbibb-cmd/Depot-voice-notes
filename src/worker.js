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

/* ---------- structuring logic (same as before) ---------- */
const DEFAULT_SECTION_ORDER = {
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
const DEFAULT_SECTION_ORDER_NAMES = Object.keys(DEFAULT_SECTION_ORDER);
const DEFAULT_SECTION_HINTS = {
  "hive": "New boiler and controls",
  "smart control": "New boiler and controls",
  "controller": "New boiler and controls",
  "pump": "New boiler and controls",
  "valve": "New boiler and controls",
  "condensate": "Pipe work",
  "condensate upgrade": "Pipe work",
  "pipe": "Pipe work",
  "gas run": "Pipe work",
  "reuse flue": "Flue",
  "new flue": "Flue",
  "balanced flue": "Flue",
  "ladders": "Working at heights",
  "loft": "Working at heights",
  "power flush": "New boiler and controls",
  "powerflush": "New boiler and controls",
  "magnetic filter": "New boiler and controls"
};

function structureDepotNotes(input, cfg) {
  const text = String(input || "");
  const lc = text.toLowerCase();
  const buckets = new Map();
  for (const name of (cfg.expectedSections || DEFAULT_SECTION_ORDER_NAMES)) {
    buckets.set(name, { section: name, plainText: "", naturalLanguage: "" });
  }
  const hints = cfg.sectionHints || DEFAULT_SECTION_HINTS;
  for (const [kw, target] of Object.entries(hints)) {
    if (lc.includes(kw)) append(buckets, target, extractLine(text, kw), "");
  }
  if (/\bparking|permit|no parking|access\b/i.test(lc)) {
    append(buckets, "Restrictions to work", "Parking/access restrictions noted;", "There are parking/access restrictions at the property.");
  }
  if (/\bplanning permission|listed building|conservation area|needs permission\b/i.test(lc)) {
    append(buckets, "Office notes", "Planning/listed/conservation constraints;", "Office to review planning / admin requirements.");
  }
  if (/\bdouble handed|2 ?man|two (man|engineers)|2 engineers\b/i.test(lc)) {
    append(buckets, "Components that require assistance", "Double-handed lift / additional engineer required;", "A two-person lift / additional engineer is required.");
  }
  if (/\bpower ?flush\b/i.test(lc)) {
    append(buckets, "Disruption", "✅ Power flush to be carried out | Allow extra time and clear access;", "A power flush will be carried out, so extra time and access are needed.");
  }

  const out = [];
  for (const [name, obj] of buckets) {
    const pt = (obj.plainText || "").trim();
    const nl = (obj.naturalLanguage || "").trim();
    if (pt || nl) out.push({ section: name, plainText: ensureSemi(pt), naturalLanguage: nl });
  }
  out.sort((a,b)=>(DEFAULT_SECTION_ORDER[a.section]||999)-(DEFAULT_SECTION_ORDER[b.section]||999));
  const customerSummary = String(text).trim().split(/\n/)[0]?.slice(0,180) || "";
  const missingInfo = [];
  if (!/\b(hive|smart control|controller)\b/i.test(lc)) missingInfo.push({ target:"customer", question:"Do you want a smart control (e.g., Hive)?" });
  if (!/\b(condensate)\b/i.test(lc)) missingInfo.push({ target:"engineer", question:"Confirm condensate route and termination." });
  if (cfg.forceStructured && out.length === 0) for (const name of DEFAULT_SECTION_ORDER_NAMES) out.push({ section: name, plainText:"", naturalLanguage:"" });
  return { sections: out, customerSummary, missingInfo };
}
function append(b, name, ptAdd, nlAdd){ const it=b.get(name)||{section:name,plainText:"",naturalLanguage:""}; it.plainText=(it.plainText?it.plainText+" ":"")+((ptAdd||"").endsWith(";")?ptAdd:ptAdd+";"); it.naturalLanguage=(it.naturalLanguage?it.naturalLanguage+" ":"")+nlAdd; b.set(name,it); }
function ensureSemi(s){ if(!s) return s; return s.split(/(?<=;)\s*/).map(x=>x.trim()).filter(Boolean).join("; "); }
function extractLine(text, kw){ const rx=new RegExp(`[^\\n]*${kw.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&")}[^\\n]*`,"i"); const m=String(text||"").match(rx); const s=m?m[0].trim():kw; return s.endsWith(";")?s:s+";"; }
