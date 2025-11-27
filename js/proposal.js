import { loadSystemRecommendationJson } from './systemRecommendationImport.js';

// Adjusted to match current storage: prefer live app state, fall back to autosave keys
const TRANSCRIPT_STORAGE_KEYS = ['dvn_transcript', 'surveyBrainAutosave'];

function loadTranscriptJson() {
  try {
    if (window.__depotAppState) {
      return window.__depotAppState;
    }

    for (const key of TRANSCRIPT_STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed) return parsed;
    }

    return null;
  } catch (err) {
    console.error('[Proposal] Failed to load transcript JSON', err);
    return null;
  }
}

function getTodayDisplayDate() {
  return new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value) {
    el.textContent = value;
  }
}

function renderNoData() {
  const container = document.getElementById('proposal-options-container');
  if (!container) return;
  container.innerHTML = `
    <div class="no-data-message">
      <p>We couldn’t find both a System Recommendation JSON and a transcript for this property.</p>
      <p>Please export the JSON from the System Recommendation app and import it here, then regenerate the proposal after running Depot Voice Notes.</p>
    </div>
  `;
}

function buildWhatYouToldUsBullets(transcriptJson) {
  const list = document.getElementById('what-you-told-us-list');
  if (!list) return;

  list.innerHTML = '';

  if (!transcriptJson) return;

  const raw =
    transcriptJson.fullTranscript ||
    transcriptJson.text ||
    transcriptJson.transcript ||
    '';

  if (!raw || typeof raw !== 'string') return;

  // Very simple sentence split
  const sentences = raw
    .split(/[\.\?\!]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const keywords = [
    'radiator',
    'radiators',
    'hot water',
    'pressure',
    'shower',
    'bath',
    'bill',
    'bills',
    'cold',
    'leak',
    'noise',
    'future',
    'control',
    'comfort',
    'space'
  ];

  const bullets = [];
  for (const s of sentences) {
    if (bullets.length >= 6) break;
    const lower = s.toLowerCase();
    const hit = keywords.some((k) => lower.includes(k));
    if (hit) {
      bullets.push(s.length > 140 ? s.slice(0, 137) + '…' : s);
    }
  }

  // Fallback: first 3 sentences if keyword filter gave nothing
  if (bullets.length === 0) {
    bullets.push(...sentences.slice(0, 3));
  }

  bullets.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  });
}

// Map system-rec JSON into Gold/Silver/Bronze
function renderOptionsFromSystemRec(systemJson) {
  const container = document.getElementById('proposal-options-container');
  if (!container) return;

  // Clear any placeholder content
  container.innerHTML = '';

  if (!systemJson) {
    renderNoData();
    return;
  }

  // We expect something like:
  // {
  //   summary: "...",
  //   recommendations: [ { title, variantLabel, key, score, keyFactors, bestFor, ... }, ... ]
  // }
  // Let’s be defensive and try to adapt to what’s actually there.

  const recs =
    systemJson.topRecommendations ||
    systemJson.recommendations ||
    systemJson.options ||
    [];

  if (!Array.isArray(recs) || recs.length === 0) {
    renderNoData();
    return;
  }

  const labels = ['GOLD – RECOMMENDED', 'SILVER', 'BRONZE'];

  recs.slice(0, 3).forEach((rec, idx) => {
    const label = labels[idx] || 'OPTION';

    const title =
      rec.title ||
      rec.name ||
      rec.displayName ||
      'Recommended option';

    const subtitle =
      rec.variantLabel ||
      rec.type ||
      rec.subtitle ||
      '';

    const score = typeof rec.score === 'number' ? rec.score : null;
    const efficiency = rec.efficiency || rec.efficiencyRange;
    const lifespan = rec.lifespan || rec.lifespanRange;

    const keyFactors =
      rec.keyFactors ||
      rec.factors ||
      rec.reasons ||
      [];

    const bestFor =
      rec.bestFor ||
      rec.best_for ||
      '';

    // Build a simple box for each option
    const card = document.createElement('section');
    card.className = `proposal-option proposal-option-${idx}`;

    card.innerHTML = `
      <header class="proposal-option-header">
        <div class="proposal-option-label">${label}</div>
        <h2 class="proposal-option-title">${title}</h2>
        ${
          subtitle
            ? `<p class="proposal-option-subtitle">${subtitle}</p>`
            : ''
        }
      </header>
      <div class="proposal-option-meta">
        ${
          score !== null
            ? `<span><strong>Score:</strong> ${score}</span>`
            : ''
        }
        ${
          efficiency
            ? `<span><strong>Efficiency:</strong> ${efficiency}</span>`
            : ''
        }
        ${
          lifespan
            ? `<span><strong>Lifespan:</strong> ${lifespan}</span>`
            : ''
        }
      </div>
      <div class="proposal-option-body">
        ${
          Array.isArray(keyFactors) && keyFactors.length
            ? `<h3>Key factors</h3>
               <ul class="proposal-option-factors">
                 ${keyFactors
                   .slice(0, 5)
                   .map((f) => `<li>${f}</li>`)
                   .join('')}
               </ul>`
            : ''
        }
        ${
          bestFor
            ? `<p class="proposal-option-bestfor"><strong>Best for:</strong> ${bestFor}</p>`
            : ''
        }
      </div>
    `;

    container.appendChild(card);
  });
}

function initProposal() {
  // Date
  setText('proposal-date', getTodayDisplayDate());

  const transcriptJson = loadTranscriptJson();
  const systemJson = loadSystemRecommendationJson();

  if (!systemJson || !transcriptJson) {
    renderNoData();
    return;
  }

  // "What you told us" from transcript
  buildWhatYouToldUsBullets(transcriptJson);

  // Fill anything else you want from transcriptJson (property type, etc.)
  // Example (adapt to your JSON):
  setText('customer-name', transcriptJson.customerName);
  setText('customer-address', transcriptJson.customerAddress);
  setText('property-type', transcriptJson.propertyType || transcriptJson.houseType);
  setText('property-summary', transcriptJson.propertySummary);
  setText('current-system', transcriptJson.currentSystem);
  setText('special-notes', transcriptJson.customerSummary);

  // Options from system-rec JSON
  renderOptionsFromSystemRec(systemJson);
}

document.addEventListener('DOMContentLoaded', initProposal);
