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
import {
  generateEnhancedRecommendations,
  isAIPresentationAvailable,
  formatAIContentForDisplay
} from './presentationAI.js';

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
let aiPresentationData = null; // NEW: Store AI-generated content

/**
 * Show the summary modal and generate recommendations
 */
export async function showSummaryModal(sections, notes, transcriptText = '') {
  if (!summaryModal) return;

  // Reset state
  currentRecommendationData = null;
  selectedSystemKey = null;
  aiPresentationData = null;

  // Show modal with loading state
  summaryContent.innerHTML = '<div class="loading-message"><p>🤖 Analyzing your conversation and generating personalized recommendations...</p></div>';
  summaryActions.style.display = 'none';
  summaryModal.classList.add('active');

  try {
    // Check if AI presentation is available
    const useAI = isAIPresentationAvailable() && transcriptText && transcriptText.trim();

    if (useAI) {
      // Generate AI-powered recommendations
      console.log('✨ Using AI-powered presentation generation');

      const sessionData = {
        fullTranscript: transcriptText,
        sections,
        materials: [], // Extract from notes if available
        customerSummary: extractCustomerSummary(sections)
      };

      const enhancedData = await generateEnhancedRecommendations(sessionData);

      // Convert to standard format for compatibility
      const requirements = extractHeatingRequirements(sections, notes);
      currentRecommendationData = {
        requirements,
        recommendations: enhancedData.recommendations.map(r => ({
          key: r.systemKey,
          profile: r.profile,
          score: r.score,
          reasons: r.reasons
        })),
        bestOption: {
          key: enhancedData.recommendations[0].systemKey,
          profile: enhancedData.recommendations[0].profile,
          score: enhancedData.recommendations[0].score,
          reasons: enhancedData.recommendations[0].reasons
        },
        alternatives: enhancedData.recommendations.slice(1, 3).map(r => ({
          key: r.systemKey,
          profile: r.profile,
          score: r.score,
          reasons: r.reasons
        })),
        transcript: transcriptText
      };

      aiPresentationData = enhancedData;

    } else {
      // Fallback to traditional recommendation engine
      console.log('⚠ AI presentation not available, using traditional engine');
      const requirements = extractHeatingRequirements(sections, notes);
      const recommendationData = generateRecommendations(requirements);
      recommendationData.transcript = transcriptText || '';
      currentRecommendationData = recommendationData;
    }

    // Display recommendations
    displayRecommendations(currentRecommendationData);
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
 * Extract customer summary from sections
 */
function extractCustomerSummary(sections) {
  const needsSection = sections.find(s => s.section === 'Needs');
  return needsSection?.naturalLanguage || needsSection?.plainText || '';
}

/**
 * Display recommendations in the modal
 */
function displayRecommendations(recommendationData) {
  const { requirements, recommendations, bestOption, alternatives, transcript } = recommendationData;

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
  html += renderTranscriptContext(requirements, bestOption, transcript);

  const bestExplanation = explainRecommendation(bestOption, requirements);

  // Display top recommendation
  html += renderSystemCard(bestOption, true, bestExplanation.actionBenefits);

  // Display top 2 alternatives
  alternatives.forEach((alt, index) => {
    const altExplanation = explainRecommendation(alt, requirements);
    html += renderSystemCard(alt, false, altExplanation.actionBenefits);
  });

  summaryContent.innerHTML = html;

  // Add event listeners to select buttons
  attachSelectButtonListeners();
}

/**
 * Render a system recommendation card
 */
function renderSystemCard(recommendation, isRecommended, actionBenefits = []) {
  const { key, profile, score, reasons } = recommendation;

  // Check if we have AI-generated content for this system
  const aiRec = aiPresentationData?.recommendations?.find(r => r.systemKey === key);
  const hasAIContent = aiRec && aiRec.formattedContent;

  const explanation = hasAIContent ? null : explainRecommendation(recommendation, currentRecommendationData.requirements);

  const isSelected = key === selectedSystemKey;
  const cardClass = isRecommended && !selectedSystemKey ? 'recommended' : isSelected ? 'selected' : '';

  const badge = isRecommended && !selectedSystemKey
    ? '<span class="system-badge badge-recommended">✨ AI Recommended</span>'
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

      ${hasAIContent ? renderAIContent(aiRec.formattedContent) : renderStandardContent(profile, explanation, reasons)}

      ${!isSelected ? `
        <button class="select-system-btn" data-system-key="${key}">
          ${isRecommended ? '✓ Accept Recommendation' : 'Select This System Instead'}
        </button>
      ` : '<div style="text-align: center; padding: 12px; color: var(--accent); font-weight: 600;">✓ This system will be featured in the PDF</div>'}
      ${hasAIContent ? '' : renderActionBenefits(actionBenefits)}
    </div>
  `;
}

/**
 * Render AI-generated personalized content
 */
function renderAIContent(formattedContent) {
  const { explanation, benefits, concerns, installation } = formattedContent;

  return `
    <div class="system-summary ai-generated">
      <div class="section-title">✨ Personalized for Your Home</div>
      <div class="ai-explanation">${explanation}</div>
    </div>

    ${benefits && benefits.length > 0 ? `
      <div class="system-reasons">
        <div class="section-title">💡 Benefits for You:</div>
        ${benefits.map(b => `<div class="list-item">${b}</div>`).join('')}
      </div>
    ` : ''}

    ${concerns && concerns.length > 0 ? `
      <div class="system-concerns">
        <div class="section-title">💬 Your Concerns Addressed:</div>
        ${concerns.map(c => `
          <div class="concern-item">
            <div class="concern-question">${c.concern}</div>
            <div class="concern-answer">${c.response}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${installation && installation.process ? `
      <div class="installation-details">
        <div class="section-title">🔧 Installation Process:</div>
        <div class="installation-content">
          ${installation.process}
          ${installation.timeline ? `<div class="timeline"><strong>Timeline:</strong> ${installation.timeline}</div>` : ''}
          ${installation.disruption ? `<div class="disruption"><strong>Disruption:</strong> ${installation.disruption}</div>` : ''}
        </div>
      </div>
    ` : ''}
  `;
}

/**
 * Render standard (non-AI) content
 */
function renderStandardContent(profile, explanation, reasons) {
  return `
    <div class="system-summary">
      ${explanation?.summary || ''}
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
  `;
}

function renderActionBenefits(actionBenefits = []) {
  if (!actionBenefits.length) return '';

  const limited = actionBenefits.slice(0, 3);
  return `
    <div class="system-reasons">
      <div class="section-title">💡 Actions & Benefits for You</div>
      ${limited
        .map(({ action, benefit, annualSaving }) => `
          <div class="list-item">
            <strong>${action}:</strong> ${benefit}${annualSaving ? ` (${annualSaving})` : ''}
          </div>
        `)
        .join('')}
    </div>
  `;
}

function renderTranscriptContext(requirements, bestOption, transcript) {
  // If we have AI-generated property profile, use that
  if (aiPresentationData && aiPresentationData.propertyProfile) {
    const { summary, keyDetails } = aiPresentationData.propertyProfile;
    const highlights = aiPresentationData.conversationHighlights || [];

    return `
      <div class="system-summary ai-property-profile">
        <strong>✨ Your Property (from our conversation):</strong><br>
        <div style="margin-top: 8px;">${summary}</div>
        ${keyDetails && keyDetails.length > 0 ? `
          <div style="margin-top: 8px;">
            ${keyDetails.map(d => `<div class="list-item">• ${d}</div>`).join('')}
          </div>
        ` : ''}
      </div>
      ${highlights.length > 0 ? `
        <div class="system-summary" style="margin-top: 8px;">
          <strong>💡 Key Points from Discussion:</strong><br>
          <div style="margin-top: 8px;">
            ${highlights.map(h => `<div class="list-item">• ${h}</div>`).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  // Fallback to traditional format
  const currentSystem = [];
  if (requirements.currentBoilerType) currentSystem.push(`${requirements.currentBoilerType} boiler`);
  if (requirements.currentWaterSystem) currentSystem.push(requirements.currentWaterSystem.toLowerCase());

  const currentLabel = currentSystem.length
    ? currentSystem.join(' with ')
    : 'Transcript did not clearly state the current system';

  const propertyLine = [
    requirements.occupants > 0 ? `${requirements.occupants} occupants` : '',
    requirements.bedrooms > 0 ? `${requirements.bedrooms} bedrooms` : '',
    requirements.bathrooms > 0 ? `${requirements.bathrooms} bathrooms` : ''
  ]
    .filter(Boolean)
    .join(', ');

  const pressureLine = requirements.mainsPressure > 0
    ? `${requirements.mainsPressure} bar mains pressure` + (requirements.flowRate > 0 ? `, ${requirements.flowRate} L/min flow` : '')
    : requirements.flowRate > 0
      ? `${requirements.flowRate} L/min flow rate`
      : '';

  const transcriptNote = transcript
    ? `<div class="small" style="color: var(--muted); margin-top: 6px;">Transcript used: ${transcript.slice(0, 140)}${
        transcript.length > 140 ? '…' : ''
      }</div>`
    : '';

  return `
    <div class="system-summary">
      <strong>Your Property Profile:</strong><br>
      ${propertyLine || 'No property size mentioned'}
      ${requirements.houseType ? ` | ${requirements.houseType}` : ''}
      ${pressureLine ? `<br>${pressureLine}` : ''}
    </div>
    <div class="system-summary" style="margin-top: 8px;">
      <strong>Current vs Proposed:</strong><br>
      Current system: ${currentLabel}<br>
      Proposed system: ${bestOption.profile.name} (${bestOption.profile.waterSystem})
      ${transcriptNote}
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

    // Pass AI presentation data to PDF generator if available
    await generateSummaryPDF(currentRecommendationData, selectedSystemKey, aiPresentationData);

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
