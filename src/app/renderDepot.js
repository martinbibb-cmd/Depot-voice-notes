import { buildDepotOutputFromChecklist } from "../notes/notesEngine.js";

let sectionsContainer = null;
let materialsContainer = null;

export function initDepotRenderers({ sectionsEl, materialsEl } = {}) {
  sectionsContainer = sectionsEl || sectionsContainer;
  materialsContainer = materialsEl || materialsContainer;
}

function ensureSemi(s) {
  s = String(s || "").trim();
  if (!s) return "";
  return s.endsWith(";") ? s : `${s};`;
}

function splitGeneralClauses(text) {
  return String(text || "")
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitPipeRoute(text) {
  const cues = [
    "from ",
    "off the ",
    "pick up ",
    "drop to ",
    "under ",
    "behind ",
    "through ",
    "along ",
    "across ",
    "continue ",
    "then ",
    "past ",
    "to ",
    "into ",
    "up ",
    "come up ",
    "rise in ",
    "down ",
    "fall to "
  ];
  const rx = new RegExp(
    "(?:;|—|–|,)|\\b(" + cues.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")",
    "ig"
  );
  const bits = [];
  let cur = "";
  (" " + String(text || "").replace(/\s+/g, " ").trim() + " ")
    .split(rx)
    .forEach((ch) => {
      if (!ch) return;
      const isCue = cues.some((c) => ch.toLowerCase().startsWith(c.trim()));
      if (isCue && cur.trim()) {
        bits.push(cur.trim());
        cur = ch;
      } else {
        cur += ch;
      }
    });
  if (cur.trim()) bits.push(cur.trim());
  return bits.map((s) => s.replace(/^and\s+/i, "").trim()).filter(Boolean);
}

function stripSequencingPreamble(line) {
  let s = String(line || "").trim();
  s = s
    .replace(/^(then|next|first|second|after|before|finally|so)\b[:,\s-]*/i, "")
    .replace(/^(we(?:'|\u2019)ll|we will|i(?:'|\u2019)ll|expert will|installer will|we need to|need to|we can|we should)\b[:,\s-]*/i, "")
    .replace(/^(please|note|recommend(?:ed)? to)\b[:,\s-]*/i, "");
  s = s.replace(/\bwill need to\b/gi, "required to");
  return s.trim();
}

function bulletify(lines) {
  const out = [];
  for (const raw of lines) {
    const t = stripSequencingPreamble(raw);
    if (!t) continue;
    out.push(`• ${ensureSemi(t)}`);
  }
  return out.join("\n");
}

function formatPlainTextForSection(section, plain) {
  if (!plain) return "";
  if (section === "Pipe work") {
    const steps = splitPipeRoute(plain);
    if (steps.length) return bulletify(steps);
  }
  return bulletify(splitGeneralClauses(plain));
}

export function renderDepotSections(sections = []) {
  if (!sectionsContainer) return;
  sectionsContainer.innerHTML = "";

  if (!sections.length) {
    sectionsContainer.innerHTML = `<span class="small">No sections yet.</span>`;
    return;
  }

  sections.forEach((sec) => {
    const div = document.createElement("div");
    div.className = "section-item";

    const heading = document.createElement("h4");
    heading.textContent = sec.section || "";
    div.appendChild(heading);

    if (sec.plainText) {
      const pre = document.createElement("pre");
      pre.textContent = formatPlainTextForSection(sec.section, sec.plainText);
      div.appendChild(pre);
    }

    if (sec.naturalLanguage) {
      const p = document.createElement("p");
      p.className = "small";
      p.textContent = sec.naturalLanguage;
      div.appendChild(p);
    }

    sectionsContainer.appendChild(div);
  });
}

export function renderMaterialsList(materials = []) {
  if (!materialsContainer) return;
  materialsContainer.innerHTML = "";

  if (!materials.length) {
    materialsContainer.innerHTML = `<span class="small">No suggestions yet.</span>`;
    return;
  }

  const byCategory = new Map();
  materials.forEach((item) => {
    const cat = item.category || "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item);
  });

  byCategory.forEach((items, cat) => {
    const header = document.createElement("div");
    header.className = "small";
    header.style.fontWeight = "600";
    header.style.margin = "4px 0 2px";
    header.textContent = cat;
    materialsContainer.appendChild(header);

    const ul = document.createElement("ul");
    ul.style.margin = "0 0 4px 14px";
    ul.style.padding = "0";
    ul.style.listStyle = "disc";

    items.forEach((item) => {
      const li = document.createElement("li");
      li.style.fontSize = ".68rem";
      const qtyPart = item.qty ? `${item.qty} × ` : "";
      const notesPart = item.notes ? ` – ${item.notes}` : "";
      li.textContent = `${qtyPart}${item.item}${notesPart}`.trim();
      ul.appendChild(li);
    });

    materialsContainer.appendChild(ul);
  });
}

export function refreshDepotNotesFromChecklist(checklistState = {}) {
  const output = buildDepotOutputFromChecklist(checklistState);
  renderDepotSections(output.sections);
  renderMaterialsList(output.materials);
  return output;
}
