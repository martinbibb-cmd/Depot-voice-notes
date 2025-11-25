const transcriptInput = document.getElementById('transcriptFile');
const notesInput = document.getElementById('notesFile');
const systemInput = document.getElementById('systemFile');
const generateBtn = document.getElementById('generateProposalBtn');
const printBtn = document.getElementById('printProposalBtn');
const outputEl = document.getElementById('proposalOutput');
const statusEl = document.getElementById('autosaveStatus');

const AUTOSAVE_KEY = 'surveyBrainAutosave';

const ICON_BASE = 'main/assets/system-graphics/';
const iconMap = {
  combi: `${ICON_BASE}combi.png`,
  system: `${ICON_BASE}system.png`,
  regular: `${ICON_BASE}regular.png`,
  backboiler: `${ICON_BASE}backboiler.png`,
  cylinder: `${ICON_BASE}cylinder.png`,
  mixergy: `${ICON_BASE}mixergy.png`,
  hive: `${ICON_BASE}hive.png`,
  stat: `${ICON_BASE}stat.png`,
  filter: `${ICON_BASE}filter.png`,
  flush: `${ICON_BASE}flush.png`,
  scale: `${ICON_BASE}scale.png`,
  heatpump: `${ICON_BASE}heatpump.png`,
};

// Shows a small text note explaining where the options came from.
function setOptionSourceNote(text) {
  const el = document.getElementById('optionSourceNote');
  if (!el) return;
  if (!text) {
    el.style.display = 'none';
    el.textContent = '';
  } else {
    el.style.display = 'block';
    el.textContent = text;
  }
}

function setStatusMessage(text) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse JSON', err);
    return null;
  }
}

function loadAutosaveSnapshot() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return safeParseJson(raw);
  } catch (err) {
    console.warn('Could not read autosave from localStorage', err);
    return null;
  }
}

function pullSessionFromOpener() {
  if (!window.opener) return null;
  try {
    const autosaveRaw = window.opener.localStorage?.getItem?.(AUTOSAVE_KEY) || null;
    if (autosaveRaw) {
      return safeParseJson(autosaveRaw);
    }
  } catch (err) {
    console.warn('Unable to read data from opener window', err);
  }
  return null;
}

function loadLatestDepotSession() {
  return loadAutosaveSnapshot() || pullSessionFromOpener();
}

function formatSnapshotTimestamp(snapshot) {
  if (!snapshot) return null;
  const ts = snapshot.savedAt || snapshot.createdAt;
  return ts ? new Date(ts).toLocaleString() : null;
}

function announceAutosaveAvailability(snapshot) {
  if (!statusEl) return;
  if (snapshot) {
    const stamp = formatSnapshotTimestamp(snapshot);
    const label = stamp ? ` from ${stamp}` : '';
    setStatusMessage(`Auto-detected Depot Voice Notes session${label}. We'll use it if you don't upload files.`);
  } else {
    setStatusMessage('Tip: open Depot Voice Notes in another tab to auto-fill the latest session here.');
  }
}

function readJsonFile(inputEl) {
  return new Promise((resolve) => {
    const file = inputEl?.files?.[0];
    if (!file) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        resolve(json);
      } catch (err) {
        console.error('Error parsing JSON', err);
        resolve(null);
      }
    };
    reader.onerror = () => {
      console.error('Error reading file', reader.error);
      resolve(null);
    };
    reader.readAsText(file);
  });
}

function summariseTranscript(transcriptJson) {
  if (!transcriptJson) {
    return {
      customerSummary: 'Summary not available (no transcript loaded).',
      priorities: [],
      painPoints: [],
      constraints: [],
    };
  }

  const rawText =
    transcriptJson.text ||
    transcriptJson.transcript ||
    transcriptJson.fullTranscript ||
    '';
  const short = rawText
    ? `${rawText.slice(0, 300)}${rawText.length > 300 ? '…' : ''}`
    : 'Conversation transcript loaded.';

  return {
    customerSummary: short,
    priorities: transcriptJson.priorities || [],
    painPoints: transcriptJson.painPoints || [],
    constraints: transcriptJson.constraints || [],
  };
}

