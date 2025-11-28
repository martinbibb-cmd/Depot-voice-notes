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
    ? notes.map(note => ({
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

  // Format notes as narrative sections
  const html = normalised.map(note => {
    const title = note.title || 'Note';
    const content = note.content || '';

    return `
      <div class="section-item">
        <h4>${escapeHtml(title)}</h4>
        <pre>${escapeHtml(content) || '<span class="placeholder">No content</span>'}</pre>
      </div>
    `;
  }).join('');

  aiNotesList.innerHTML = html;

  window.dispatchEvent(new CustomEvent('aiNotesUpdated', { detail: { notes: lastAiNotes.slice() } }));
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
