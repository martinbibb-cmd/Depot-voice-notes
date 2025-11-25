const transcriptInput = document.getElementById('transcriptFile');
const notesInput = document.getElementById('notesFile');
const systemInput = document.getElementById('systemFile');
const generateBtn = document.getElementById('generateProposalBtn');
const printBtn = document.getElementById('printProposalBtn');
const outputEl = document.getElementById('proposalOutput');

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

  const rawText = transcriptJson.text || transcriptJson.transcript || '';
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

  return {
    property: notesJson.propertyType || notesJson.property || 'Property details recorded',
    bedrooms: notesJson.bedrooms || null,
    bathrooms: notesJson.bathrooms || null,
    currentSystem: notesJson.currentSystem || notesJson.existingSystem || 'Existing system recorded',
    issues: notesJson.issues || [],
    flags: notesJson.flags || notesJson.risks || [],
  };
}

function buildOptionsFromSystem(systemJson) {
  if (!systemJson || !Array.isArray(systemJson.options)) {
    return [
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
  }

  const rawOptions = systemJson.options.slice(0, 3);
  const tiers = ['gold', 'silver', 'bronze'];

  return rawOptions.map((opt, index) => {
    const tier = opt.tier || tiers[index] || 'bronze';
    return {
      tier,
      name: opt.name || opt.title || `Option ${index + 1}`,
      shortDescription: opt.shortDescription || opt.description || 'System recommendation generated for your home.',
      benefits: Array.isArray(opt.benefits) && opt.benefits.length > 0
        ? opt.benefits
        : (opt.features || []).slice(0, 5),
      visualTags: opt.visualTags || opt.tags || [],
    };
  });
}

function buildProposalData({ transcriptJson, notesJson, systemJson }) {
  const customer = summariseTranscript(transcriptJson);
  const property = extractPropertyFromNotes(notesJson);
  const options = buildOptionsFromSystem(systemJson);

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

if (generateBtn && printBtn) {
  generateBtn.addEventListener('click', async () => {
    const [transcriptJson, notesJson, systemJson] = await Promise.all([
      readJsonFile(transcriptInput),
      readJsonFile(notesInput),
      readJsonFile(systemInput),
    ]);

    const proposalData = buildProposalData({ transcriptJson, notesJson, systemJson });
    renderProposal(proposalData);
    printBtn.disabled = false;
  });

  printBtn.addEventListener('click', () => {
    window.print();
  });
}