function extractPropertyFromNotes(notesJson) {
  if (!notesJson) {
    return {
      property: 'Not specified',
      bedrooms: null,
      bathrooms: null,
      currentSystem: 'Not specified',
      issues: [],
      flags: [],
    };
  }

  const sections = Array.isArray(notesJson.sections) ? notesJson.sections : [];

  const summariseSection = (section) => {
    if (!section) return null;
    const name = section.section || section.title || section.name || 'Section';
    const content = (section.content || section.text || section.naturalLanguage || '').trim();
    if (!content) return name;
    const clipped = content.slice(0, 140);
    return `${name}: ${clipped}${content.length > 140 ? '…' : ''}`;
  };

  const sectionSnippets = sections.length ? sections.slice(0, 5).map(summariseSection).filter(Boolean) : [];

  return {
    property:
      notesJson.propertyType ||
      notesJson.property ||
      notesJson.propertyDescription ||
      notesJson.customerSummary ||
      (sections.length ? 'Survey notes loaded' : 'Property details recorded'),
    bedrooms: notesJson.bedrooms || notesJson.bedroomCount || null,
    bathrooms: notesJson.bathrooms || notesJson.bathroomCount || null,
    currentSystem:
      notesJson.currentSystem ||
      notesJson.existingSystem ||
      notesJson.systemType ||
      'Existing system recorded',
    issues: notesJson.issues || notesJson.problems || sectionSnippets,
    flags: notesJson.flags || notesJson.risks || notesJson.missingInfo || notesJson.checkedItems || [],
  };
}

// Fallback "mini System Recommendation" using notes.json only.
// This is a heuristic engine for now. We can later replace it with a shared engine
// or API from the System-recommendation app.
function buildOptionsFromNotes(notesJson) {
  const property = extractPropertyFromNotes(notesJson);

  // Very simple heuristics: adjust these as needed when you see the real notes.json structure.
  const beds = Number(property.bedrooms || 0) || 0;
  const hasTwoOrMoreBathrooms = (Number(property.bathrooms || 0) || 0) >= 2;
  const current = (property.currentSystem || '').toLowerCase();

  const likelyHighDemand = beds >= 4 || hasTwoOrMoreBathrooms;
  const isCombiNow = current.includes('combi');
  const isRegularOrSystem =
    current.includes('regular') ||
    current.includes('system') ||
    current.includes('heat-only') ||
    current.includes('cylinder');

  // Decide main system type
  let recommendedType = 'combi';
  if (likelyHighDemand && isRegularOrSystem) {
    recommendedType = 'system'; // Cylinder-based, better for high demand
  }

  // Decide cylinder type / extras as simple tags (NOT thermal store).
  const baseTags = [];
  if (recommendedType === 'combi') {
    baseTags.push('combi');
  } else {
    baseTags.push('system', 'cylinder'); // conventional or unvented cylinder
  }

  // Very simple "extras" assumptions:
  const alwaysExtras = ['hive', 'filter', 'flush'];

  // Gold: best comfort + smart + future ready
  const goldTags = baseTags.concat(alwaysExtras);
  const goldBenefits = [
    'High efficiency system sized for your home.',
    'Improved comfort and more consistent hot water.',
    'Smart controls for easier scheduling and remote control.',
    'Good future-proofing for changing usage over time.',
  ];

  // Silver: strong but slightly simpler / cheaper
  const silverTags = baseTags.concat(['hive', 'filter']);
  const silverBenefits = [
    'Efficient system upgrade that improves comfort.',
    'Smart controls to help manage heating times.',
    'Includes system protection to help keep things cleaner.',
  ];

  // Bronze: basic compliance option
  const bronzeTags = baseTags.concat(['filter']);
  const bronzeBenefits = [
    'Meets minimum requirements and improves reliability.',
    'Includes basic system protection.',
    'Lower upfront investment compared to other options.',
  ];

  // Slightly adjust wording depending on main type
  const goldName =
    recommendedType === 'combi'
      ? 'Gold: High-efficiency combi with smart controls'
      : 'Gold: High-efficiency system boiler with cylinder and smart controls';

  const silverName =
    recommendedType === 'combi'
      ? 'Silver: Combi boiler with smart controls'
      : 'Silver: System boiler with cylinder and smart controls';

  const bronzeName =
    recommendedType === 'combi'
      ? 'Bronze: Combi boiler with basic controls'
      : 'Bronze: System boiler with cylinder and basic controls';

  return [
    {
      tier: 'gold',
      name: goldName,
      shortDescription: 'Our top recommendation based on your home and usage.',
      benefits: goldBenefits,
      visualTags: goldTags,
    },
    {
      tier: 'silver',
      name: silverName,
      shortDescription: 'A strong balance of performance and cost.',
      benefits: silverBenefits,
      visualTags: silverTags,
    },
    {
      tier: 'bronze',
      name: bronzeName,
      shortDescription: 'A simpler option that still upgrades your system.',
      benefits: bronzeBenefits,
      visualTags: bronzeTags,
    },
  ];
}

