/**
 * System Recommendation UI
 *
 * User interface for the system-recommendation engine integration.
 * Displays Gold/Silver/Bronze options with debug JSON viewer.
 */

import {
  buildRecommendationsFromDepotSurvey,
  getTopThreeRecommendations
} from '../src/services/systemRecommendationService.js';

import { extractHeatingRequirements } from './recommendationEngine.js';
import { loadChecklistState } from '../src/app/state.js';
import { buildDepotOutputFromChecklist } from '../src/notes/notesEngine.js';

/**
 * Gets current session data from the application state
 * @returns {{sections: Array, notes: Array, hasData: boolean}}
 */
function getCurrentSessionData() {
  // Load checklist state from localStorage
  const checklistState = loadChecklistState();

  // Build depot output from checklist
  const { sections, materials } = buildDepotOutputFromChecklist(checklistState);

  // Convert sections to the format expected by extractHeatingRequirements
  const formattedSections = sections.map(s => ({
    section: s.name,
    plainText: s.plain,
    naturalLanguage: s.nl
  }));

  // Extract notes from sections (combine plain and natural language)
  const notes = sections.flatMap(s => {
    const result = [];
    if (s.plain) result.push(s.plain);
    if (s.nl) result.push(s.nl);
    return result;
  }).filter(Boolean);

  const hasData = formattedSections.length > 0 || notes.length > 0;

  return {
    sections: formattedSections,
    notes,
    materials,
    hasData
  };
}

/**
 * Shows the system recommendation panel with Gold/Silver/Bronze options
 */
export async function showSystemRecommendationPanel() {
  try {
    // Get current session data
    const { sections, notes, materials, hasData } = getCurrentSessionData();

    if (!hasData) {
      // Show dialog with option to load session
      showNoDataDialog();
      return;
    }

    // Show loading state
    showLoadingModal();

    // Extract requirements from current session
    const requirements = extractHeatingRequirements(sections, notes);

    // Get recommendations
    const result = await buildRecommendationsFromDepotSurvey(requirements);

    // Close loading modal
    closeLoadingModal();

    // Display recommendations
    displayRecommendationsModal(result, requirements);

  } catch (error) {
    closeLoadingModal();
    console.error('❌ Failed to generate recommendations:', error);
    alert(`Failed to generate recommendations: ${error.message}`);
  }
}

/**
 * Shows a dialog when no session data is available
 */
