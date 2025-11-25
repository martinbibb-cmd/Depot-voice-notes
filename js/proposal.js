import { extractHeatingRequirements } from './recommendationEngine.js';
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

const DEFAULT_OPTION_ORDER = [];

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

function loadAppState() {
  try {
    if (typeof window !== 'undefined' && window.__depotAppState) return window.__depotAppState;
  } catch (_) {
    // ignore
  }

  try {
    if (typeof window !== 'undefined' && window.opener?.__depotAppState) return window.opener.__depotAppState;
  } catch (_) {
    // ignore
  }

  return null;
}

function loadSnapshot() {
  return loadAppState() || loadAutosave();
}

function loadTranscriptText(snapshot) {
  if (snapshot?.transcriptText) return snapshot.transcriptText;
  if (snapshot?.transcript) return snapshot.transcript;
  if (snapshot?.fullTranscript) return snapshot.fullTranscript;
  if (snapshot?.transcript?.text) return snapshot.transcript.text;
  for (const key of TRANSCRIPT_KEYS) {
    const raw = readFromStorage(key);
    if (raw) return raw;
  }
  return '';
}

function getSections(notes) {
  if (Array.isArray(notes)) return notes;
  if (Array.isArray(notes?.sections)) return notes.sections;
  if (Array.isArray(notes?.notes)) return notes.notes;
  if (Array.isArray(notes?.sections?.sections)) return notes.sections.sections;
  return [];
}

function normaliseNoteValue(value) {
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    return (
      value.text ||
      value.content ||
      value.message ||
      value.label ||
      value.title ||
      value.naturalLanguage ||
      JSON.stringify(value)
    );
  }
  return String(value);
}

function normaliseNoteList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => normaliseNoteValue(entry))
    .map((entry) => (entry || '').trim())
    .filter((entry) => entry.length > 0);
}

function loadNotes(snapshot) {
  if (!snapshot) {
    for (const key of NOTES_KEYS) {
      const json = parseJson(readFromStorage(key));
      if (json) return loadNotes(json);
    }
    return null;
  }

  if (Array.isArray(snapshot)) {
    return { sections: snapshot, missingInfo: [], checkedItems: [], flags: [] };
  }

  const notesSource = snapshot.notesJson || snapshot.notes || snapshot.sections || snapshot;
  const sections = getSections(notesSource);

  return {
    propertyType:
      snapshot.propertyType || notesSource.propertyType || snapshot.property || notesSource.property || '',
    currentSystem: snapshot.currentSystem || notesSource.currentSystem || '',
    bedrooms:
      snapshot.bedrooms ||
      snapshot.bedroomCount ||
      notesSource.bedrooms ||
      notesSource.bedroomCount ||
      notesSource.bedroomsCount,
    bathrooms:
      snapshot.bathrooms ||
      snapshot.bathroomCount ||
      notesSource.bathrooms ||
      notesSource.bathroomCount,
    customerSummary: snapshot.customerSummary || notesSource.customerSummary,
    hotWaterDemand: snapshot.hotWaterDemand || notesSource.hotWaterDemand,
    renewables: snapshot.renewables || notesSource.renewables,
    sections,
    missingInfo: normaliseNoteList(snapshot.missingInfo || notesSource.missingInfo),
    checkedItems: normaliseNoteList(snapshot.checkedItems || notesSource.checkedItems),
    flags: normaliseNoteList(snapshot.flags || snapshot.risks || notesSource.flags || notesSource.risks),
  };
}

function flattenSections(notes) {
  const sections = getSections(notes);
  if (!sections.length) return '';
  return sections
    .map((section) => section?.content || section?.text || section?.naturalLanguage || '')
    .join(' ');
}

function buildRequirementNotes(notes, transcriptText) {
  const fragments = [];

  if (transcriptText) fragments.push(transcriptText);

  const flattenedSections = flattenSections(notes);
  if (flattenedSections) fragments.push(flattenedSections);

  if (notes?.customerSummary) fragments.push(String(notes.customerSummary));
  if (notes?.currentSystem) fragments.push(`Current system: ${notes.currentSystem}`);
  if (notes?.propertyType) fragments.push(`Property type: ${notes.propertyType}`);
  if (notes?.hotWaterDemand) fragments.push(`Hot water demand: ${notes.hotWaterDemand}`);
  if (notes?.renewables) fragments.push(`Renewables: ${notes.renewables}`);

  if (Array.isArray(notes?.flags) && notes.flags.length) fragments.push(notes.flags.join(' '));
  if (Array.isArray(notes?.missingInfo) && notes.missingInfo.length) fragments.push(notes.missingInfo.join(' '));
  if (Array.isArray(notes?.checkedItems) && notes.checkedItems.length) fragments.push(notes.checkedItems.join(' '));

  return fragments.length ? fragments : [''];
}

