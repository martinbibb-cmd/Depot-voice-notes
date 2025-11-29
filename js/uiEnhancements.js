/**
 * UI Enhancements for Voice Notes App
 * Handles audio control panel, waveform visualization, and notes management
 */

// Audio Control Panel State
let audioStartTime = null;
let audioTimerInterval = null;
let audioAnalyser = null;
let audioContext = null;
let audioSource = null;

// Get UI elements
const audioStatusDot = document.getElementById('audioStatusDot');
const audioStatusText = document.getElementById('audioStatusText');
const audioTimer = document.getElementById('audioTimer');
const audioWaveform = document.getElementById('audioWaveform');
const audioLevelBar = document.getElementById('audioLevelBar');
const waveformBars = audioWaveform?.querySelectorAll('.waveform-bar');
const processedTranscriptDisplay = document.getElementById('processedTranscriptDisplay');
const aiNotesList = document.getElementById('aiNotesList');
const liveTranscriptBadge = document.getElementById('liveTranscriptBadge');
let lastAiNotes = [];

// Audio Timer Functions
export function startAudioTimer() {
  audioStartTime = Date.now();
  updateAudioTimer();
  audioTimerInterval = setInterval(updateAudioTimer, 1000);
}

export function stopAudioTimer() {
  if (audioTimerInterval) {
    clearInterval(audioTimerInterval);
    audioTimerInterval = null;
  }
}

export function resetAudioTimer() {
  stopAudioTimer();
  audioStartTime = null;
  if (audioTimer) {
    audioTimer.textContent = '00:00';
  }
}

