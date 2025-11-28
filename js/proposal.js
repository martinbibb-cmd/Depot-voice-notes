import { buildPresentation } from '../src/presentation/buildPresentation.js';
import { loadSessionFromStorage, migrateLegacySession } from '../src/state/sessionStore.js';

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
      <p>We couldn’t find a saved survey session to build this presentation.</p>
      <p>Please capture a Depot Voice Notes session or import a saved JSON, then reload this page.</p>
    </div>
  `;
}

function renderPresentationDocument(doc) {
  const container = document.createElement('div');
  container.className = 'presentation-document';

  const heading = document.createElement('h2');
  heading.textContent = doc.title;
  container.appendChild(heading);

  doc.sections.forEach((section) => {
    const sec = document.createElement('section');
    sec.className = 'presentation-section card';

    const title = document.createElement('h3');
    title.textContent = section.title;
    sec.appendChild(title);

    if (section.body) {
      const p = document.createElement('p');
      p.textContent = section.body;
      sec.appendChild(p);
    }

    if (Array.isArray(section.items) && section.items.length) {
      const ul = document.createElement('ul');
      section.items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      sec.appendChild(ul);
    }

    container.appendChild(sec);
  });

  (doc.tables || []).forEach((table) => {
    const wrapper = document.createElement('section');
    wrapper.className = 'presentation-table card';
    if (table.title) {
      const t = document.createElement('h4');
      t.textContent = table.title;
      wrapper.appendChild(t);
    }

    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    table.headers.forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = cell === null || cell === undefined ? '' : String(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrapper.appendChild(tbl);
    container.appendChild(wrapper);
  });

  return container;
}

function renderPackSwitcher(bundle, onSelect) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pack-switcher';

  const packs = [
    { key: 'customer', label: 'Customer pack', doc: bundle.customerPack },
    { key: 'installer', label: 'Installer pack', doc: bundle.installerPack },
    { key: 'office', label: 'Office pack', doc: bundle.officePack }
  ];

  packs.forEach((pack, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-secondary ${idx === 0 ? 'active' : ''}`;
    btn.textContent = pack.label;
    btn.addEventListener('click', () => {
      wrapper.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(pack.doc);
    });
    wrapper.appendChild(btn);
  });

  return wrapper;
}

function hydrateSession() {
  const stored = loadSessionFromStorage();
  if (stored) return stored;
  const legacy = loadTranscriptJson();
  if (legacy) return migrateLegacySession(legacy);
  return migrateLegacySession({});
}

function populateHeader(session) {
  setText('customer-name', session.meta?.customerName || 'Not specified');
  setText('customer-address', session.meta?.customerAddress || 'Not specified');
  setText('property-type', session.existingSystem?.systemType || 'Not specified');
  setText(
    'property-summary',
    session.vulnerability?.reasonForQuotation || session.ai?.customerSummary || ''
  );
  setText('current-system', session.existingSystem?.systemType || session.existingSystem?.systemHealth);
  setText('special-notes', session.ai?.customerSummary || session.vulnerability?.accessibilityNotes);
}

function initProposal() {
  setText('proposal-date', getTodayDisplayDate());
  const session = hydrateSession();

  if (!session || (!session.sections?.length && !session.fullTranscript)) {
    renderNoData();
    return;
  }

  populateHeader(session);
  const bundle = buildPresentation(session);
  const container = document.getElementById('proposal-options-container');
  if (!container) return;

  container.innerHTML = '';
  const switcher = renderPackSwitcher(bundle, (doc) => {
    container.replaceChildren(switcher, renderPresentationDocument(doc));
  });

  container.appendChild(switcher);
  container.appendChild(renderPresentationDocument(bundle.customerPack));
}

document.addEventListener('DOMContentLoaded', initProposal);
