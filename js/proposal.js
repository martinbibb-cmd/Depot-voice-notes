import { getProposalOptions, hasMeaningfulRequirements } from './systemRecommendationShared.js';
import { buildSystemInputFromNotes } from './systemProposalAdapter.js';

const AUTOSAVE_KEY = 'surveyBrainAutosave';

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || 'Not specified';
}

function todayUK() {
  return new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function loadSavedSnapshot() {
  try {
    // Prefer active session state if present
    if (window.__depotAppState) {
      const { sections = [], notes = [], customerSummary = '', fullTranscript = '' } = window.__depotAppState;
      return {
        sections,
        notes,
        customerSummary,
        fullTranscript
      };
    }

    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed || null;
  } catch (err) {
    console.warn('Unable to load saved snapshot', err);
    return null;
  }
}

function derivePropertySummary(requirements = {}) {
  const parts = [];
  if (requirements.bedrooms) parts.push(`${requirements.bedrooms}-bed`);
  if (requirements.houseType) parts.push(requirements.houseType.toLowerCase());
  return parts.length ? parts.join(' ') : 'Not specified';
}

function deriveBedBath(requirements = {}) {
  const bits = [];
  if (requirements.bedrooms) bits.push(`${requirements.bedrooms} bedroom${requirements.bedrooms > 1 ? 's' : ''}`);
  if (requirements.bathrooms) bits.push(`${requirements.bathrooms} bathroom${requirements.bathrooms > 1 ? 's' : ''}`);
  return bits.length ? bits.join(' · ') : 'Not specified';
}

function describeCurrentSystem(requirements = {}) {
  const boiler = requirements.currentBoilerType;
  const water = requirements.currentWaterSystem;
  if (!boiler && !water) return 'Not specified';
  if (boiler && water) return `${boiler} with ${water}`;
  return boiler || water || 'Not specified';
}

function deriveSpecialNotes(snapshot = {}) {
  const notes = [];
  if (snapshot.customerSummary) notes.push(snapshot.customerSummary);
  if (Array.isArray(snapshot.missingInfo) && snapshot.missingInfo.length) {
    notes.push(`Missing details: ${snapshot.missingInfo.join(', ')}`);
  }
  return notes.join(' ') || 'Not specified';
}

function buildBulletList(rawText = '', fallbackSummary = '') {
  const listEl = document.getElementById('what-you-told-us-list');
  if (!listEl) return;

  const bullets = [];
  if (fallbackSummary) bullets.push(fallbackSummary);

  const sentences = rawText
    .replace(/\n+/g, ' ')
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const keywords = ['radiator', 'pressure', 'water', 'cold', 'bills', 'control', 'future', 'upgrade', 'comfort', 'hot'];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) {
      bullets.push(sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence);
    }
    if (bullets.length >= 6) break;
  }

  if (!bullets.length && rawText) {
    bullets.push(rawText.slice(0, 120));
  }

  listEl.innerHTML = '';
  const finalBullets = bullets.slice(0, 6);
  finalBullets.forEach((b) => {
    const li = document.createElement('li');
    li.textContent = b;
    listEl.appendChild(li);
  });
}

function getGraphicForOption(option) {
  if (!option) return '';
  const { boiler, water } = option;
  if (boiler === 'combi') return 'assets/system-graphics/Combination.png';
  if (water && water.includes('mixergy')) return 'assets/system-graphics/unvented-cylinder.JPG';
  if (boiler === 'system') {
    return water && water.includes('open')
      ? 'assets/system-graphics/vented-cylinder.PNG'
      : 'assets/system-graphics/unvented-cylinder.JPG';
  }
  if (boiler === 'regular') {
    return water && water.includes('open')
      ? 'assets/system-graphics/open-vented-schematic.JPG'
      : 'assets/system-graphics/vented-cylinder.PNG';
  }
  return 'assets/system-graphics/System-boiler.png';
}

function deriveOptionFromKey(optionKey) {
  switch (optionKey) {
    case 'combi':
      return { boiler: 'combi' };
    case 'system_mixergy':
      return { boiler: 'system', water: 'mixergy' };
    case 'system_unvented':
      return { boiler: 'system', water: 'unvented' };
    default:
      return null;
  }
}

function renderNoProposalDataMessage() {
  const optionsContainer = document.getElementById('proposal-options-container');
  if (optionsContainer) {
    optionsContainer.innerHTML = `
      <div class="no-data-message">
        <p>No survey data found.</p>
        <p>Please complete the Depot Voice Notes survey for this customer, then regenerate the proposal.</p>
      </div>
    `;
  }
}

function renderOption(targetPrefix, optionData) {
  if (!optionData) return;
  setText(`${targetPrefix}-title`, optionData.title);
  setText(`${targetPrefix}-subtitle`, optionData.subtitle);

  const listId = `${targetPrefix}-benefits`;
  const listEl = document.getElementById(listId);
  if (listEl) {
    listEl.innerHTML = '';
    (optionData.benefits || ['Not specified']).forEach((benefit) => {
      const li = document.createElement('li');
      li.textContent = benefit;
      listEl.appendChild(li);
    });
  }

  setText(`${targetPrefix}-mini-spec`, optionData.miniSpec);

  const imgEl = document.getElementById(`${targetPrefix}-image`);
  if (imgEl) {
    const graphic = getGraphicForOption(
      optionData.option || deriveOptionFromKey(optionData.optionKey)
    );
    if (graphic) {
      imgEl.src = graphic;
      imgEl.alt = optionData.option && optionData.option.water?.includes('mixergy')
        ? 'Smart hot water cylinder'
        : 'System graphic';
    }
  }
}

async function populateProposal() {
  setText('proposal-date', todayUK());
  const snapshot = loadSavedSnapshot();

  if (!snapshot) {
    const warning = document.getElementById('options-warning');
    if (warning) {
      warning.hidden = false;
      warning.textContent = 'We couldn\'t load your survey data. Please complete your voice notes and reopen this proposal.';
    }
    return;
  }

  const notesJson = {
    sections: snapshot.sections || snapshot.notes || [],
    customerSummary: snapshot.customerSummary || '',
    missingInfo: snapshot.missingInfo || [],
    fullTranscript: snapshot.fullTranscript || snapshot.transcriptText || ''
  };

  const requirements = await buildSystemInputFromNotes(notesJson);

  setText('property-type', derivePropertySummary(requirements));
  setText('property-summary', deriveBedBath(requirements));
  setText('current-system', describeCurrentSystem(requirements));
  setText('special-notes', deriveSpecialNotes(snapshot));

  const transcriptText = snapshot.fullTranscript || snapshot.transcriptText || '';
  const summaryBullet = snapshot.customerSummary || '';
  buildBulletList(transcriptText, summaryBullet);

  if (!hasMeaningfulRequirements(requirements)) {
    renderNoProposalDataMessage();
    return;
  }

  try {
    const { options, empty } = getProposalOptions(requirements);

    if (empty || !options || options.length === 0) {
      renderNoProposalDataMessage();
      return;
    }

    const [gold, silver, bronze] = options;

    renderOption('gold', gold);
    renderOption('silver', silver);
    renderOption('bronze', bronze);
  } catch (error) {
    console.error('Failed to generate proposal options', error);
    const warning = document.getElementById('options-warning');
    if (warning) {
      warning.hidden = false;
      warning.textContent = 'We couldn\'t generate detailed options from your survey. Please check the system recommendation screen for details.';
    }
  }
}

document.addEventListener('DOMContentLoaded', populateProposal);
