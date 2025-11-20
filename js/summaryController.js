/**
 * Summary Controller
 * Handles the UI and interaction for the heating system recommendation summary
 */

import {
  extractHeatingRequirements,
  generateRecommendations,
  explainRecommendation
} from './recommendationEngine.js';
import { generateSummaryPDF } from './summaryPDF.js';

// Modal elements
const summaryModal = document.getElementById('summaryModal');
const closeSummaryModalBtn = document.getElementById('closeSummaryModalBtn');
const closeSummaryBtn = document.getElementById('closeSummaryBtn');
const summaryContent = document.getElementById('summaryContent');
const summaryActions = document.getElementById('summaryActions');
const generatePDFBtn = document.getElementById('generatePDFBtn');

// Global state
let currentRecommendationData = null;
let selectedSystemKey = null;

/**
 * Show the summary modal and generate recommendations
 */
export function showSummaryModal(sections, notes) {
  if (!summaryModal) return;

  // Reset state
  currentRecommendationData = null;
  selectedSystemKey = null;

  // Show modal with loading state
  summaryContent.innerHTML = '<div class="loading-message"><p>Analyzing your requirements...</p></div>';
  summaryActions.style.display = 'none';
  summaryModal.classList.add('active');

  // Generate recommendations
  try {
    const requirements = extractHeatingRequirements(sections, notes);
    const recommendationData = generateRecommendations(requirements);

    currentRecommendationData = recommendationData;

    // Display recommendations
    displayRecommendations(recommendationData);
    summaryActions.style.display = 'flex';
  } catch (error) {
    console.error('Error generating recommendations:', error);
    summaryContent.innerHTML = `
      <div class="loading-message">
        <p style="color: var(--danger);">Error generating recommendations: ${error.message}</p>
        <p>Please ensure you have provided sufficient information about the property (occupants, bathrooms, etc.)</p>
      </div>
    `;
  }
}

/**
 * Display recommendations in the modal
 */
function displayRecommendations(recommendationData) {
  const { requirements, recommendations, bestOption, alternatives } = recommendationData;

  let html = '';

  // If user has selected a different system, show comparison notice
  if (selectedSystemKey && selectedSystemKey !== bestOption.key) {
    const selectedSystem = recommendations.find(r => r.key === selectedSystemKey);
    html += `
      <div class="comparison-notice">
        <h3>⚠ Alternative System Selected</h3>
        <p>
          You've chosen <strong>${selectedSystem.profile.name}</strong> instead of the recommended
          <strong>${bestOption.profile.name}</strong>. The PDF will include a comparison showing
          strengths and weaknesses of both systems.
        </p>
      </div>
    `;
  }

  // Property requirements summary
  html += `
    <div class="system-summary">
      <strong>Your Property Profile:</strong><br>
      ${requirements.occupants > 0 ? `${requirements.occupants} occupants, ` : ''}
      ${requirements.bedrooms > 0 ? `${requirements.bedrooms} bedrooms, ` : ''}
      ${requirements.bathrooms > 0 ? `${requirements.bathrooms} bathrooms` : ''}
      ${requirements.houseType ? ` | ${requirements.houseType}` : ''}
      ${requirements.mainsPressure > 0 ? `<br>Mains pressure: ${requirements.mainsPressure} bar` : ''}
      ${requirements.flowRate > 0 ? `, Flow rate: ${requirements.flowRate} L/min` : ''}
    </div>
  `;

  // Display top recommendation
  html += renderSystemCard(bestOption, true);

  // Display top 2 alternatives
  alternatives.forEach((alt, index) => {
    html += renderSystemCard(alt, false);
  });

  summaryContent.innerHTML = html;

  // Add event listeners to select buttons
  attachSelectButtonListeners();
}

/**
 * Render a system recommendation card
 */
