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
import {
  buildSessionFromAppState,
  saveSessionToStorage
} from "../src/state/sessionStore.js";

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
const saveFormatTXT = document.getElementById('saveFormatTXT');

// Audio export checkboxes
const saveAudioWavCheckbox = document.getElementById('saveAudioWav');
const saveAudioMp3Checkbox = document.getElementById('saveAudioMp3');

// Filename input
const saveFilenameInput = document.getElementById('saveFilename');
const SESSION_NAME_KEY = 'depot.currentSessionName';

function getSessionReference() {
  const stored = localStorage.getItem(SESSION_NAME_KEY);
  if (stored && stored.trim()) return stored.trim();
  return 'session';
}

/**
 * Show the save menu modal
 */
export function showSaveMenu() {
  if (!saveMenuModal) return;

  // Set default filename
  const sessionRef = getSessionReference();
  saveFilenameInput.value = sessionRef;

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
  if (saveFormatTXT && saveFormatTXT.checked) return 'txt';
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
    transcript: saveTranscriptCheckbox && saveTranscriptCheckbox.checked,
    audioWav: saveAudioWavCheckbox && saveAudioWavCheckbox.checked,
    audioMp3: saveAudioMp3Checkbox && saveAudioMp3Checkbox.checked
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

async function ensureAuthModule() {
  if (typeof window.DepotAuth !== 'undefined') {
    return window.DepotAuth;
  }

  try {
    await import('../src/auth/auth-client.js');
    return window.DepotAuth;
  } catch (err) {
    console.error('Failed to load auth module:', err);
    return undefined;
  }
}

/**
 * Save the selected options
 */
async function saveSelected() {
  const options = getSelectedOptions();
  const format = getSelectedFormat();
  const filename = (saveFilenameInput.value || getSessionReference()).replace(/[^a-z0-9_\-]+/gi, '-');

  // Check if at least one option is selected
  if (!options.fullSession && !options.depotNotes && !options.aiNotes && !options.transcript) {
    alert('Please select at least one item to save');
    return;
  }

  const appData = getAppData();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    const saveTasks = [];

    // Handle different save options
    if (options.fullSession) {
      saveTasks.push(
        saveFullSession(appData, filename, format, timestamp)
          .then(() => ({ label: 'Full session', success: true }))
          .catch(error => ({ label: 'Full session', success: false, error }))
      );
    }

    if (options.depotNotes) {
      saveTasks.push(
        saveDepotNotes(appData, filename, format, timestamp)
          .then(() => ({ label: 'Depot notes', success: true }))
          .catch(error => ({ label: 'Depot notes', success: false, error }))
      );
    }

    if (options.aiNotes) {
      saveTasks.push(
        saveAINotes(appData, filename, format, timestamp)
          .then(() => ({ label: 'AI notes', success: true }))
          .catch(error => ({ label: 'AI notes', success: false, error }))
      );
    }

    if (options.transcript) {
      saveTasks.push(
        saveTranscript(appData, filename, format, timestamp)
          .then(() => ({ label: 'Transcript', success: true }))
          .catch(error => ({ label: 'Transcript', success: false, error }))
      );
    }

    // Handle audio export options
    if (options.audioWav) {
      saveTasks.push(
        saveAudioWav(appData, filename, timestamp)
          .then(() => ({ label: 'Audio WAV', success: true }))
          .catch(error => ({ label: 'Audio WAV', success: false, error }))
      );
    }

    if (options.audioMp3) {
      saveTasks.push(
        saveAudioNative(appData, filename, timestamp)
          .then(() => ({ label: 'Audio MP3/WebM', success: true }))
          .catch(error => ({ label: 'Audio MP3/WebM', success: false, error }))
      );
    }

    const results = await Promise.all(saveTasks);
    const successCount = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success);

    if (!successCount) {
      const firstError = failures[0]?.error;
      throw firstError || new Error('No files were saved');
    }

    // Hide modal and show success
    hideSaveMenu();

    // Show feedback
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
      statusBar.textContent = `Saved ${successCount} file(s) successfully`;
      setTimeout(() => {
        statusBar.textContent = 'Idle (Online • Manual)';
      }, 3000);
    }

    if (failures.length) {
      alert(`Saved ${successCount} item(s), but some failed: ${failures.map(f => f.label).join(', ')}`);
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
    version: 2, // Incremented for new photo/form/location features
    createdAt: new Date().toISOString(),
    fullTranscript: appData.fullTranscript,
    sections: appData.sections,
    materials: appData.materials,
    checkedItems: appData.checkedItems,
    missingInfo: appData.missingInfo,
    customerSummary: appData.customerSummary,
    // New fields for photo, GPS, and structured form support
    photos: appData.photos || [],
    formData: appData.formData || {},
    locations: appData.locations || {},
    distances: appData.distances || {}
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
  } else if ((format === 'csv' || format === 'txt') && appData.audioChunks && appData.audioChunks.length > 0) {
    const includeAudioWarning = confirm(
      `${format.toUpperCase()} format cannot include audio data. The session will be saved without audio. Continue?`
    );
    if (!includeAudioWarning) return;
  }

  let blob, finalFilename;

  if (format === 'csv') {
    const csvContent = sessionToSingleCSV(session);
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    finalFilename = `${filename}-session-${timestamp}.csv`;
  } else if (format === 'txt') {
    const txtContent = sessionToText(session);
    blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    finalFilename = `${filename}-session-${timestamp}.txt`;
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
    finalFilename = `${filename}-auto-notes-${timestamp}.csv`;
  } else if (format === 'txt') {
    const txtContent = depotNotesToText(data);
    blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    finalFilename = `${filename}-auto-notes-${timestamp}.txt`;
  } else {
    const jsonStr = JSON.stringify(data, null, 2);
    blob = new Blob([jsonStr], { type: 'application/json' });
    finalFilename = `${filename}-auto-notes-${timestamp}.json`;
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
    finalFilename = `${filename}-natural-notes-${timestamp}.csv`;
  } else if (format === 'txt') {
    const txtContent = aiNotesToText(data);
    blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    finalFilename = `${filename}-natural-notes-${timestamp}.txt`;
  } else {
    const jsonStr = JSON.stringify(data, null, 2);
    blob = new Blob([jsonStr], { type: 'application/json' });
    finalFilename = `${filename}-natural-notes-${timestamp}.json`;
  }

  downloadFile(blob, finalFilename);
}

