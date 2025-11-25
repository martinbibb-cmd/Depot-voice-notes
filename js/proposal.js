import { getProposalOptions } from './systemRecommendationShared.js';

const AUTOSAVE_KEY = 'surveyBrainAutosave';
const TRANSCRIPT_KEYS = ['dvn_transcript', 'depot.transcript'];
const NOTES_KEYS = ['dvn_notes', 'depot.notes'];
const GRAPHIC_MAP = [
  { match: 'regular', src: 'assets/system-graphics/open-vented-schematic.JPG', alt: 'Regular boiler with vented cylinder.' },
  { match: 'open vent', src: 'assets/system-graphics/open-vented-schematic.JPG', alt: 'Regular boiler with vented cylinder.' },
  { match: 'system', src: 'assets/system-graphics/System-boiler.png', alt: 'System boiler with unvented cylinder.' },
  { match: 'unvented', src: 'assets/system-graphics/unvented-cylinder.JPG', alt: 'System boiler with unvented cylinder.' },
  { match: 'combi', src: 'assets/system-graphics/Combination.png', alt: 'Combi boiler layout.' },
];
const GRAPHIC_FALLBACK = {
  src: 'assets/system-graphics/System-components.JPG',
  alt: 'Heating system illustration.',
};

function readFromStorage(key) {
  try {
    const local = localStorage.getItem(key);
    if (local) return local;
  } catch (_) {
    // ignore
  }

  try {
    const opener = window.opener?.localStorage?.getItem?.(key);
    if (opener) return opener;
  } catch (_) {
    // ignore
  }
  return null;
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function loadAutosave() {
  const raw = readFromStorage(AUTOSAVE_KEY);
  return parseJson(raw);
}

function loadTranscriptText(snapshot) {
  if (snapshot?.fullTranscript) return snapshot.fullTranscript;
  for (const key of TRANSCRIPT_KEYS) {
    const raw = readFromStorage(key);
    if (raw) return raw;
  }
  return '';
}

function loadNotes(snapshot) {
  if (snapshot) {
    return {
      propertyType: snapshot.propertyType || '',
      currentSystem: snapshot.currentSystem || '',
      bedrooms: snapshot.bedrooms || snapshot.bedroomCount,
      bathrooms: snapshot.bathrooms || snapshot.bathroomCount,
      customerSummary: snapshot.customerSummary,
      sections: snapshot.sections || [],
      missingInfo: snapshot.missingInfo || [],
      checkedItems: snapshot.checkedItems || [],
      flags: snapshot.flags || snapshot.risks || [],
    };
  }

  for (const key of NOTES_KEYS) {
    const json = parseJson(readFromStorage(key));
    if (json) return json;
  }

  return null;
}

function flattenSections(notes) {
  if (!notes || !Array.isArray(notes.sections)) return '';
  return notes.sections
    .map((section) => section?.content || section?.text || section?.naturalLanguage || '')
    .join(' ');
}

function detectCurrentSystem(notes, transcriptText) {
  const combined = `${notes?.currentSystem || ''} ${flattenSections(notes)} ${transcriptText || ''}`.toLowerCase();

  if (/combi/.test(combined)) return 'Combi boiler';
  if (/(system boiler|unvented|pressurised)/.test(combined)) return 'System boiler with unvented cylinder';
  if (/(regular|heat[-\s]?only|open vent|f&e|feed and expansion)/.test(combined))
    return 'Regular boiler with vented cylinder';

  return notes?.currentSystem || 'Not specified';
}

function detectPropertyType(notes) {
  const sectionText = flattenSections(notes).toLowerCase();
  if (sectionText.includes('terrace')) return 'Terraced home';
  if (sectionText.includes('semi-detached')) return 'Semi-detached home';
  if (sectionText.includes('detached')) return 'Detached home';
  if (sectionText.includes('flat') || sectionText.includes('apartment')) return 'Flat / apartment';

  return (
    notes?.propertyType ||
    notes?.property ||
    notes?.houseType ||
    notes?.propertyDescription ||
    'Not specified'
  );
}

function extractSentences(text) {
  if (!text) return [];
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function prioritiseSentences(sentences) {
  const keywords = ['radiator', 'heat', 'hot water', 'pressure', 'bill', 'efficiency', 'control', 'replace'];
  return sentences
    .filter((s) => s.split(' ').length >= 5)
    .map((s) => ({
      text: s.length > 120 ? `${s.slice(0, 120)}…` : s,
      score: keywords.some((k) => s.toLowerCase().includes(k)) ? 2 : 1,
    }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.text);
}

function buildWhatYouToldUs(transcriptText, notes) {
  const sentences = extractSentences(transcriptText || '')
    .concat(extractSentences(notes?.customerSummary || ''))
    .concat(extractSentences(flattenSections(notes)));
  let bullets = prioritiseSentences(sentences).slice(0, 6);

  if (bullets.length < 3) {
    const extras = [];
    if (Array.isArray(notes?.missingInfo)) extras.push(...notes.missingInfo);
    if (Array.isArray(notes?.checkedItems)) extras.push(...notes.checkedItems);
    bullets = bullets.concat(extras.map((e) => String(e)).slice(0, 6 - bullets.length));
  }

  if (!bullets.length) {
    bullets = ['Information not available yet.'];
  }
  return bullets;
}

function setListContent(listId, items) {
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  listEl.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function chooseGraphic(currentSystem) {
  const lower = (currentSystem || '').toLowerCase();
  const match = GRAPHIC_MAP.find((g) => lower.includes(g.match));
  return match || GRAPHIC_FALLBACK;
}

function renderImportantNotes(notes) {
  const target = document.getElementById('important-notes');
  if (!target) return;
  const flags = [];
  if (Array.isArray(notes?.flags)) flags.push(...notes.flags);
  if (Array.isArray(notes?.missingInfo)) flags.push(...notes.missingInfo);
  if (Array.isArray(notes?.checkedItems)) flags.push(...notes.checkedItems);

  if (!flags.length) {
    target.textContent = 'No specific notes recorded yet.';
    return;
  }

  const ul = document.createElement('ul');
  flags.slice(0, 6).forEach((flag) => {
    const li = document.createElement('li');
    li.textContent = String(flag);
    ul.appendChild(li);
  });
  target.innerHTML = '';
  target.appendChild(ul);
}

function fillOption(prefix, option) {
  const titleEl = document.getElementById(`${prefix}-title`);
  const subtitleEl = document.getElementById(`${prefix}-subtitle`);
  const miniSpecEl = document.getElementById(`${prefix}-mini-spec`);

  if (titleEl) titleEl.textContent = option?.title || 'Not available';
  if (subtitleEl) subtitleEl.textContent = option?.subtitle || '';
  if (miniSpecEl) miniSpecEl.textContent = option?.miniSpec || '';
  setListContent(`${prefix}-benefits`, option?.benefits || ['Information not available.']);
}

function showWarning(message) {
  const el = document.getElementById('load-warning');
  if (!el) return;
  el.textContent = message || '';
}

function init() {
  const today = new Date();
  const dateEl = document.getElementById('proposal-date');
  if (dateEl) dateEl.textContent = today.toLocaleDateString();

  const snapshot = loadAutosave();
  const transcriptText = loadTranscriptText(snapshot);
  const notes = loadNotes(snapshot);

  if (!transcriptText && !notes) {
    showWarning(
      'We couldn’t load your survey data. Please reopen this after completing the voice notes and notes sections.'
    );
  }

  const propertyType = detectPropertyType(notes);
  const currentSystem = detectCurrentSystem(notes, transcriptText);

  const propertyEl = document.getElementById('property-type');
  if (propertyEl) propertyEl.textContent = propertyType;
  const currentSystemEl = document.getElementById('current-system');
  if (currentSystemEl) currentSystemEl.textContent = currentSystem;

  const bullets = buildWhatYouToldUs(transcriptText, notes);
  setListContent('what-you-told-us-list', bullets);

  const graphic = chooseGraphic(currentSystem);
  const img = document.getElementById('system-graphic-img');
  if (img) {
    img.src = graphic.src;
    img.alt = graphic.alt;
  }

  const recommendationInput = {
    propertyType,
    currentSystemType: currentSystem,
    bedrooms: notes?.bedrooms,
    bathrooms: notes?.bathrooms,
    wantsSmartControls: true,
    consideringRenewables: !!notes?.renewables,
    hotWaterDemand: notes?.hotWaterDemand,
    spaceConstraints: notes?.spaceConstraints,
  };

  const { gold, silver, bronze } = getProposalOptions(recommendationInput);
  fillOption('gold', gold);
  fillOption('silver', silver);
  fillOption('bronze', bronze);

  renderImportantNotes(notes || {});
}

document.addEventListener('DOMContentLoaded', init);
