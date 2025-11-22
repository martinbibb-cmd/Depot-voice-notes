/**
 * what3words Integration Module
 * Provides location lookup and auto-paste to delivery and office notes
 */

let currentW3WAddress = '';
let w3wModalInstance = null;

/**
 * Show the what3words modal
 */
export function showWhat3WordsModal() {
  // Close existing modal if any
  if (w3wModalInstance) {
    closeW3WModal(w3wModalInstance);
  }

  const modal = createW3WModal();
  document.body.appendChild(modal);
  w3wModalInstance = modal;

  // Trigger animation
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);

  setupW3WModalEvents(modal);
}

/**
 * Create the what3words modal element
 */
function createW3WModal() {
  const modal = document.createElement('div');
  modal.className = 'w3w-modal-backdrop';
  modal.innerHTML = `
    <div class="w3w-modal">
      <div class="w3w-modal-header">
        <h3>
          <span>📍</span>
          <span>what3words Location</span>
        </h3>
        <button class="w3w-modal-close" aria-label="Close">×</button>
      </div>
      <div class="w3w-modal-body">
        <div class="w3w-instructions">
          <h4>How to use:</h4>
          <ol>
            <li>Click on the map to select a location</li>
            <li>The what3words address will appear in the input below</li>
            <li>Click "Copy & Paste to Notes" to automatically add it to Delivery and Office notes</li>
          </ol>
        </div>
        <div class="w3w-map-container" id="w3wMapContainer">
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #64748b;">
            <div style="text-align: center;">
              <div style="font-size: 2rem; margin-bottom: 12px;">🗺️</div>
              <div style="font-size: 0.9rem; font-weight: 600;">Loading map...</div>
              <div style="font-size: 0.75rem; margin-top: 8px;">Click anywhere to get what3words address</div>
            </div>
          </div>
        </div>
        <div class="w3w-input-container">
          <input
            type="text"
            class="w3w-input"
            id="w3wAddressInput"
            placeholder="///click.on.map"
            readonly
          />
          <button class="w3w-copy-btn" id="w3wCopyBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
      </div>
      <div class="w3w-modal-footer">
        <div class="w3w-footer-info">
          Address will be added to both Delivery notes and Office notes
        </div>
        <button class="w3w-paste-btn" id="w3wPasteBtn" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Copy & Paste to Notes
        </button>
      </div>
    </div>
  `;
  return modal;
}

/**
 * Setup event listeners for the modal
 */
