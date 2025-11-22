/**
 * what3words Integration Module
 * Provides location lookup and auto-paste to delivery and office notes
 */

let currentW3WAddress = '';
let w3wModalInstance = null;
let w3wPopupWindow = null;
let pasteListenerActive = false;
let globalPasteHandler = null;

/**
 * Show the what3words modal and popup
 */
export function showWhat3WordsModal() {
  // Close existing modal if any
  if (w3wModalInstance) {
    closeW3WModal(w3wModalInstance);
  }

  // Open the what3words popup window immediately
  openWhat3WordsWindow();

  // Create a simplified modal with paste area
  const modal = createW3WModal();
  document.body.appendChild(modal);
  w3wModalInstance = modal;

  // Trigger animation
  setTimeout(() => {
    modal.classList.add('active');
  }, 10);

  setupW3WModalEvents(modal);

  // Activate global paste listener
  activatePasteListener();
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
          <p style="margin: 0 0 15px 0; color: #059669; font-weight: 500;">
            ✓ what3words map opened in popup window
          </p>
          <h4>Quick steps:</h4>
          <ol>
            <li>Find your location on the what3words map</li>
            <li>Copy the 3 words address (e.g., ///filled.index.sooner)</li>
            <li>Paste it into the box below</li>
          </ol>
        </div>
        <div class="w3w-paste-area">
          <div class="w3w-paste-box" id="w3wPasteBox" contenteditable="true" data-placeholder="Paste what3words address here (e.g., ///filled.index.sooner)">
          </div>
          <div class="w3w-status" id="w3wStatus"></div>
        </div>
      </div>
      <div class="w3w-modal-footer">
        <div class="w3w-footer-info">
          Address will be automatically added to Delivery notes and Office notes
        </div>
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
  const pasteBox = modal.querySelector('#w3wPasteBox');
  const statusDiv = modal.querySelector('#w3wStatus');

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

  // Paste event in the paste box
  pasteBox.addEventListener('paste', (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    handlePastedAddress(pastedText, pasteBox, statusDiv, modal);
  });

  // Input event for typed text (less common but possible)
  pasteBox.addEventListener('input', () => {
    const text = pasteBox.textContent.trim();
    if (text) {
      handlePastedAddress(text, pasteBox, statusDiv, modal);
    }
  });

  // Focus paste box
  setTimeout(() => pasteBox.focus(), 100);
}

/**
 * Handle pasted what3words address
 */
function handlePastedAddress(text, pasteBox, statusDiv, modal) {
  const trimmedText = text.trim();
  const isValid = validateW3WAddress(trimmedText);

  if (isValid) {
    // Show success status
    statusDiv.innerHTML = '✓ Valid what3words address detected!';
    statusDiv.style.color = '#059669';
    statusDiv.style.fontWeight = '500';
    pasteBox.style.borderColor = '#10b981';
    pasteBox.style.backgroundColor = '#ecfdf5';
    pasteBox.textContent = trimmedText;

    // Auto-populate notes after a brief delay
    setTimeout(() => {
      pasteToDeliveryAndOfficeNotes(trimmedText);

      // Show success message
      statusDiv.innerHTML = '✓ Added to Delivery notes and Office notes!';

      // Close modal and popup after 1.5 seconds
      setTimeout(() => {
        closeW3WModal(modal);
      }, 1500);
    }, 500);
  } else {
    // Show error status
    statusDiv.innerHTML = '✗ Invalid format. Expected 3 words separated by dots (e.g., ///filled.index.sooner)';
    statusDiv.style.color = '#dc2626';
    statusDiv.style.fontWeight = '400';
    pasteBox.style.borderColor = '#ef4444';
    pasteBox.style.backgroundColor = '#fef2f2';
    pasteBox.textContent = trimmedText;
  }
}

/**
 * Activate global paste listener
 */
function activatePasteListener() {
  if (pasteListenerActive) return;

  globalPasteHandler = (e) => {
    // Only process if modal is open
    if (!w3wModalInstance) return;

    // Don't interfere with paste in the modal's paste box
    const pasteBox = document.getElementById('w3wPasteBox');
    if (e.target === pasteBox) return;

    const pastedText = e.clipboardData?.getData('text');
    if (pastedText) {
      const isValid = validateW3WAddress(pastedText);
      if (isValid && pasteBox) {
        e.preventDefault();
        const statusDiv = document.getElementById('w3wStatus');
        handlePastedAddress(pastedText, pasteBox, statusDiv, w3wModalInstance);
      }
    }
  };

  document.addEventListener('paste', globalPasteHandler, true);
  pasteListenerActive = true;
}

/**
 * Deactivate global paste listener
 */
function deactivatePasteListener() {
  if (globalPasteHandler) {
    document.removeEventListener('paste', globalPasteHandler, true);
    globalPasteHandler = null;
  }
  pasteListenerActive = false;
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
  // Deactivate global paste listener
  deactivatePasteListener();

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