function buildOptionsFromSystem(systemJson) {
  let usedRealSystemJson = false;

  if (!systemJson || !Array.isArray(systemJson.options)) {
    const options = [
      {
        tier: 'gold',
        name: 'Recommended high-efficiency system',
        shortDescription: 'Our recommended system option based on your home and priorities.',
        benefits: [
          'Designed to improve comfort and reliability.',
          'Suitable for your property and usage.',
          'Future-proof choice with strong efficiency.',
        ],
        visualTags: ['combi'],
      },
      {
        tier: 'silver',
        name: 'Alternative option',
        shortDescription: 'A strong alternative with good performance.',
        benefits: ['Balanced performance and value.'],
        visualTags: ['system'],
      },
      {
        tier: 'bronze',
        name: 'Basic option',
        shortDescription: 'Meets minimum requirements at a lower upfront cost.',
        benefits: ['Lower initial investment.'],
        visualTags: ['regular'],
      },
    ];
    return { options, usedRealSystemJson };
  }

  usedRealSystemJson = true;
  const rawOptions = systemJson.options.slice(0, 3);
  const tiers = ['gold', 'silver', 'bronze'];

  const options = rawOptions.map((opt, index) => {
    const tier = opt.tier || tiers[index] || 'bronze';
    return {
      tier,
      name: opt.name || opt.title || `Option ${index + 1}`,
      shortDescription:
        opt.shortDescription ||
        opt.description ||
        'System recommendation generated for your home.',
      benefits:
        Array.isArray(opt.benefits) && opt.benefits.length > 0
          ? opt.benefits
          : (opt.features || []).slice(0, 5),
      visualTags: opt.visualTags || opt.tags || [],
    };
  });

  return { options, usedRealSystemJson };
}

function buildOptionsFromEngine(notesJson, transcriptJson) {
  if (
    !window.SystemRecommendationEngine ||
    typeof window.SystemRecommendationEngine.recommendForNotes !== 'function'
  ) {
    return { options: null, usedEngine: false };
  }

  try {
    const result = window.SystemRecommendationEngine.recommendForNotes(notesJson || {}, transcriptJson || {});
    if (!result || !Array.isArray(result.options) || !result.options.length) {
      return { options: null, usedEngine: false };
    }

    return { options: result.options, usedEngine: true };
  } catch (err) {
    console.error('Error calling SystemRecommendationEngine:', err);
    return { options: null, usedEngine: false };
  }
}

