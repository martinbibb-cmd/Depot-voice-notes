/**
 * what3words Integration Module
 * Provides location lookup and auto-paste to delivery and office notes
 */

let currentW3WAddress = '';
let w3wModalInstance = null;
let w3wPopupWindow = null;

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
            <li>Click "Open what3words Map" to open what3words.com in a new window</li>
            <li>Find your location on the what3words map</li>
            <li>Copy the 3 words address (e.g., ///filled.index.sooner)</li>
            <li>Paste it into the input field below</li>
            <li>Click "Add to Delivery & Office Notes"</li>
          </ol>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <button class="w3w-open-btn" id="w3wOpenBtn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Open what3words Map
          </button>
        </div>
        <div class="w3w-input-container">
          <input
            type="text"
            class="w3w-input"
            id="w3wAddressInput"
            placeholder="Paste what3words address here (e.g., ///filled.index.sooner)"
          />
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
          Add to Delivery & Office Notes
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
  const openBtn = modal.querySelector('#w3wOpenBtn');
  const pasteBtn = modal.querySelector('#w3wPasteBtn');
  const addressInput = modal.querySelector('#w3wAddressInput');

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

  // Open what3words button
  openBtn.addEventListener('click', () => {
    openWhat3WordsWindow();
  });

  // Address input change - enable/disable paste button
  addressInput.addEventListener('input', () => {
    const value = addressInput.value.trim();
    const isValid = validateW3WAddress(value);
    pasteBtn.disabled = !isValid;

    if (isValid) {
      currentW3WAddress = value;
      addressInput.style.borderColor = '#10b981';
      addressInput.style.backgroundColor = '#ecfdf5';
    } else {
      addressInput.style.borderColor = '';
      addressInput.style.backgroundColor = '';
    }
  });

  // Paste button
  pasteBtn.addEventListener('click', () => {
    if (currentW3WAddress) {
      pasteToDeliveryAndOfficeNotes(currentW3WAddress);
      closeW3WModal(modal);
    }
  });

  // Focus input
  setTimeout(() => addressInput.focus(), 100);
}

/**
 * Open what3words in a new window
 */
function openWhat3WordsWindow() {
  const width = 800;
  const height = 600;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  // Close previous popup if exists
  if (w3wPopupWindow && !w3wPopupWindow.closed) {
    w3wPopupWindow.close();
  }

  // Open what3words map
  w3wPopupWindow = window.open(
    'https://what3words.com/daring.lion.race',
    'what3words',
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=yes,status=no`
  );

  if (w3wPopupWindow) {
    w3wPopupWindow.focus();
  } else {
    alert('Please allow popups for this site to use what3words integration.');
  }
}

/**
 * Validate what3words address format
 */
function validateW3WAddress(address) {
  if (!address) return false;

  // Remove leading slashes if present
  const cleaned = address.replace(/^\/+/, '');

  // Check format: should be 3 words separated by dots
  const parts = cleaned.split('.');

  // Must have exactly 3 parts
  if (parts.length !== 3) return false;

  // Each part should only contain letters (no numbers or special chars)
  const wordPattern = /^[a-zA-Z]+$/;
  return parts.every(part => part.length > 0 && wordPattern.test(part));
}

/**
 * Paste what3words address to Delivery notes and Office notes sections
 */
function pasteToDeliveryAndOfficeNotes(address) {
  if (!address) return;

  // Normalize address format (ensure it has ///)
  let normalizedAddress = address.trim();
  if (!normalizedAddress.startsWith('///')) {
    // Remove any leading slashes and add exactly three
    normalizedAddress = '///' + normalizedAddress.replace(/^\/+/, '');
  }

  // Get the current sections from the app state
  const sections = window.lastSections || window.APP_STATE?.sections || [];

  // Find Delivery notes and Office notes sections
  const deliveryIndex = sections.findIndex(s =>
    s.section?.toLowerCase().includes('delivery') && s.section?.toLowerCase().includes('note')
  );
  const officeIndex = sections.findIndex(s =>
    s.section?.toLowerCase().includes('office') && s.section?.toLowerCase().includes('note')
  );

  const locationText = `Location: ${normalizedAddress}`;
  let updated = false;

  // Update Delivery notes
  if (deliveryIndex !== -1) {
    const section = sections[deliveryIndex];
    const plainText = section.plainText || '';
    const naturalLanguage = section.naturalLanguage || '';

    // Add to plainText if not already present
    if (!plainText.includes(normalizedAddress)) {
      const newPlainText = plainText
        ? `${plainText}; ${locationText};`
        : `${locationText};`;

      section.plainText = newPlainText;
      updated = true;
    }

    // Add to naturalLanguage if not already present
    if (!naturalLanguage.includes(normalizedAddress)) {
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
    if (!plainText.includes(normalizedAddress)) {
      const newPlainText = plainText
        ? `${plainText}; ${locationText};`
        : `${locationText};`;

      section.plainText = newPlainText;
      updated = true;
    }

    // Add to naturalLanguage if not already present
    if (!naturalLanguage.includes(normalizedAddress)) {
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

    console.log('what3words address added to Delivery notes and Office notes:', normalizedAddress);
  }
}

/**
 * Close the what3words modal
 */
function closeW3WModal(modal) {
  // Close popup window if open
  if (w3wPopupWindow && !w3wPopupWindow.closed) {
    w3wPopupWindow.close();
    w3wPopupWindow = null;
  }

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