function setupW3WModalEvents(modal) {
  const closeBtn = modal.querySelector('.w3w-modal-close');
  const copyBtn = modal.querySelector('#w3wCopyBtn');
  const pasteBtn = modal.querySelector('#w3wPasteBtn');
  const addressInput = modal.querySelector('#w3wAddressInput');
  const mapContainer = modal.querySelector('#w3wMapContainer');

  // Close button
  closeBtn.addEventListener('click', () => {
    closeW3WModal(modal);
  });

  // Backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeW3WModal(modal);
    }
  });

  // Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeW3WModal(modal);
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);

  // Copy button
  copyBtn.addEventListener('click', async () => {
    if (currentW3WAddress) {
      try {
        await navigator.clipboard.writeText(currentW3WAddress);
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Copied!
        `;
        copyBtn.classList.add('copied');

        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  });

  // Paste button
  pasteBtn.addEventListener('click', () => {
    if (currentW3WAddress) {
      pasteToDeliveryAndOfficeNotes(currentW3WAddress);
      closeW3WModal(modal);
    }
  });

  // Initialize the map
  initializeW3WMap(mapContainer, addressInput, pasteBtn);
}

/**
 * Initialize the what3words map
 */
function initializeW3WMap(container, addressInput, pasteBtn) {
  // Simple click-to-get-location implementation
  // In a real implementation, you would integrate the what3words API
  container.innerHTML = `
    <div style="width: 100%; height: 100%; position: relative; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); cursor: crosshair;" id="w3wClickArea">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: white; pointer-events: none;">
        <div style="font-size: 3rem; margin-bottom: 12px;">🗺️</div>
        <div style="font-size: 1.1rem; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">Click anywhere on the map</div>
        <div style="font-size: 0.85rem; margin-top: 8px; opacity: 0.9;">to get a what3words address</div>
      </div>
      <div id="w3wMarker" style="display: none; position: absolute; width: 32px; height: 32px; margin-left: -16px; margin-top: -32px; pointer-events: none;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3" fill="white"></circle>
        </svg>
      </div>
    </div>
  `;

  const clickArea = container.querySelector('#w3wClickArea');
  const marker = container.querySelector('#w3wMarker');

  clickArea.addEventListener('click', (e) => {
    const rect = clickArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Generate a mock what3words address based on click position
    const words = generateMockW3WAddress(x, y);
    currentW3WAddress = `///${words}`;

    // Update input
    addressInput.value = currentW3WAddress;

    // Enable paste button
    pasteBtn.disabled = false;

    // Show marker
    marker.style.display = 'block';
    marker.style.left = x + 'px';
    marker.style.top = y + 'px';

    // Visual feedback
    addressInput.style.borderColor = '#10b981';
    addressInput.style.backgroundColor = '#ecfdf5';
    setTimeout(() => {
      addressInput.style.borderColor = '';
      addressInput.style.backgroundColor = '';
    }, 1000);
  });
}

/**
 * Generate a mock what3words address
 * In production, this would call the what3words API
 */
function generateMockW3WAddress(x, y) {
  const words1 = ['filled', 'index', 'table', 'atomic', 'silent', 'rapid', 'tender', 'golden', 'silver', 'marine'];
  const words2 = ['surely', 'simply', 'kindly', 'deeply', 'widely', 'mainly', 'partly', 'truly', 'newly', 'duly'];
  const words3 = ['spoon', 'brick', 'stone', 'cloud', 'river', 'mount', 'field', 'grove', 'beach', 'trail'];

  const idx1 = Math.floor(x / 40) % words1.length;
  const idx2 = Math.floor(y / 40) % words2.length;
  const idx3 = Math.floor((x + y) / 50) % words3.length;

  return `${words1[idx1]}.${words2[idx2]}.${words3[idx3]}`;
}

/**
 * Paste what3words address to Delivery notes and Office notes sections
 */
function pasteToDeliveryAndOfficeNotes(address) {
  if (!address) return;

  // Get the current sections from the app state
  const sections = window.lastSections || window.APP_STATE?.sections || [];

  // Find Delivery notes and Office notes sections
  const deliveryIndex = sections.findIndex(s =>
    s.section?.toLowerCase().includes('delivery') && s.section?.toLowerCase().includes('note')
  );
  const officeIndex = sections.findIndex(s =>
    s.section?.toLowerCase().includes('office') && s.section?.toLowerCase().includes('note')
  );

  const locationText = `Location: ${address}`;
  let updated = false;

  // Update Delivery notes
  if (deliveryIndex !== -1) {
    const section = sections[deliveryIndex];
    const plainText = section.plainText || '';
    const naturalLanguage = section.naturalLanguage || '';

    // Add to plainText if not already present
    if (!plainText.includes(address)) {
      const newPlainText = plainText
        ? `${plainText}; ${locationText};`
        : `${locationText};`;

      section.plainText = newPlainText;
      updated = true;
    }

    // Add to naturalLanguage if not already present
    if (!naturalLanguage.includes(address)) {
      const newNaturalLanguage = naturalLanguage
        ? `${naturalLanguage} ${locationText}`
        : locationText;

      section.naturalLanguage = newNaturalLanguage;
      updated = true;
    }
  }

  // Update Office notes
  if (officeIndex !== -1) {
    const section = sections[officeIndex];
    const plainText = section.plainText || '';
    const naturalLanguage = section.naturalLanguage || '';

    // Add to plainText if not already present
    if (!plainText.includes(address)) {
      const newPlainText = plainText
        ? `${plainText}; ${locationText};`
        : `${locationText};`;

      section.plainText = newPlainText;
      updated = true;
    }

    // Add to naturalLanguage if not already present
    if (!naturalLanguage.includes(address)) {
      const newNaturalLanguage = naturalLanguage
        ? `${naturalLanguage} ${locationText}`
        : locationText;

      section.naturalLanguage = newNaturalLanguage;
      updated = true;
    }
  }

  if (updated) {
    // Trigger state update
    if (window.lastSections) {
      window.lastSections = sections;
    }
    if (window.APP_STATE) {
      window.APP_STATE.sections = sections;
      window.APP_STATE.notes = sections;
    }

    // Refresh UI
    if (window.refreshUiFromState) {
      window.refreshUiFromState();
    }

    // Save to localStorage
    if (window.saveToLocalStorage) {
      window.saveToLocalStorage();
    }

    console.log('what3words address added to Delivery notes and Office notes:', address);
  }
}

/**
 * Close the what3words modal
 */
function closeW3WModal(modal) {
  if (modal === w3wModalInstance) {
    w3wModalInstance = null;
    currentW3WAddress = '';
  }

  modal.classList.add('closing');

  setTimeout(() => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }, 200);
}

/**
 * Initialize the what3words button
 */
export function initWhat3Words() {
  const btn = document.getElementById('what3wordsBtn');
  if (btn) {
    btn.addEventListener('click', showWhat3WordsModal);
  }
}