function renderSystemCard(recommendation, isRecommended) {
  const { key, profile, score, reasons } = recommendation;
  const explanation = explainRecommendation(recommendation, currentRecommendationData.requirements);

  const isSelected = key === selectedSystemKey;
  const cardClass = isRecommended && !selectedSystemKey ? 'recommended' : isSelected ? 'selected' : '';

  const badge = isRecommended && !selectedSystemKey
    ? '<span class="system-badge badge-recommended">✓ Recommended</span>'
    : isSelected
    ? '<span class="system-badge badge-score">✓ Selected</span>'
    : '<span class="system-badge badge-alternative">Alternative</span>';

  const scoreClass = score >= 80 ? 'badge-recommended' : score >= 60 ? 'badge-alternative' : 'badge-score';

  return `
    <div class="system-recommendation ${cardClass}" data-system-key="${key}">
      <div class="system-header">
        <div>
          <div class="system-name">
            ${profile.name}
            ${badge}
          </div>
        </div>
        <span class="system-badge ${scoreClass}">Score: ${Math.round(score)}/100</span>
      </div>

      <div class="system-image-container">
        <img src="/assets/system-graphics/${profile.image}" alt="${profile.name}" class="system-image"
             onerror="this.style.display='none'">
      </div>

      <div class="system-summary">
        ${explanation.summary}
      </div>

      <div class="system-specs">
        <div class="spec-item">
          <div class="spec-label">Efficiency</div>
          <div class="spec-value">${profile.efficiency}</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">Install Cost</div>
          <div class="spec-value">${profile.installCost}</div>
        </div>
        <div class="spec-item">
          <div class="spec-label">Lifespan</div>
          <div class="spec-value">${profile.lifespan}</div>
        </div>
      </div>

      <div class="strengths-limitations">
        <div class="strength-section">
          <div class="section-title">✓ Strengths</div>
          ${profile.strengths.slice(0, 5).map(s => `<div class="list-item">${s}</div>`).join('')}
        </div>
        <div class="limitation-section">
          <div class="section-title">⚠ Limitations</div>
          ${profile.limitations.slice(0, 5).map(l => `<div class="list-item">${l}</div>`).join('')}
        </div>
      </div>

      ${reasons.length > 0 ? `
        <div class="system-reasons">
          <div class="section-title">💡 Why for your property:</div>
          ${reasons.map(r => `<div class="list-item">${r}</div>`).join('')}
        </div>
      ` : ''}

      ${!isSelected ? `
        <button class="select-system-btn" data-system-key="${key}">
          ${isRecommended ? '✓ Accept Recommendation' : 'Select This System Instead'}
        </button>
      ` : '<div style="text-align: center; padding: 12px; color: var(--accent); font-weight: 600;">✓ This system will be featured in the PDF</div>'}
    </div>
  `;
}

/**
 * Attach event listeners to select buttons
 */
function attachSelectButtonListeners() {
  const selectButtons = summaryContent.querySelectorAll('.select-system-btn');
  selectButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const systemKey = e.target.dataset.systemKey;
      selectedSystemKey = systemKey;
      displayRecommendations(currentRecommendationData);
    });
  });
}

/**
 * Generate and download PDF
 */
async function handleGeneratePDF() {
  if (!currentRecommendationData) return;

  try {
    generatePDFBtn.disabled = true;
    generatePDFBtn.textContent = '⏳ Generating PDF...';

    await generateSummaryPDF(currentRecommendationData, selectedSystemKey);

    generatePDFBtn.textContent = '✓ PDF Generated!';
    setTimeout(() => {
      generatePDFBtn.textContent = '📄 Generate PDF Report';
      generatePDFBtn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Error generating PDF: ' + error.message);
    generatePDFBtn.textContent = '📄 Generate PDF Report';
    generatePDFBtn.disabled = false;
  }
}

/**
 * Close modal
 */
function closeSummary() {
  summaryModal.classList.remove('active');
  currentRecommendationData = null;
  selectedSystemKey = null;
}

/**
 * Initialize event listeners
 */
export function initSummaryController() {
  if (closeSummaryModalBtn) {
    closeSummaryModalBtn.addEventListener('click', closeSummary);
  }

  if (closeSummaryBtn) {
    closeSummaryBtn.addEventListener('click', closeSummary);
  }

  if (generatePDFBtn) {
    generatePDFBtn.addEventListener('click', handleGeneratePDF);
  }

  // Close on overlay click
  if (summaryModal) {
    summaryModal.addEventListener('click', (e) => {
      if (e.target === summaryModal) {
        closeSummary();
      }
    });
  }
}

/**
 * Get app state (will be overridden by main.js)
 */
export function getAppState() {
  // This will be called from the button handler
  // The actual APP_STATE will be accessed from the global scope
  if (typeof window.__depotAppState !== 'undefined') {
    return window.__depotAppState;
  }
  return { sections: [], notes: [] };
}