function buildRecommendationRequirements(transcriptText, notes) {
  const sections = getSections(notes).map((section) => ({
    plainText: section?.content || section?.text || section?.naturalLanguage || '',
    naturalLanguage: section?.naturalLanguage || section?.content || section?.text || '',
  }));

  const noteFragments = buildRequirementNotes(notes, transcriptText);

  return extractHeatingRequirements(sections, noteFragments);
}

function detectCurrentSystem(notes, transcriptText) {
  const targetedSections = getSections(notes).filter((section) => {
    const title = (section?.title || '').toLowerCase();
    return (
      title.includes('new boiler') ||
      title.includes('existing system') ||
      title.includes('current system') ||
      title.includes('boiler and controls')
    );
  });

  const targetedText = targetedSections
    .map((section) => section?.content || section?.text || section?.naturalLanguage || '')
    .join(' ');

  const combined = `${notes?.currentSystem || ''} ${targetedText} ${flattenSections(notes)} ${
    transcriptText || ''
  }`.toLowerCase();

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
    bullets = bullets
      .concat(extras.map((e) => normaliseNoteValue(e)).slice(0, 6 - bullets.length))
      .filter(Boolean);
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
  flags
    .map((flag) => normaliseNoteValue(flag))
    .filter(Boolean)
    .slice(0, 6)
    .forEach((flag) => {
      const li = document.createElement('li');
      li.textContent = flag;
      ul.appendChild(li);
    });
  target.innerHTML = '';
  target.appendChild(ul);
}

function renderOptionCard(option, tierClass) {
  const card = document.createElement('article');
  card.className = `option-card ${tierClass}`;

  const header = document.createElement('div');
  header.className = 'option-header';

  const headingGroup = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = option?.label || 'Option';
  headingGroup.appendChild(eyebrow);

  const title = document.createElement('h3');
  title.textContent = option?.title || 'Not available';
  headingGroup.appendChild(title);

  if (option?.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'muted';
    subtitle.textContent = option.subtitle;
    headingGroup.appendChild(subtitle);
  }

  header.appendChild(headingGroup);

  if (option?.explicitlyRecommended) {
    const badge = document.createElement('p');
    badge.className = 'eyebrow';
    badge.textContent = '✓ Explicitly recommended by your heating expert';
    header.appendChild(badge);
  }

  card.appendChild(header);

  const benefits = option?.benefits?.length ? option.benefits : ['Information not available.'];
  const list = document.createElement('ul');
  list.className = 'bullet-list';
  benefits.slice(0, 6).forEach((benefit) => {
    const li = document.createElement('li');
    li.textContent = benefit;
    list.appendChild(li);
  });
  card.appendChild(list);

  if (option?.miniSpec) {
    const miniSpec = document.createElement('p');
    miniSpec.className = 'mini-spec';
    miniSpec.textContent = option.miniSpec;
    card.appendChild(miniSpec);
  }

  return card;
}

function renderOptions(options) {
  const grid = document.getElementById('options-grid');
  if (!grid) return;

  grid.innerHTML = '';
  if (!Array.isArray(options) || !options.length) {
    const placeholder = document.createElement('p');
    placeholder.className = 'muted';
    placeholder.textContent = 'Options will appear once we process your site notes.';
    grid.appendChild(placeholder);
    return;
  }

  const tierClasses = ['gold', 'silver', 'bronze'];
  options.forEach((option, idx) => {
    const tierClass = tierClasses[idx] || 'alternative';
    grid.appendChild(renderOptionCard(option, tierClass));
  });
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

  const snapshot = loadSnapshot();
  const transcriptText = loadTranscriptText(snapshot);
  const notes = loadNotes(snapshot);

  const hasRealData = Boolean((transcriptText || '').trim()) || getSections(notes).length > 0;

  if (!transcriptText && !notes) {
    showWarning(
      'We couldn’t load your survey data. Please reopen this after completing the voice notes and notes sections.'
    );
  }

  if (!hasRealData) {
    renderOptions([]);
    renderImportantNotes({});
    return;
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

  const requirements = buildRecommendationRequirements(transcriptText, notes || {});

  const { options } = getProposalOptions(requirements, DEFAULT_OPTION_ORDER);
  renderOptions(options);

  renderImportantNotes(notes || {});
}

document.addEventListener('DOMContentLoaded', init);
