/**
 * Integration between main.js and uiEnhancements.js
 * This file bridges the existing functionality with new UI elements
 */

// Wait for both main.js and uiEnhancements.js to load
function initIntegration() {
  const ui = window.uiEnhancements;
  if (!ui) {
    console.warn('UI enhancements not loaded yet, retrying...');
    setTimeout(initIntegration, 100);
    return;
  }

  console.log('Initializing UI integration...');

  // Get the original buttons
  const startLiveBtn = document.getElementById('startLiveBtn');
  const pauseLiveBtn = document.getElementById('pauseLiveBtn');
  const finishLiveBtn = document.getElementById('finishLiveBtn');

  // Store original handlers
  const originalStartHandler = startLiveBtn?.onclick;
  const originalPauseHandler = pauseLiveBtn?.onclick;
  const originalFinishHandler = finishLiveBtn?.onclick;

  // Enhance start button
  if (startLiveBtn && originalStartHandler) {
    startLiveBtn.onclick = async function(e) {
      console.log('Enhanced start button clicked');

      // Call original handler
      const result = await originalStartHandler.call(this, e);

      // Update UI
      ui.setAudioStatus('recording', 'Recording');
      ui.setLiveTranscriptBadge(true);

      // Try to setup audio level meter
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        ui.setupAudioLevelMeter(stream);
      } catch (err) {
        console.warn('Could not access microphone for level meter:', err);
      }

      return result;
    };
  }

  // Enhance pause button
  if (pauseLiveBtn && originalPauseHandler) {
    pauseLiveBtn.onclick = function(e) {
      console.log('Enhanced pause button clicked');

      // Determine if pausing or resuming based on button text
      const isPausing = pauseLiveBtn.textContent.includes('Pause');

      // Call original handler
      const result = originalPauseHandler.call(this, e);

      // Update UI based on action
      if (isPausing) {
        ui.setAudioStatus('paused', 'Paused');
        ui.setLiveTranscriptBadge(false);
      } else {
        ui.setAudioStatus('recording', 'Recording');
        ui.setLiveTranscriptBadge(true);
      }

      return result;
    };
  }

  // Enhance finish button
  if (finishLiveBtn && originalFinishHandler) {
    finishLiveBtn.onclick = function(e) {
      console.log('Enhanced finish button clicked');

      // Call original handler
      const result = originalFinishHandler.call(this, e);

      // Update UI
      ui.setAudioStatus('idle', 'Finished');
      ui.setLiveTranscriptBadge(false);
      ui.cleanupAudioLevelMeter();

      return result;
    };
  }

  // Hook into worker responses to update processed transcript and AI notes
  interceptWorkerResponses();
}

function interceptWorkerResponses() {
  const ui = window.uiEnhancements;

  // Check for updates periodically
  setInterval(() => {
    // Check if there's debug data we can use
    const debugData = window.__depotVoiceNotesDebug || window.__depotDebug;

    let transcriptUpdated = false;

    if (debugData && debugData.lastWorkerResponse) {
      const response = debugData.lastWorkerResponse;

      // Update processed transcript if available
      if (response.fullTranscript || response.transcript) {
        const transcript = response.fullTranscript || response.transcript;
        const metadata = {
          processedBy: response.processedBy,
          processedAt: response.processedAt
        };
        ui.updateProcessedTranscript(transcript, metadata);
        transcriptUpdated = true;
      }

      // Generate AI notes from sections if available
      if (response.sections && Array.isArray(response.sections)) {
        const aiNotes = response.sections.map(section => {
          // Check various possible formats
          const title = section.section || section.title || section.name || 'Section';
          const content = section.content || section.text || section.value || section.notes || '';

          return {
            title: title,
            content: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
          };
        }).filter(note => note.content); // Only include notes with content

        if (aiNotes.length > 0) {
          ui.updateAINotes(aiNotes);
        }
      }

      // Alternative: check for depot sections
      if (debugData.sections && Array.isArray(debugData.sections)) {
        const aiNotes = debugData.sections.map(section => ({
          title: section.section || 'Note',
          content: section.content || section.text || ''
        })).filter(note => note.content);

        if (aiNotes.length > 0) {
          ui.updateAINotes(aiNotes);
        }
      }
    }

    // Fallback: if worker response is unavailable, try to get transcript from localStorage or input
    if (!transcriptUpdated) {
      // Try localStorage autosave first
      try {
        const autosave = localStorage.getItem('surveyBrainAutosave');
        if (autosave) {
          const parsed = JSON.parse(autosave);
          if (parsed.fullTranscript) {
            ui.updateProcessedTranscript(parsed.fullTranscript);
            transcriptUpdated = true;
          }
        }
      } catch (e) {
        console.warn('Could not read autosave from localStorage:', e);
      }

      // If still no transcript, try the input element
      if (!transcriptUpdated) {
        const transcriptInput = document.getElementById('transcriptInput');
        if (transcriptInput && transcriptInput.value.trim()) {
          ui.updateProcessedTranscript(transcriptInput.value.trim());
          transcriptUpdated = true;
        }
      }
    }

    // Also check the sectionsList element for updates
    const sectionsList = document.getElementById('sectionsList');
    if (sectionsList && !sectionsList.textContent.includes('No automatic notes')) {
      // Sections have been updated, sync to AI notes
      syncAutomaticToAINotes();
    }
  }, 1000);
}

function syncAutomaticToAINotes() {
  const ui = window.uiEnhancements;
  const sectionItems = document.querySelectorAll('#sectionsList .section-item');

  if (sectionItems.length === 0) return;

  const aiNotes = [];
  sectionItems.forEach(item => {
    const title = item.querySelector('h4')?.textContent || '';
    const content = item.querySelector('pre')?.textContent || '';

    if (title && content && !content.includes('No content') && content.trim() !== '') {
      aiNotes.push({
        title: `📝 ${title}`,
        content: formatContentAsNarrative(title, content)
      });
    }
  });

  if (aiNotes.length > 0) {
    ui.updateAINotes(aiNotes);
  }
}

function formatContentAsNarrative(title, content) {
  // Convert structured content to more natural narrative
  if (typeof content !== 'string') return content;

  // Clean up the content
  let narrative = content.trim();

  // Add some context based on the section title
  const contextMap = {
    'Needs': 'Customer requirements: ',
    'System characteristics': 'Current system details: ',
    'Restrictions to work': 'Work limitations: ',
    'New boiler and controls': 'Proposed equipment: ',
    'Flue': 'Flue considerations: ',
    'Pipe work': 'Pipework notes: ',
    'Disruption': 'Expected disruption: ',
    'Customer actions': 'Customer to-do items: '
  };

  const context = contextMap[title] || '';
  if (context && !narrative.startsWith(context)) {
    narrative = context + narrative;
  }

  return narrative;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initIntegration, 500); // Give main.js time to set up handlers
  });
} else {
  setTimeout(initIntegration, 500);
}
