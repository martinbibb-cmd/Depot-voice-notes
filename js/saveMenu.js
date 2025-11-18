/**
 * Save Menu Module
 * Handles the unified save menu for all export options
 */

import {
  depotNotesToCSV,
  notesToCSV,
  sessionToSingleCSV,
  downloadCSV
} from "./csvExport.js";

// Modal elements
const saveMenuModal = document.getElementById('saveMenuModal');
const closeSaveMenuBtn = document.getElementById('closeSaveMenuBtn');
const cancelSaveMenuBtn = document.getElementById('cancelSaveMenuBtn');
const confirmSaveMenuBtn = document.getElementById('confirmSaveMenuBtn');

// Checkbox elements
const saveFullSessionCheckbox = document.getElementById('saveFullSession');
const saveDepotNotesCheckbox = document.getElementById('saveDepotNotes');
const saveAINotesCheckbox = document.getElementById('saveAINotes');
const saveTranscriptCheckbox = document.getElementById('saveTranscript');

// Format radio buttons
const saveFormatJSON = document.getElementById('saveFormatJSON');
const saveFormatCSV = document.getElementById('saveFormatCSV');

// Filename input
const saveFilenameInput = document.getElementById('saveFilename');

/**
 * Show the save menu modal
 */
export function showSaveMenu() {
  if (!saveMenuModal) return;

  // Set default filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  saveFilenameInput.value = `depot-notes-${timestamp}`;

  // Show modal
  saveMenuModal.classList.add('active');
}

/**
 * Hide the save menu modal
 */
function hideSaveMenu() {
  if (!saveMenuModal) return;
  saveMenuModal.classList.remove('active');
}

/**
 * Get the selected format
 */
function getSelectedFormat() {
  if (saveFormatCSV && saveFormatCSV.checked) return 'csv';
  return 'json';
}

/**
 * Get selected save options
 */
function getSelectedOptions() {
  return {
    fullSession: saveFullSessionCheckbox && saveFullSessionCheckbox.checked,
    depotNotes: saveDepotNotesCheckbox && saveDepotNotesCheckbox.checked,
    aiNotes: saveAINotesCheckbox && saveAINotesCheckbox.checked,
    transcript: saveTranscriptCheckbox && saveTranscriptCheckbox.checked
  };
}

/**
 * Helper to convert blob to base64
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get data from the app state
 * This function needs to access the main.js state
 */
function getAppData() {
  // Access global state from main.js
  const transcriptInput = document.getElementById('transcriptInput');
  const fullTranscript = transcriptInput ? transcriptInput.value.trim() : '';

  // Get sections from DOM
  const sections = [];
  const sectionItems = document.querySelectorAll('#sectionsList .section-item');
  sectionItems.forEach(item => {
    const title = item.querySelector('h4')?.textContent || '';
    const content = item.querySelector('pre')?.textContent || '';
    if (title && content && !content.includes('No content')) {
      sections.push({ section: title, content: content });
    }
  });

  // Get AI notes from DOM
  const aiNotes = [];
  const aiNoteItems = document.querySelectorAll('#aiNotesList .section-item');
  aiNoteItems.forEach(item => {
    const title = item.querySelector('h4')?.textContent || '';
    const content = item.querySelector('pre')?.textContent || '';
    if (title && content && !content.includes('No content')) {
      aiNotes.push({ title: title, content: content });
    }
  });

  // Try to get state from window globals (set by main.js)
  const lastMaterials = window.__depotLastMaterials || [];
  const lastCheckedItems = window.__depotLastCheckedItems || [];
  const lastMissingInfo = window.__depotLastMissingInfo || [];
  const lastCustomerSummary = window.__depotLastCustomerSummary || '';
  const sessionAudioChunks = window.__depotSessionAudioChunks || [];
  const lastAudioMime = window.__depotLastAudioMime || null;

  return {
    fullTranscript,
    sections,
    aiNotes,
    materials: lastMaterials,
    checkedItems: lastCheckedItems,
    missingInfo: lastMissingInfo,
    customerSummary: lastCustomerSummary,
    audioChunks: sessionAudioChunks,
    audioMime: lastAudioMime
  };
}

/**
 * Save the selected options
 */
async function saveSelected() {
  const options = getSelectedOptions();
  const format = getSelectedFormat();
  const filename = (saveFilenameInput.value || 'depot-notes').replace(/[^a-z0-9_\-]+/gi, '-');

  // Check if at least one option is selected
  if (!options.fullSession && !options.depotNotes && !options.aiNotes && !options.transcript) {
    alert('Please select at least one item to save');
    return;
  }

  const appData = getAppData();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    // Handle different save options
    if (options.fullSession) {
      await saveFullSession(appData, filename, format, timestamp);
    }

    if (options.depotNotes) {
      await saveDepotNotes(appData, filename, format, timestamp);
    }

    if (options.aiNotes) {
      await saveAINotes(appData, filename, format, timestamp);
    }

    if (options.transcript) {
      await saveTranscript(appData, filename, format, timestamp);
    }

    // Hide modal and show success
    hideSaveMenu();

    // Show feedback
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
      const count = [options.fullSession, options.depotNotes, options.aiNotes, options.transcript].filter(Boolean).length;
      statusBar.textContent = `Saved ${count} file(s) successfully`;
      setTimeout(() => {
        statusBar.textContent = 'Idle (Online • Manual)';
      }, 3000);
    }
  } catch (error) {
    console.error('Save error:', error);
    alert('Error saving files: ' + error.message);
  }
}