function buildProposalData({ transcriptJson, notesJson, systemJson }) {
  const customer = summariseTranscript(transcriptJson);
  const property = extractPropertyFromNotes(notesJson);

  let options;
  let sourceText;

  if (systemJson) {
    const { options: sysOptions, usedRealSystemJson } = buildOptionsFromSystem(systemJson);
    options = sysOptions;
    sourceText = usedRealSystemJson
      ? 'Options generated from uploaded System Recommendation JSON.'
      : 'Options generated using built-in defaults (System Recommendation JSON did not include an options array).';
  } else {
    const { options: engineOptions, usedEngine } = buildOptionsFromEngine(notesJson, transcriptJson);

    if (usedEngine && engineOptions && engineOptions.length) {
      options = engineOptions;
      sourceText = 'Options generated by the System-recommendation engine (live).';
    } else {
      options = buildOptionsFromNotes(notesJson);
      sourceText = 'Options auto-generated from your survey notes (System-recommendation engine not available).';
    }
  }

  // Update the note under the heading
  setOptionSourceNote(sourceText);

  return {
    createdAt: new Date(),
    customer,
    property,
    options,
  };
}

function renderProposal(proposalData) {
  outputEl.innerHTML = '';

  const { createdAt, customer, property, options } = proposalData;

  const gold = options.find((o) => o.tier === 'gold') || options[0];
  const silver = options.find((o) => o.tier === 'silver');
  const bronze = options.find((o) => o.tier === 'bronze');

  const page1 = document.createElement('section');
  page1.className = 'proposal-page';

  page1.innerHTML = `
    <header>
      <h1>Heating & Hot Water Proposal</h1>
      <p>Date: ${createdAt.toLocaleDateString()}</p>
    </header>

    <section>
      <h2 class="section-title">What you told us</h2>
      <p>${escapeHtml(customer.customerSummary || 'Customer summary not available.')}</p>
      ${renderListBlock('Your priorities', customer.priorities)}
      ${renderListBlock('Pain points', customer.painPoints)}
      ${renderListBlock('Constraints / preferences', customer.constraints)}
    </section>

    <section>
      <h2 class="section-title">Your home at a glance</h2>
      <ul>
        <li><strong>Property type:</strong> ${escapeHtml(property.property)}</li>
        ${property.bedrooms ? `<li><strong>Bedrooms:</strong> ${escapeHtml(String(property.bedrooms))}</li>` : ''}
        ${property.bathrooms ? `<li><strong>Bathrooms:</strong> ${escapeHtml(String(property.bathrooms))}</li>` : ''}
        <li><strong>Current system:</strong> ${escapeHtml(property.currentSystem)}</li>
      </ul>
      ${renderListBlock('Issues with your current system', property.issues)}
    </section>

    <section>
      <h2 class="section-title">Our recommended option (Gold)</h2>
      ${gold ? renderOptionCard(gold) : '<p>No recommendation available.</p>'}
      <p style="margin-top:0.75rem;">Use your gold pen to highlight this option when presenting.</p>
    </section>
  `;
  outputEl.appendChild(page1);

  const page2 = document.createElement('section');
  page2.className = 'proposal-page';

  page2.innerHTML = `
    <header>
      <h2 class="section-title">Your options: Gold, Silver & Bronze</h2>
      <p>We’ve grouped your options so you can easily compare a top-tier solution with lower-cost alternatives.</p>
    </header>
  `;

  const grid = document.createElement('div');
  grid.className = 'options-grid';

  if (gold) grid.appendChild(createOptionCardElement(gold, 'Gold'));
  if (silver) grid.appendChild(createOptionCardElement(silver, 'Silver'));
  if (bronze) grid.appendChild(createOptionCardElement(bronze, 'Bronze'));

  page2.appendChild(grid);
  outputEl.appendChild(page2);

  const page3 = document.createElement('section');
  page3.className = 'proposal-page';

  page3.innerHTML = `
    <section>
      <h2 class="section-title">What happens next</h2>
      <ol>
        <li>We agree the option that’s right for you (Gold, Silver or Bronze).</li>
        <li>We confirm the final specification and installation date.</li>
        <li>Our expert installer completes the work and tests the system.</li>
        <li>We show you how everything works and confirm your guarantees.</li>
      </ol>
    </section>

    <section>
      <h2 class="section-title">Important notes for your installation</h2>
      ${renderListBlock('Installation notes', property.flags)}
      <p>If any extra works are required (for example scaffolding, electrical upgrades or access adjustments), these will be discussed and agreed with you in advance.</p>
    </section>
  `;
  outputEl.appendChild(page3);
}