function updateAudioTimer() {
  if (!audioStartTime || !audioTimer) return;

  const elapsed = Math.floor((Date.now() - audioStartTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  audioTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Audio Status Functions
export function setAudioStatus(status, text) {
  if (!audioStatusDot || !audioStatusText) return;

  // Remove all status classes
  audioStatusDot.classList.remove('recording', 'paused');

  // Add appropriate class
  if (status === 'recording') {
    audioStatusDot.classList.add('recording');
    audioStatusText.textContent = text || 'Recording';
    startAudioTimer();
    startWaveformAnimation();
  } else if (status === 'paused') {
    audioStatusDot.classList.add('paused');
    audioStatusText.textContent = text || 'Paused';
    stopAudioTimer();
    stopWaveformAnimation();
  } else {
    audioStatusText.textContent = text || 'Ready';
    resetAudioTimer();
    stopWaveformAnimation();
  }
}

// Waveform Animation
let waveformAnimationInterval = null;

function startWaveformAnimation() {
  if (!waveformBars || waveformBars.length === 0) return;

  // Activate all bars
  waveformBars.forEach(bar => bar.classList.add('active'));

  // Random animation
  waveformAnimationInterval = setInterval(() => {
    waveformBars.forEach((bar, index) => {
      const delay = index * 0.05;
      bar.style.animationDelay = `${delay}s`;
    });
  }, 100);
}

function stopWaveformAnimation() {
  if (waveformAnimationInterval) {
    clearInterval(waveformAnimationInterval);
    waveformAnimationInterval = null;
  }

  if (waveformBars) {
    waveformBars.forEach(bar => {
      bar.classList.remove('active');
      bar.style.animationDelay = '0s';
    });
  }
}

// Audio Level Meter (using Web Audio API)
export function setupAudioLevelMeter(stream) {
  if (!stream) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioAnalyser = audioContext.createAnalyser();
    audioSource = audioContext.createMediaStreamSource(stream);

    audioSource.connect(audioAnalyser);
    audioAnalyser.fftSize = 256;

    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function updateLevel() {
      if (!audioAnalyser || !audioLevelBar) return;

      audioAnalyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const percentage = (average / 255) * 100;

      audioLevelBar.style.width = `${percentage}%`;

      requestAnimationFrame(updateLevel);
    }

    updateLevel();
  } catch (err) {
    console.warn('Could not setup audio level meter:', err);
  }
}

export function cleanupAudioLevelMeter() {
  if (audioSource) {
    audioSource.disconnect();
    audioSource = null;
  }
  if (audioAnalyser) {
    audioAnalyser = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (audioLevelBar) {
    audioLevelBar.style.width = '0%';
  }
}

// Processed Transcript Functions
export function updateProcessedTranscript(text) {
  if (!processedTranscriptDisplay) return;

  if (!text || text.trim() === '') {
    processedTranscriptDisplay.innerHTML = '<span class="small" style="color: var(--muted); font-style: italic;">Processed transcript will appear here after AI processing...</span>';
    return;
  }

  // Split into lines and format
  const lines = text.split('\n').filter(line => line.trim());
  processedTranscriptDisplay.innerHTML = lines
    .map(line => `<div class="transcript-line">${escapeHtml(line)}</div>`)
    .join('');

  // Auto-scroll to bottom
  processedTranscriptDisplay.scrollTop = processedTranscriptDisplay.scrollHeight;
}

// AI Notes Functions
export function updateAINotes(notes) {
  if (!aiNotesList) return;

  const normalised = Array.isArray(notes)
    ? notes.map((note) => ({
      title: note.title || note.section || 'Note',
      content: note.content || note.text || note.value || ''
    })).filter(note => note.content)
    : [];

  lastAiNotes = normalised;

  if (!normalised.length) {
    aiNotesList.innerHTML = '<span class="small">No AI notes yet.</span>';
    window.dispatchEvent(new CustomEvent('aiNotesUpdated', { detail: { notes: [] } }));
    return;
  }

  // Format notes as narrative sections with Tweak and Edit buttons
  const html = normalised.map((note, index) => {
    const title = note.title || 'Note';
    const content = note.content || '';

    return `
      <div class="section-item ai-note-item" data-ai-note-index="${index}">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <h4 style="margin: 0;">${escapeHtml(title)}</h4>
          <div class="section-actions" style="display: flex; gap: 6px;">
            <button class="edit-section-btn-inline edit-ai-note-btn" data-ai-note-index="${index}" title="Edit this note inline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              Edit
            </button>
            <button class="tweak-section-btn-main tweak-ai-note-btn" data-ai-note-index="${index}" title="Tweak this note with AI">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Tweak
            </button>
          </div>
        </div>
        <div class="ai-note-content-view">
          <pre style="white-space: pre-wrap; word-wrap: break-word; text-transform: none;">${content ? escapeHtml(content) : '<span class="placeholder">No content</span>'}</pre>
        </div>
        <div class="ai-note-content-edit" style="display: none;">
          <label style="display: block; margin-bottom: 4px; font-size: 0.7rem; font-weight: 600; color: #475569;">Natural Language Content:</label>
          <textarea class="edit-ai-note-content" style="width: 100%; min-height: 100px; margin-bottom: 8px; font-size: 0.8rem; text-transform: none;">${escapeHtml(content)}</textarea>
          <div style="display: flex; gap: 6px;">
            <button class="save-ai-note-btn" style="background: #10b981; color: white; padding: 6px 12px; font-size: 0.7rem; border: none; border-radius: 6px; cursor: pointer;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Save
            </button>
            <button class="cancel-ai-note-btn" style="background: #94a3b8; color: white; padding: 6px 12px; font-size: 0.7rem; border: none; border-radius: 6px; cursor: pointer;">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  aiNotesList.innerHTML = html;

  // Attach event listeners for AI notes
  attachAINoteEventListeners();

  window.dispatchEvent(new CustomEvent('aiNotesUpdated', { detail: { notes: lastAiNotes.slice() } }));
}

// Attach event listeners for AI note buttons
function attachAINoteEventListeners() {
  if (!aiNotesList) return;

  // Edit button listeners
  const editBtns = aiNotesList.querySelectorAll('.edit-ai-note-btn');
  editBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const noteItem = e.currentTarget.closest('.ai-note-item');
      const viewDiv = noteItem.querySelector('.ai-note-content-view');
      const editDiv = noteItem.querySelector('.ai-note-content-edit');
      const actionsDiv = noteItem.querySelector('.section-actions');

      viewDiv.style.display = 'none';
      editDiv.style.display = 'block';
      if (actionsDiv) actionsDiv.style.display = 'none';
    });
  });

  // Save button listeners
  const saveBtns = aiNotesList.querySelectorAll('.save-ai-note-btn');
  saveBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const noteItem = e.currentTarget.closest('.ai-note-item');
      const index = parseInt(noteItem.dataset.aiNoteIndex, 10);
      const contentArea = noteItem.querySelector('.edit-ai-note-content');
      const viewDiv = noteItem.querySelector('.ai-note-content-view');
      const editDiv = noteItem.querySelector('.ai-note-content-edit');
      const actionsDiv = noteItem.querySelector('.section-actions');
      const preEl = viewDiv.querySelector('pre');

      // Update the content
      const newContent = contentArea.value;
      if (preEl) {
        preEl.textContent = newContent;
      }

      // Update lastAiNotes
      if (lastAiNotes[index]) {
        lastAiNotes[index].content = newContent;
      }

      // Switch back to view mode
      viewDiv.style.display = 'block';
      editDiv.style.display = 'none';
      if (actionsDiv) actionsDiv.style.display = 'flex';

      // Dispatch update event
      window.dispatchEvent(new CustomEvent('aiNotesUpdated', { detail: { notes: lastAiNotes.slice() } }));
    });
  });

  // Cancel button listeners
  const cancelBtns = aiNotesList.querySelectorAll('.cancel-ai-note-btn');
  cancelBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const noteItem = e.currentTarget.closest('.ai-note-item');
      const index = parseInt(noteItem.dataset.aiNoteIndex, 10);
      const viewDiv = noteItem.querySelector('.ai-note-content-view');
      const editDiv = noteItem.querySelector('.ai-note-content-edit');
      const actionsDiv = noteItem.querySelector('.section-actions');
      const contentArea = noteItem.querySelector('.edit-ai-note-content');

      // Reset content to original
      if (lastAiNotes[index]) {
        contentArea.value = lastAiNotes[index].content;
      }

      // Switch back to view mode
      viewDiv.style.display = 'block';
      editDiv.style.display = 'none';
      if (actionsDiv) actionsDiv.style.display = 'flex';
    });
  });

  // Tweak button listeners
  const tweakBtns = aiNotesList.querySelectorAll('.tweak-ai-note-btn');
  tweakBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.aiNoteIndex, 10);
      const note = lastAiNotes[index];
      if (note && window.showAINotesTweakModal) {
        // Convert AI note format to section format for tweak modal
        const sectionFormat = {
          section: note.title,
          plainText: '', // AI notes don't have plainText
          naturalLanguage: note.content
        };
        window.showAINotesTweakModal(sectionFormat, index);
      }
    });
  });
}

export function getAiNotes() {
  return lastAiNotes.slice();
}

// Live Transcript Badge Animation
export function setLiveTranscriptBadge(isLive) {
  if (!liveTranscriptBadge) return;

  if (isLive) {
    liveTranscriptBadge.textContent = '● LIVE';
    liveTranscriptBadge.classList.add('live');
  } else {
    liveTranscriptBadge.textContent = 'IDLE';
    liveTranscriptBadge.classList.remove('live');
  }
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Session Menu Modal Handling
const sessionMenuBtn = document.getElementById('sessionMenuBtn');
const sessionMenuModal = document.getElementById('sessionMenuModal');
const closeSessionMenuBtn = document.getElementById('closeSessionMenuBtn');

if (sessionMenuBtn) {
  sessionMenuBtn.addEventListener('click', () => {
    if (sessionMenuModal) {
      sessionMenuModal.classList.add('active');
    }
  });
}

if (closeSessionMenuBtn) {
  closeSessionMenuBtn.addEventListener('click', () => {
    if (sessionMenuModal) {
      sessionMenuModal.classList.remove('active');
    }
  });
}

// Close modal when clicking outside
if (sessionMenuModal) {
  sessionMenuModal.addEventListener('click', (e) => {
    if (e.target === sessionMenuModal) {
      sessionMenuModal.classList.remove('active');
    }
  });
}

// Close session menu when any menu item is clicked
const sessionMenuItems = ['newJobBtn', 'importAudioBtn', 'loadSessionBtn', 'loadCloudSessionBtn'];
sessionMenuItems.forEach(btnId => {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener('click', () => {
      if (sessionMenuModal) {
        sessionMenuModal.classList.remove('active');
      }
    });
  }
});

// Show tweak modal for AI notes
window.showAINotesTweakModal = function(note, noteIndex) {
  const modal = document.createElement('div');
  modal.className = 'tweak-modal-backdrop';
  modal.innerHTML = `
    <div class="tweak-modal" style="max-width: 600px;">
      <div class="tweak-modal-header">
        <h3>Tweak AI Note: ${escapeHtml(note.section || 'Note')}</h3>
        <button class="tweak-modal-close" aria-label="Close">×</button>
      </div>
      <div class="tweak-modal-body">
        <div class="tweak-preview">
          <div class="tweak-preview-label">Current Content:</div>
          <div class="tweak-preview-content">
            <div class="tweak-preview-section">
              <pre style="white-space: pre-wrap; word-wrap: break-word; text-transform: none;">${escapeHtml(note.naturalLanguage || 'No content')}</pre>
            </div>
          </div>
        </div>
        <div class="tweak-input-section">
          <label for="tweakInstructions">How would you like to improve this note?</label>
          <textarea
            id="tweakInstructions"
            placeholder="E.g., 'Make it more concise', 'Add more technical detail', 'Simplify the language'..."
            rows="4"
            style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius); font-family: inherit; resize: vertical;"
          ></textarea>
          <div class="tweak-examples">
            <div class="tweak-examples-label" style="font-size: 0.75rem; color: var(--muted); margin-top: 8px;">Suggestion examples:</div>
            <div class="tweak-example-chips" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
              <button class="tweak-example-chip pill-secondary" data-instruction="Make it more concise" style="font-size: 0.7rem;">Make it more concise</button>
              <button class="tweak-example-chip pill-secondary" data-instruction="Add more technical detail" style="font-size: 0.7rem;">Add more technical detail</button>
              <button class="tweak-example-chip pill-secondary" data-instruction="Simplify the language" style="font-size: 0.7rem;">Simplify the language</button>
              <button class="tweak-example-chip pill-secondary" data-instruction="Make it more professional" style="font-size: 0.7rem;">Make it more professional</button>
            </div>
          </div>
        </div>
      </div>
      <div class="tweak-modal-footer" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
        <button class="tweak-modal-cancel pill-secondary">Cancel</button>
        <button class="tweak-modal-submit" disabled style="background: var(--accent); color: white;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
          <span>Apply Tweak</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Get elements
  const textarea = modal.querySelector('#tweakInstructions');
  const submitBtn = modal.querySelector('.tweak-modal-submit');
  const cancelBtn = modal.querySelector('.tweak-modal-cancel');
  const closeBtn = modal.querySelector('.tweak-modal-close');
  const exampleChips = modal.querySelectorAll('.tweak-example-chip');

  // Enable/disable submit based on input
  textarea.addEventListener('input', () => {
    submitBtn.disabled = !textarea.value.trim();
  });

  // Example chip click handlers
  exampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const instruction = chip.dataset.instruction;
      textarea.value = instruction;
      textarea.dispatchEvent(new Event('input'));
      textarea.focus();
    });
  });

  // Submit handler
  const handleSubmit = async () => {
    const instructions = textarea.value.trim();
    if (!instructions) return;

    submitBtn.disabled = true;
    const submitSpan = submitBtn.querySelector('span');
    const submitLoader = submitBtn.querySelector('svg');
    submitSpan.textContent = 'Processing...';
    if (submitLoader) submitLoader.style.display = 'inline';

    try {
      await processAINoteTweak(note, noteIndex, instructions);
      closeAINotesTweakModal(modal);
    } catch (err) {
      console.error('AI Note tweak error:', err);
      submitSpan.textContent = 'Error - Try Again';
      submitBtn.disabled = false;
      if (submitLoader) submitLoader.style.display = 'none';
      alert(`Failed to tweak note: ${err.message || 'Unknown error'}`);
    }
  };

  submitBtn.addEventListener('click', handleSubmit);

  // Cancel handlers
  const closeModal = () => closeAINotesTweakModal(modal);
  cancelBtn.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Escape key handler
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);

  // Focus textarea
  setTimeout(() => textarea.focus(), 100);
};