/**
 * Save full session
 */
async function saveFullSession(appData, filename, format, timestamp) {
  const session = {
    version: 1,
    createdAt: new Date().toISOString(),
    fullTranscript: appData.fullTranscript,
    sections: appData.sections,
    materials: appData.materials,
    checkedItems: appData.checkedItems,
    missingInfo: appData.missingInfo,
    customerSummary: appData.customerSummary
  };

  // Include audio if available and format is JSON
  if (format === 'json' && appData.audioChunks && appData.audioChunks.length > 0) {
    try {
      const mime = appData.audioMime || 'audio/webm';
      const audioBlob = new Blob(appData.audioChunks, { type: mime });
      const base64 = await blobToBase64(audioBlob);
      session.audioMime = mime;
      session.audioBase64 = base64;
    } catch (err) {
      console.warn('Failed to attach audio to session', err);
    }
  } else if (format === 'csv' && appData.audioChunks && appData.audioChunks.length > 0) {
    const includeAudioWarning = confirm(
      "CSV format cannot include audio data. The session will be saved without audio. Continue?"
    );
    if (!includeAudioWarning) return;
  }

  let blob, finalFilename;

  if (format === 'csv') {
    const csvContent = sessionToSingleCSV(session);
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    finalFilename = `${filename}-session-${timestamp}.csv`;
  } else {
    const jsonStr = JSON.stringify(session, null, 2);
    blob = new Blob([jsonStr], { type: 'application/json' });
    finalFilename = `${filename}-session-${timestamp}.depotvoice.json`;
  }

  downloadFile(blob, finalFilename);
}

/**
 * Save depot notes only
 */
async function saveDepotNotes(appData, filename, format, timestamp) {
  const data = {
    type: 'depot_notes',
    exportedAt: new Date().toISOString(),
    sections: appData.sections
  };

  let blob, finalFilename;

  if (format === 'csv') {
    const csvContent = depotNotesToCSV(data);
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    finalFilename = `${filename}-depot-${timestamp}.csv`;
  } else {
    const jsonStr = JSON.stringify(data, null, 2);
    blob = new Blob([jsonStr], { type: 'application/json' });
    finalFilename = `${filename}-depot-${timestamp}.json`;
  }

  downloadFile(blob, finalFilename);
}

/**
 * Save AI notes only
 */
async function saveAINotes(appData, filename, format, timestamp) {
  const data = {
    type: 'ai_notes',
    timestamp: new Date().toISOString(),
    notes: appData.aiNotes
  };

  let blob, finalFilename;

  if (format === 'csv') {
    const csvContent = notesToCSV(data);
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    finalFilename = `${filename}-ai-${timestamp}.csv`;
  } else {
    const jsonStr = JSON.stringify(data, null, 2);
    blob = new Blob([jsonStr], { type: 'application/json' });
    finalFilename = `${filename}-ai-${timestamp}.json`;
  }

  downloadFile(blob, finalFilename);
}

/**
 * Save transcript only
 */
async function saveTranscript(appData, filename, format, timestamp) {
  const data = {
    type: 'transcript',
    timestamp: new Date().toISOString(),
    transcript: appData.fullTranscript
  };

  let blob, finalFilename;

  if (format === 'csv') {
    // Simple CSV format for transcript
    const csvContent = 'Transcript\n' + appData.fullTranscript.replace(/"/g, '""');
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    finalFilename = `${filename}-transcript-${timestamp}.csv`;
  } else {
    const jsonStr = JSON.stringify(data, null, 2);
    blob = new Blob([jsonStr], { type: 'application/json' });
    finalFilename = `${filename}-transcript-${timestamp}.json`;
  }

  downloadFile(blob, finalFilename);
}

/**
 * Download a file
 */
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Initialize save menu event listeners
 */
export function initSaveMenu() {
  // Open save menu button
  const saveMenuBtn = document.getElementById('saveMenuBtn');
  if (saveMenuBtn) {
    saveMenuBtn.addEventListener('click', showSaveMenu);
  }

  if (closeSaveMenuBtn) {
    closeSaveMenuBtn.addEventListener('click', hideSaveMenu);
  }

  if (cancelSaveMenuBtn) {
    cancelSaveMenuBtn.addEventListener('click', hideSaveMenu);
  }

  if (confirmSaveMenuBtn) {
    confirmSaveMenuBtn.addEventListener('click', saveSelected);
  }

  // Close modal when clicking outside
  if (saveMenuModal) {
    saveMenuModal.addEventListener('click', (e) => {
      if (e.target === saveMenuModal) {
        hideSaveMenu();
      }
    });
  }
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSaveMenu);
} else {
  initSaveMenu();
}

// Export showSaveMenu for use by other modules
window.showSaveMenu = showSaveMenu;
