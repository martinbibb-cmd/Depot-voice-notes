/**
 * Send Sections Module
 * Provides slide-over UI for viewing and copying sections to clipboard
 */

// State for the view mode
let viewMode = 'natural'; // 'natural' or 'automatic'

/**
 * Show the send sections slide-over
 */
export function showSendSectionsSlideOver(sections) {
  const slideOver = createSlideOverElement(sections);
  document.body.appendChild(slideOver);

  // Trigger animation
  setTimeout(() => {
    slideOver.classList.add('active');
  }, 10);

  // Setup event listeners
  setupSlideOverEvents(slideOver, sections);
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
        <div style="display: flex; align-items: center; gap: 12px;">
          <h2 style="margin: 0;">Send Sections</h2>
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

  // View mode toggle
  const viewModeToggle = slideOver.querySelector('#viewModeToggle');
  if (viewModeToggle) {
    viewModeToggle.addEventListener('click', () => {
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
