/**
 * Send Sections Module
 * Provides slide-over UI for viewing and copying sections to clipboard
 */

// State for the view mode
let viewMode = 'natural'; // 'natural' or 'automatic'

// Track the active slide-over and its sections
let activeSlideOver = null;
let activeSections = null;
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;
let isSpeaking = false;

/**
 * Show the send sections slide-over
 */
export function showSendSectionsSlideOver(sections) {
  // Close existing slide-over if any
  if (activeSlideOver) {
    closeSlideOver(activeSlideOver);
  }

  const slideOver = createSlideOverElement(sections);
  document.body.appendChild(slideOver);

  // Store references
  activeSlideOver = slideOver;
  activeSections = sections;

  // Trigger animation
  setTimeout(() => {
    slideOver.classList.add('active');
  }, 10);

  // Setup event listeners
  setupSlideOverEvents(slideOver, sections);
}

/**
 * Update the active slide-over with new sections
 */
export function updateSendSectionsSlideOver(sections) {
  if (!activeSlideOver) {
    return; // No active slide-over to update
  }

  // Update stored sections
  activeSections = sections;

  // Re-render the content
  const contentEl = activeSlideOver.querySelector('#sectionsContent');
  if (contentEl) {
    contentEl.innerHTML = renderSectionsList(sections);

    // Re-attach copy button listeners
    const copyBtns = contentEl.querySelectorAll('.copy-section-btn');
    copyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.sectionIndex, 10);
        const section = sections[index];
        if (section) {
          copySectionToClipboard(section, e.currentTarget);
        }
      });
    });
  }
}

/**
 * Create the slide-over element
 */
function createSlideOverElement(sections) {
  const slideOver = document.createElement('div');
  slideOver.id = 'sendSectionsSlideOver';
  slideOver.className = 'slide-over-container';

  slideOver.innerHTML = `
    <div class="slide-over-backdrop"></div>
    <div class="slide-over-panel">
      <div class="slide-over-header">
        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
          <h2 style="margin: 0;">Send Sections</h2>
          <button id="readAloudBtn" class="read-aloud-btn" title="Read notes aloud" style="margin-left: 12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
            <span id="readAloudText">Read Aloud</span>
          </button>
          <div class="view-mode-toggle" style="display: flex; align-items: center; gap: 8px; margin-left: auto; margin-right: 40px;">
            <span style="font-size: 0.75rem; font-weight: 600; color: white; opacity: ${viewMode === 'automatic' ? '1' : '0.6'};">Automatic</span>
            <div id="viewModeToggle" class="toggle-switch ${viewMode === 'natural' ? 'active' : ''}">
              <div class="toggle-slider"></div>
            </div>
            <span style="font-size: 0.75rem; font-weight: 600; color: white; opacity: ${viewMode === 'natural' ? '1' : '0.6'};">Natural</span>
          </div>
        </div>
        <button class="close-slide-over-btn" aria-label="Close">
          <span style="font-size: 1.5rem;">×</span>
        </button>
      </div>
      <div class="slide-over-content" id="sectionsContent">
        ${renderSectionsList(sections)}
      </div>
    </div>
  `;

  return slideOver;
}

/**
 * Render the sections list
 */