function renderListBlock(title, arr) {
  if (!arr || !arr.length) return '';
  const items = arr.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('');
  return `
    <h3>${escapeHtml(title)}</h3>
    <ul>${items}</ul>
  `;
}

function renderOptionCard(option) {
  const visualsHtml = renderVisuals(option.visualTags || []);
  return `
    <div class="option-card">
      <div class="option-tier gold">Gold – Recommended</div>
      <h3>${escapeHtml(option.name)}</h3>
      ${visualsHtml}
      <p>${escapeHtml(option.shortDescription)}</p>
      ${renderListBlock('Key benefits', option.benefits)}
    </div>
  `;
}

function createOptionCardElement(option, label) {
  const card = document.createElement('article');
  card.className = 'option-card';

  const tierClass = label.toLowerCase();
  const visualsHtml = renderVisuals(option.visualTags || []);

  card.innerHTML = `
    <div class="option-tier ${tierClass}">${escapeHtml(label)}</div>
    <h3>${escapeHtml(option.name)}</h3>
    ${visualsHtml}
    <p>${escapeHtml(option.shortDescription)}</p>
    ${renderListBlock('Key benefits', option.benefits)}
  `;
  return card;
}

function renderVisuals(tags) {
  if (!tags || !tags.length) return '';
  const imgs = tags
    .map((tag) => {
      const src = iconMap[tag];
      if (!src) return '';
      return `<img src="${src}" alt="${escapeHtml(tag)}" />`;
    })
    .filter(Boolean)
    .join('');
  if (!imgs) return '';
  return `<div class="option-visuals">${imgs}</div>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

announceAutosaveAvailability(loadLatestDepotSession());

if (generateBtn && printBtn) {
  generateBtn.addEventListener('click', async () => {
    setOptionSourceNote(''); // clear previous note

    const autosaveSnapshot = loadLatestDepotSession();
    const [fileTranscriptJson, fileNotesJson, systemJson] = await Promise.all([
      readJsonFile(transcriptInput),
      readJsonFile(notesInput),
      readJsonFile(systemInput),
    ]);

    const autosaveTranscript =
      autosaveSnapshot?.fullTranscript || autosaveSnapshot?.transcript || autosaveSnapshot?.text;

    const transcriptJson =
      fileTranscriptJson ||
      (autosaveTranscript ? { fullTranscript: autosaveTranscript, transcript: autosaveTranscript } : null);

    const notesJson =
      fileNotesJson ||
      (autosaveSnapshot
        ? {
            sections: autosaveSnapshot.sections || [],
            missingInfo: autosaveSnapshot.missingInfo || [],
            checkedItems: autosaveSnapshot.checkedItems || [],
            customerSummary: autosaveSnapshot.customerSummary || '',
          }
        : null);

    const usingAutosave = !fileTranscriptJson && !fileNotesJson && !!autosaveSnapshot;
    if (usingAutosave) {
      const stamp = formatSnapshotTimestamp(autosaveSnapshot);
      const label = stamp ? ` from ${stamp}` : '';
      setStatusMessage(`Using latest Depot Voice Notes autosave${label}.`);
    } else if (fileTranscriptJson || fileNotesJson) {
      setStatusMessage('Using uploaded files for this proposal.');
    } else {
      setStatusMessage('No data found. Upload the JSON exports from Depot Voice Notes to continue.');
    }

    const proposalData = buildProposalData({ transcriptJson, notesJson, systemJson });
    renderProposal(proposalData);
    printBtn.disabled = false;
  });

  printBtn.addEventListener('click', () => {
    window.print();
  });
}