function showNoDataDialog() {
  const modal = document.createElement('div');
  modal.id = 'system-rec-no-data-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="background: white; padding: 40px; border-radius: 16px; text-align: center; max-width: 500px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
      <div style="font-size: 64px; margin-bottom: 20px;">📋</div>
      <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700; color: #333;">No Survey Data Available</h2>
      <p style="margin: 0 0 30px 0; color: #666; font-size: 15px; line-height: 1.6;">
        To generate system recommendations, you need survey data. You can either:
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button id="loadSessionFromCloudBtn" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 16px 24px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
          📁 Load Session from Cloud
        </button>
        <button id="loadSessionFromFileBtn" style="background: #48bb78; color: white; border: none; padding: 16px 24px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
          💾 Load Session from File
        </button>
        <button id="startNewRecordingBtn" style="background: #f6ad55; color: white; border: none; padding: 16px 24px; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
          🎙️ Start New Recording
        </button>
        <button onclick="this.closest('#system-rec-no-data-modal').remove()" style="background: #e2e8f0; color: #64748b; border: none; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s;">
          Cancel
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add event listeners
  document.getElementById('loadSessionFromCloudBtn').addEventListener('click', () => {
    modal.remove();
    loadSessionFromCloud();
  });

  document.getElementById('loadSessionFromFileBtn').addEventListener('click', () => {
    modal.remove();
    const loadSessionInput = document.getElementById('loadSessionInput');
    if (loadSessionInput) {
      loadSessionInput.click();
      // Wait a bit and try again after file is loaded
      setTimeout(() => {
        showSystemRecommendationPanel();
      }, 1000);
    }
  });

  document.getElementById('startNewRecordingBtn').addEventListener('click', () => {
    modal.remove();
    const startLiveBtn = document.getElementById('startLiveBtn');
    if (startLiveBtn) {
      startLiveBtn.click();
    }
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Loads a session from cloud storage
 */
async function loadSessionFromCloud() {
  // Show modal with session list
  showLoadingModal('Loading sessions from cloud...');

  try {
    // TODO: Implement cloud session loading
    // For now, show a placeholder
    closeLoadingModal();

    const modal = document.createElement('div');
    modal.id = 'cloud-session-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      overflow-y: auto;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div style="background: white; padding: 40px; border-radius: 16px; max-width: 800px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #333;">Load Session from Cloud</h2>
          <button onclick="this.closest('#cloud-session-modal').remove()" style="background: #e2e8f0; border: none; color: #64748b; font-size: 24px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer;">×</button>
        </div>

        <div id="cloudSessionList" style="min-height: 200px;">
          <div style="text-align: center; padding: 60px 20px; color: #999;">
            <div style="font-size: 48px; margin-bottom: 20px;">☁️</div>
            <p style="font-size: 16px; margin: 0;">Cloud session loading coming soon!</p>
            <p style="font-size: 14px; margin: 10px 0 0 0;">For now, please use "Load Session from File" or start a new recording.</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

  } catch (error) {
    closeLoadingModal();
    console.error('❌ Failed to load sessions from cloud:', error);
    alert(`Failed to load sessions: ${error.message}`);
  }
}

/**
 * Shows a loading modal while recommendations are being generated
 */
function showLoadingModal(message = 'Generating Recommendations...') {
  const modal = document.createElement('div');
  modal.id = 'system-rec-loading-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="background: white; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
      <div style="font-size: 48px; margin-bottom: 20px;">⚙️</div>
      <div style="font-size: 18px; font-weight: 600; color: #333;">${message}</div>
      <div style="font-size: 14px; color: #666; margin-top: 10px;">Analyzing your survey data</div>
    </div>
  `;

  document.body.appendChild(modal);
}

/**
 * Closes the loading modal
 */
function closeLoadingModal() {
  const modal = document.getElementById('system-rec-loading-modal');
  if (modal) modal.remove();
}

/**
 * Displays the recommendations in a modal with Gold/Silver/Bronze cards
 *
 * @param {SystemRecommendationResult} result - Recommendation result
 * @param {Object} requirements - Original requirements
 */
function displayRecommendationsModal(result, requirements) {
  // Create modal backdrop
  const modal = document.createElement('div');
  modal.id = 'system-rec-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    overflow-y: auto;
    z-index: 9999;
    padding: 20px;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    max-width: 1200px;
    margin: 0 auto;
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  `;

  // Header
  const header = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 16px 16px 0 0;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">System Recommendations</h2>
          <p style="margin: 0; opacity: 0.9; font-size: 14px;">Based on property analysis and hard science</p>
        </div>
        <button onclick="document.getElementById('system-rec-modal').remove()"
                style="background: rgba(255,255,255,0.2); border: none; color: white; font-size: 28px; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; transition: all 0.2s;">
          ×
        </button>
      </div>
    </div>
  `;

  // Summary
  const summary = `
    <div style="padding: 30px; border-bottom: 2px solid #f0f0f0;">
      <h3 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #333;">Recommendation Summary</h3>
      <p style="margin: 0; line-height: 1.6; color: #555; font-size: 15px;">${result.reasoningSummary || 'No summary available'}</p>
    </div>
  `;

  // Options (Gold/Silver/Bronze)
  const options = result.options.slice(0, 3);
  const tierLabels = ['🥇 GOLD', '🥈 SILVER', '🥉 BRONZE'];
  const tierColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

  const optionsHTML = `
    <div style="padding: 30px;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #333;">Top Recommendations</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
        ${options.map((opt, idx) => createOptionCard(opt, tierLabels[idx], tierColors[idx])).join('')}
      </div>
    </div>
  `;

  // Debug panel (collapsible)
  const debugPanel = `
    <div style="padding: 30px; background: #f8f9fa; border-radius: 0 0 16px 16px;">
      <details style="cursor: pointer;">
        <summary style="font-weight: 600; font-size: 16px; color: #333; margin-bottom: 15px; user-select: none;">
          🔍 Debug: Raw JSON Output
        </summary>
        <div style="background: #1e1e1e; color: #d4d4d4; padding: 20px; border-radius: 8px; overflow-x: auto; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5;">
          <pre style="margin: 0; white-space: pre-wrap;">${JSON.stringify({ result, requirements }, null, 2)}</pre>
        </div>
      </details>
    </div>
  `;

  modalContent.innerHTML = header + summary + optionsHTML + debugPanel;
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Creates an option card HTML for Gold/Silver/Bronze display
 *
 * @param {SystemOption} option - System option
 * @param {string} tierLabel - Tier label (GOLD/SILVER/BRONZE)
 * @param {string} tierColor - Tier color
 * @returns {string} HTML string
 */
function createOptionCard(option, tierLabel, tierColor) {
  if (!option) {
    return `<div style="padding: 20px; text-align: center; color: #999;">No option available</div>`;
  }

  const relevantPoints = Array.from(option.relevant || []).slice(0, 4).map(r => {
    const [type, text] = r.split(':');
    const icon = type === 'pros' ? '✓' : '⚠';
    const color = type === 'pros' ? '#48bb78' : '#f6ad55';
    return `<li style="margin-bottom: 8px; color: #555;"><span style="color: ${color}; font-weight: 600;">${icon}</span> ${text}</li>`;
  }).join('');

  return `
    <div style="border: 2px solid ${tierColor}; border-radius: 12px; overflow: hidden; transition: all 0.3s; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
      <div style="background: ${tierColor}; color: white; padding: 12px 20px; font-weight: 700; font-size: 14px; text-align: center;">
        ${tierLabel}
      </div>
      <div style="padding: 20px;">
        <h4 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #333;">${option.title}</h4>
        <p style="margin: 0 0 15px 0; font-size: 13px; color: #666; font-weight: 500;">
          ${option.boilerLabel} + ${option.waterLabel}
        </p>

        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <div style="font-size: 13px; color: #555; margin-bottom: 5px;">
            <strong>Score:</strong> ${option.score} |
            <strong>Efficiency:</strong> ${option.profile.efficiency}
          </div>
          <div style="font-size: 13px; color: #555;">
            <strong>Lifespan:</strong> ${option.profile.lifespan}
          </div>
        </div>

        ${relevantPoints ? `
          <div style="margin-top: 15px;">
            <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 10px;">Key Factors:</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6;">
              ${relevantPoints}
            </ul>
          </div>
        ` : ''}

        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0;">
          <div style="font-size: 12px; color: #666; line-height: 1.5;">
            <strong>Best for:</strong> ${option.profile.bestFor}
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize the system recommendation UI
 * Adds button to toolbar and sets up event listeners
 */
export function initSystemRecommendationUI() {
  // Find the toolbar
  const toolbar = document.querySelector('.toolbar-row');
  if (!toolbar) {
    console.warn('⚠️ Toolbar not found, cannot add system recommendation button');
    return;
  }

  // Create button
  const btn = document.createElement('button');
  btn.id = 'systemRecommendationBtn';
  btn.className = 'pill-secondary';
  btn.innerHTML = '🎯 System Rec';
  btn.title = 'Generate system recommendations using hard science engine';

  // Add event listener
  btn.addEventListener('click', () => {
    showSystemRecommendationPanel();
  });

  // Insert button after settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.parentNode.insertBefore(btn, settingsBtn.nextSibling);
  } else {
    toolbar.appendChild(btn);
  }

  console.log('✓ System Recommendation UI initialized');
}