function renderSectionsList(sections) {
  if (!sections || sections.length === 0) {
    return `
      <div style="text-align: center; padding: 40px; color: var(--muted);">
        <div style="font-size: 2rem; margin-bottom: 12px;">📝</div>
        <div style="font-size: 0.9rem;">No sections available yet</div>
        <div style="font-size: 0.75rem; margin-top: 8px;">Sections will appear here as the transcript is processed</div>
      </div>
    `;
  }

  return sections.map((section, index) => {
    // Determine what content to show based on view mode
    let content;
    let title;

    // Handle both old format (section.content) and new format (section.plainText/naturalLanguage)
    if (viewMode === 'natural') {
      content = section.naturalLanguage || section.natural_language || section.summary || section.notes || section.content || '';
      title = section.section || section.title || 'Untitled Section';
    } else {
      content = section.plainText || section.plain_text || section.text || section.content || '';
      title = section.section || section.title || 'Untitled Section';
    }

    return `
      <div class="section-card" data-section-index="${index}">
        <div class="section-card-header">
          <h3 class="section-card-title">${escapeHtml(title)}</h3>
          <button class="copy-section-btn" data-section-index="${index}" title="Copy to clipboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
        </div>
        <div class="section-card-content">
          ${formatSectionContent(content)}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Format section content for display
 */
function formatSectionContent(content) {
  if (!content) {
    return '<div style="color: var(--muted); font-style: italic;">No content</div>';
  }

  // Convert newlines to <br> and preserve formatting
  const formatted = escapeHtml(content)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  return `<div class="section-content-text">${formatted}</div>`;
}

/**
 * Setup event listeners for the slide-over
 */
function setupSlideOverEvents(slideOver, sections) {
  // Close button
  const closeBtn = slideOver.querySelector('.close-slide-over-btn');
  closeBtn.addEventListener('click', () => {
    closeSlideOver(slideOver);
  });

  // Backdrop click
  const backdrop = slideOver.querySelector('.slide-over-backdrop');
  backdrop.addEventListener('click', () => {
    closeSlideOver(slideOver);
  });

  // Read aloud button
  const readAloudBtn = slideOver.querySelector('#readAloudBtn');
  if (readAloudBtn) {
    readAloudBtn.addEventListener('click', () => {
      toggleReadAloud(readAloudBtn, sections);
    });
  }

  // View mode toggle
  const viewModeToggle = slideOver.querySelector('#viewModeToggle');
  if (viewModeToggle) {
    viewModeToggle.addEventListener('click', () => {
      // Stop reading if switching modes
      if (isSpeaking) {
        stopReadAloud();
        updateReadAloudButton(readAloudBtn, false);
      }

      // Toggle view mode
      viewMode = viewMode === 'natural' ? 'automatic' : 'natural';

      // Update toggle visual state
      viewModeToggle.classList.toggle('active', viewMode === 'natural');

      // Update label opacity
      const toggleContainer = slideOver.querySelector('.view-mode-toggle');
      const labels = toggleContainer.querySelectorAll('span');
      labels[0].style.opacity = viewMode === 'automatic' ? '1' : '0.6';
      labels[1].style.opacity = viewMode === 'natural' ? '1' : '0.6';

      // Re-render sections with new mode
      const contentEl = slideOver.querySelector('#sectionsContent');
      if (contentEl) {
        contentEl.innerHTML = renderSectionsList(sections);

        // Re-attach copy button listeners
        const copyBtns = contentEl.querySelectorAll('.copy-section-btn');
        copyBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.dataset.sectionIndex, 10);
            const section = sections[index];
            if (section) {
              copySectionToClipboard(section, e.currentTarget);
            }
          });
        });
      }
    });
  }

  // Copy buttons
  const copyBtns = slideOver.querySelectorAll('.copy-section-btn');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.sectionIndex, 10);
      const section = sections[index];
      if (section) {
        copySectionToClipboard(section, e.currentTarget);
      }
    });
  });

  // Escape key to close
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeSlideOver(slideOver);
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

/**
 * Toggle read aloud functionality
 */
function toggleReadAloud(buttonElement, sections) {
  if (isSpeaking) {
    stopReadAloud();
    updateReadAloudButton(buttonElement, false);
  } else {
    startReadAloud(sections, buttonElement);
  }
}

/**
 * Start reading sections aloud
 */
function startReadAloud(sections, buttonElement) {
  if (!sections || sections.length === 0) {
    return;
  }

  // Stop any ongoing speech
  stopReadAloud();

  // Gather all text to read
  const textToRead = sections.map(section => {
    const title = section.section || section.title || 'Untitled Section';
    let content;
    if (viewMode === 'natural') {
      content = section.naturalLanguage || section.natural_language || section.summary || section.notes || section.content || '';
    } else {
      content = section.plainText || section.plain_text || section.text || section.content || '';
    }
    return `${title}. ${content}`;
  }).join('. ');

  // Create utterance
  currentUtterance = new SpeechSynthesisUtterance(textToRead);
  currentUtterance.rate = 1.0; // Normal speed
  currentUtterance.pitch = 1.0; // Normal pitch
  currentUtterance.volume = 1.0; // Full volume

  // Event listeners
  currentUtterance.onend = () => {
    isSpeaking = false;
    updateReadAloudButton(buttonElement, false);
  };

  currentUtterance.onerror = (event) => {
    console.error('Speech synthesis error:', event);
    isSpeaking = false;
    updateReadAloudButton(buttonElement, false);
  };

  // Start speaking
  speechSynthesis.speak(currentUtterance);
  isSpeaking = true;
  updateReadAloudButton(buttonElement, true);
}

/**
 * Stop reading aloud
 */
function stopReadAloud() {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
  isSpeaking = false;
  currentUtterance = null;
}

/**
 * Update read aloud button appearance
 */
function updateReadAloudButton(buttonElement, isReading) {
  const textElement = buttonElement.querySelector('#readAloudText');
  if (textElement) {
    textElement.textContent = isReading ? 'Stop' : 'Read Aloud';
  }

  if (isReading) {
    buttonElement.classList.add('reading');
  } else {
    buttonElement.classList.remove('reading');
  }
}

/**
 * Copy section to clipboard
 */
async function copySectionToClipboard(section, buttonElement) {
  const text = formatSectionForClipboard(section);

  try {
    await navigator.clipboard.writeText(text);

    // Visual feedback
    const originalHtml = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    buttonElement.classList.add('copied');

    setTimeout(() => {
      buttonElement.innerHTML = originalHtml;
      buttonElement.classList.remove('copied');
    }, 2000);

  } catch (err) {
    console.error('Failed to copy to clipboard:', err);

    // Fallback: show error
    const originalHtml = buttonElement.innerHTML;
    buttonElement.innerHTML = `
      <span style="color: var(--danger);">Failed</span>
    `;

    setTimeout(() => {
      buttonElement.innerHTML = originalHtml;
    }, 2000);
  }
}

/**
 * Format section for clipboard (plain text)
 */
function formatSectionForClipboard(section) {
  // Use the content based on current view mode
  let content;
  if (viewMode === 'natural') {
    content = section.naturalLanguage || section.natural_language || section.summary || section.notes || section.content || '';
  } else {
    content = section.plainText || section.plain_text || section.text || section.content || '';
  }

  return content;
}

/**
 * Close the slide-over
 */
function closeSlideOver(slideOver) {
  // Stop any ongoing speech
  stopReadAloud();

  // Clear references
  if (slideOver === activeSlideOver) {
    activeSlideOver = null;
    activeSections = null;
  }

  slideOver.classList.remove('active');

  setTimeout(() => {
    if (slideOver.parentNode) {
      slideOver.parentNode.removeChild(slideOver);
    }
  }, 300); // Match CSS transition duration
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Copy all sections as a single text block
 */
export function copyAllSections(sections) {
  if (!sections || sections.length === 0) {
    return;
  }

  const allText = sections.map(section => formatSectionForClipboard(section)).join('\n\n---\n\n');

  navigator.clipboard.writeText(allText)
    .then(() => {
      console.log('All sections copied to clipboard');
    })
    .catch(err => {
      console.error('Failed to copy all sections:', err);
    });
}