function closeAINotesTweakModal(modal) {
  modal.classList.add('closing');
  setTimeout(() => {
    modal.remove();
  }, 200);
}

async function processAINoteTweak(note, noteIndex, instructions) {
  const workerUrl = window.WORKER_URL || 'https://depot-voice-notes.martinbibb.workers.dev';

  // Load custom AI instructions if available
  let customInstructions = null;
  try {
    const aiInstructions = localStorage.getItem('depot.aiInstructions');
    if (aiInstructions) {
      const parsed = JSON.parse(aiInstructions);
      customInstructions = parsed.tweakSection;
    }
  } catch (err) {
    console.warn('Failed to load custom AI instructions', err);
  }

  const response = await fetch(`${workerUrl}/tweak-section`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      section: {
        section: note.section || 'AI Note',
        plainText: '',
        naturalLanguage: note.naturalLanguage || ''
      },
      instructions,
      customInstructions
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Server error: ${response.status}`);
  }

  const improvedSection = await response.json();

  // Update the AI note in the list
  if (lastAiNotes && lastAiNotes[noteIndex]) {
    lastAiNotes[noteIndex].content = improvedSection.naturalLanguage || improvedSection.plainText || '';
    
    // Re-render AI notes to show updated content
    updateAINotes(lastAiNotes);
  }
}

// Export for use in main.js
window.uiEnhancements = {
  startAudioTimer,
  stopAudioTimer,
  resetAudioTimer,
  setAudioStatus,
  setupAudioLevelMeter,
  cleanupAudioLevelMeter,
  updateProcessedTranscript,
  updateAINotes,
  setLiveTranscriptBadge
};