/**
 * Save transcript only
 */
async function saveTranscript(appData, filename, format, timestamp) {
  const transcriptText = appData.fullTranscript ?? '';
  
  const data = {
    type: 'transcript',
    timestamp: new Date().toISOString(),
    transcript: transcriptText
  };

  let blob, finalFilename;

  if (format === 'csv') {
    // Simple CSV format for transcript
    const csvContent = 'Transcript\n' + transcriptText.replace(/"/g, '""');
    blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    finalFilename = `${filename}-transcript-${timestamp}.csv`;
  } else if (format === 'txt') {
    // Plain text format for transcript
    const txtContent = transcriptText;
    blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    finalFilename = `${filename}-transcript-${timestamp}.txt`;
  } else {
    const jsonStr = JSON.stringify(data, null, 2);
    blob = new Blob([jsonStr], { type: 'application/json' });
    finalFilename = `${filename}-transcript-${timestamp}.json`;
  }

  downloadFile(blob, finalFilename);
}

/**
 * Convert session to plain text format
 */
function sessionToText(session) {
  let text = '';
  let hasContent = false;

  if (session.fullTranscript && typeof session.fullTranscript === 'string') {
    text += '📝 Transcript\n';
    text += '===CONTENT===\n';
    text += session.fullTranscript + '\n';
    text += '===END===\n';
    hasContent = true;
  }

  if (session.sections && session.sections.length > 0) {
    if (hasContent) text += '\n';
    session.sections.forEach((section, index) => {
      text += `${section.section}\n`;
      text += '===CONTENT===\n';
      text += section.content + '\n';
      text += '===END===\n';
      if (index < session.sections.length - 1) {
        text += '\n';
      }
    });
    hasContent = true;
  }

  if (session.materials && session.materials.length > 0) {
    if (hasContent) text += '\n';
    text += '📝 Materials\n';
    text += '===CONTENT===\n';
    session.materials.forEach(material => {
      text += `• ${material}\n`;
    });
    text += '===END===\n';
    hasContent = true;
  }

  if (session.checkedItems && session.checkedItems.length > 0) {
    if (hasContent) text += '\n';
    text += '📝 Checked Items\n';
    text += '===CONTENT===\n';
    session.checkedItems.forEach(item => {
      text += `• ${item}\n`;
    });
    text += '===END===\n';
    hasContent = true;
  }

  if (session.missingInfo && session.missingInfo.length > 0) {
    if (hasContent) text += '\n';
    text += '📝 Missing Information\n';
    text += '===CONTENT===\n';
    session.missingInfo.forEach(info => {
      text += `• ${info}\n`;
    });
    text += '===END===\n';
    hasContent = true;
  }

  if (session.customerSummary) {
    if (hasContent) text += '\n';
    text += '📝 Customer Summary\n';
    text += '===CONTENT===\n';
    text += session.customerSummary + '\n';
    text += '===END===\n';
  }

  return text;
}

/**
 * Convert depot notes to plain text format
 */
function depotNotesToText(data) {
  let text = '';

  if (data.sections && data.sections.length > 0) {
    data.sections.forEach((section, index) => {
      // Add section title (preserve emoji if present)
      text += `${section.section}\n`;
      text += '===CONTENT===\n';
      text += section.content + '\n';
      text += '===END===\n';

      // Add blank line between sections, but not after the last one
      if (index < data.sections.length - 1) {
        text += '\n';
      }
    });
  }

  return text;
}

/**
 * Convert AI notes to plain text format
 */
function aiNotesToText(data) {
  let text = '';

  if (data.notes && data.notes.length > 0) {
    data.notes.forEach((note, index) => {
      // Add note title (preserve emoji if present)
      text += `${note.title}\n`;
      text += '===CONTENT===\n';
      text += note.content + '\n';
      text += '===END===\n';

      // Add blank line between notes, but not after the last one
      if (index < data.notes.length - 1) {
        text += '\n';
      }
    });
  }

  return text;
}

/**
 * Save audio as WAV format
 */
async function saveAudioWav(appData, filename, timestamp) {
  if (!appData.audioChunks || appData.audioChunks.length === 0) {
    alert('No audio available to export');
    return;
  }

  try {
    // Create blob from audio chunks
    const mime = appData.audioMime || 'audio/webm';
    const audioBlob = new Blob(appData.audioChunks, { type: mime });

    // Convert to WAV using Web Audio API
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert AudioBuffer to WAV
    const wavBlob = audioBufferToWav(audioBuffer);
    const finalFilename = `${filename}-audio-${timestamp}.wav`;

    downloadFile(wavBlob, finalFilename);
  } catch (error) {
    console.error('Error converting audio to WAV:', error);
    alert('Error converting audio to WAV format. The recorded format may not be supported for conversion.');
  }
}

/**
 * Save audio in native recorded format
 */
async function saveAudioNative(appData, filename, timestamp) {
  if (!appData.audioChunks || appData.audioChunks.length === 0) {
    alert('No audio available to export');
    return;
  }

  try {
    const mime = appData.audioMime || 'audio/webm';
    const audioBlob = new Blob(appData.audioChunks, { type: mime });

    // Determine file extension based on MIME type
    let extension = 'webm';
    if (mime.includes('mp4')) extension = 'mp4';
    else if (mime.includes('m4a')) extension = 'm4a';
    else if (mime.includes('wav')) extension = 'wav';
    else if (mime.includes('ogg')) extension = 'ogg';

    const finalFilename = `${filename}-audio-${timestamp}.${extension}`;

    downloadFile(audioBlob, finalFilename);
  } catch (error) {
    console.error('Error saving audio:', error);
    alert('Error saving audio file: ' + error.message);
  }
}

/**
 * Convert AudioBuffer to WAV blob
 */
function audioBufferToWav(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const data = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    data.push(audioBuffer.getChannelData(i));
  }

  const interleaved = interleave(data);
  const dataLength = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write audio data
  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    const sample = Math.max(-1, Math.min(1, interleaved[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Interleave audio channels
 */
function interleave(channelData) {
  const length = channelData[0].length;
  const numberOfChannels = channelData.length;
  const result = new Float32Array(length * numberOfChannels);

  let offset = 0;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      result[offset++] = channelData[channel][i];
    }
  }

  return result;
}

/**
 * Write string to DataView
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
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
 * Save session to cloud (Voice Notes 2.0)
 */
async function saveSessionToCloud() {
  const cloudSaveBtn = document.getElementById('saveToCloudBtn');
  const cloudSaveBtnText = document.getElementById('cloudSaveBtnText');
  const cloudSaveStatus = document.getElementById('cloudSaveStatus');

  const authModule = await ensureAuthModule();

  // Check authentication
  if (!authModule || !authModule.isAuthenticated()) {
    cloudSaveStatus.style.color = 'var(--danger)';
    cloudSaveStatus.textContent = '⚠️ Please sign in to save to cloud';
    setTimeout(() => {
      if (confirm('Sign in to save sessions to the cloud?')) {
        window.location.href = 'login.html';
      }
    }, 500);
    return;
  }

  // Get session data
  const sessionData = window.__depotAppState || {};
  const transcript = document.getElementById('transcriptInput')?.value || '';
  const audioChunks = window.__depotSessionAudioChunks || [];
  const audioMime = window.__depotLastAudioMime || '';

  const baseSession = {
    ...(sessionData || {}),
    version: 2, // Incremented for new photo/form/location features
    createdAt: new Date().toISOString(),
    sessionName: getSessionReference(),
    fullTranscript: transcript,
    sections: sessionData.sections || [],
    materials: sessionData.materials || [],
    checkedItems: sessionData.checkedItems || [],
    missingInfo: sessionData.missingInfo || [],
    customerSummary: sessionData.customerSummary || '',
    quoteNotes: sessionData.quoteNotes || [],
    // New fields for photo, GPS, and structured form support
    photos: window.__depotSessionPhotos || [],
    formData: window.__depotSessionFormData || {},
    locations: window.__depotSessionLocations || {},
    distances: window.__depotSessionDistances || {}
  };

  // Include audio if present
  if (audioChunks && audioChunks.length > 0) {
    try {
      const audioBlob = new Blob(audioChunks, { type: audioMime || 'audio/webm' });
      const base64 = await blobToBase64(audioBlob);
      baseSession.audioMime = audioMime;
      baseSession.audioBase64 = base64;
    } catch (err) {
      console.warn('Could not encode audio for cloud save:', err);
    }
  }

  const session = buildSessionFromAppState(baseSession, {
    transcript,
    sessionName: baseSession.sessionName,
    audioBase64: baseSession.audioBase64,
    audioMime: baseSession.audioMime
  });
  saveSessionToStorage(session);

  // Disable button during save
  cloudSaveBtn.disabled = true;
  cloudSaveBtnText.textContent = '☁️ Saving...';
  cloudSaveStatus.style.color = 'var(--muted)';
  cloudSaveStatus.textContent = 'Uploading session to cloud...';

  try {
    // Get worker URL
    const workerUrl = localStorage.getItem('depot.workerUrl') ||
                      localStorage.getItem('depot-worker-url') ||
                      'https://depot-voice-notes.martinbibb.workers.dev';
    const userInfo = authModule?.getUserInfo();
    const token = authModule?.getAuthToken ? authModule.getAuthToken() : null;

    if (!token) {
      throw new Error('Authentication required: missing token');
    }

    // Send to cloud
    const response = await fetch(`${workerUrl}/cloud-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        sessionName: session.sessionName,
        sessionData: session,
        userId: userInfo?.id || userInfo?.email
      })
    });

    if (!response.ok) {
      throw new Error(`Cloud save failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Success
    cloudSaveBtn.disabled = false;
    cloudSaveBtnText.textContent = '✅ Saved to Cloud';
    cloudSaveStatus.style.color = 'var(--success)';
    cloudSaveStatus.textContent = `✅ Session saved successfully! (${(JSON.stringify(session).length / 1024).toFixed(1)} KB)`;

    // Reset button text after 3 seconds
    setTimeout(() => {
      cloudSaveBtnText.textContent = '☁️ Save Session to Cloud';
    }, 3000);

  } catch (error) {
    console.error('Cloud save error:', error);
    cloudSaveBtn.disabled = false;
    cloudSaveBtnText.textContent = '❌ Save Failed';
    cloudSaveStatus.style.color = 'var(--danger)';
    cloudSaveStatus.textContent = `❌ Error: ${error.message || 'Could not save to cloud'}`;

    // Reset button text after 5 seconds
    setTimeout(() => {
      cloudSaveBtnText.textContent = '☁️ Save Session to Cloud';
    }, 5000);
  }
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

  // Cloud save button (Voice Notes 2.0)
  const saveToCloudBtn = document.getElementById('saveToCloudBtn');
  if (saveToCloudBtn) {
    saveToCloudBtn.addEventListener('click', saveSessionToCloud);
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
