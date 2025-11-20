/**
 * Agent Monitoring Mode
 * Live transcript analysis with intelligent question suggestions
 * Based on System-recommendation performance matrix
 */

import { CRITICAL_QUESTIONS, PERFORMANCE_DATA } from './performanceData.js';

// Agent state
const AGENT_STATE = {
  enabled: false,
  askedQuestions: new Set(),
  detectedInfo: {},
  suggestions: [],
  lastAnalysis: null
};

/**
 * Enable/disable agent mode
 */
export function setAgentMode(enabled) {
  AGENT_STATE.enabled = enabled;
  localStorage.setItem('depot.agentMode', enabled ? 'true' : 'false');

  if (enabled) {
    updateSuggestionsUI();
  } else {
    clearSuggestionsUI();
  }

  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('agentModeChanged', {
    detail: { enabled }
  }));
}

/**
 * Get current agent mode state
 */
export function isAgentModeEnabled() {
  return AGENT_STATE.enabled;
}

/**
 * Load agent mode setting from localStorage
 */
export function loadAgentMode() {
  const saved = localStorage.getItem('depot.agentMode');
  if (saved === 'true') {
    setAgentMode(true);
  }
}

/**
 * Mark a question as asked
 */
export function markQuestionAsked(questionId) {
  AGENT_STATE.askedQuestions.add(questionId);
  localStorage.setItem('depot.askedQuestions',
    JSON.stringify([...AGENT_STATE.askedQuestions]));

  // Re-analyze to update suggestions
  if (AGENT_STATE.lastAnalysis) {
    analyzeTranscriptForQuestions(AGENT_STATE.lastAnalysis.sections);
  }
}

/**
 * Reset asked questions (e.g., for new session)
 */
export function resetAskedQuestions() {
  AGENT_STATE.askedQuestions.clear();
  localStorage.removeItem('depot.askedQuestions');

  if (AGENT_STATE.lastAnalysis) {
    analyzeTranscriptForQuestions(AGENT_STATE.lastAnalysis.sections);
  }
}

/**
 * Load asked questions from localStorage
 */
function loadAskedQuestions() {
  try {
    const saved = localStorage.getItem('depot.askedQuestions');
    if (saved) {
      const questions = JSON.parse(saved);
      AGENT_STATE.askedQuestions = new Set(questions);
    }
  } catch (e) {
    console.error('Failed to load asked questions:', e);
  }
}

/**
 * Extract information from sections
 */
function extractInfoFromSections(sections) {
  const info = {};

  if (!sections || !Array.isArray(sections)) {
    return info;
  }

  // Combine all section content for analysis
  const allContent = sections
    .map(s => `${s.title || ''} ${s.content || ''}`.toLowerCase())
    .join(' ');

  // Extract specific data points
  CRITICAL_QUESTIONS.critical.forEach(q => {
    const detected = detectInContent(allContent, q.keywords);
    if (detected) {
      info[q.dataKey] = detected;
    }
  });

  CRITICAL_QUESTIONS.important.forEach(q => {
    const detected = detectInContent(allContent, q.keywords);
    if (detected) {
      info[q.dataKey] = detected;
    }
  });

  CRITICAL_QUESTIONS.optional.forEach(q => {
    const detected = detectInContent(allContent, q.keywords);
    if (detected) {
      info[q.dataKey] = detected;
    }
  });

  return info;
}

/**
 * Detect if keywords are present in content
 */
function detectInContent(content, keywords) {
  if (!keywords || !Array.isArray(keywords)) return false;

  for (const keyword of keywords) {
    if (content.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Analyze sections to determine which questions to suggest
 */
export function analyzeTranscriptForQuestions(sections) {
  if (!AGENT_STATE.enabled) {
    return;
  }

  // Store for future reference
  AGENT_STATE.lastAnalysis = { sections, timestamp: Date.now() };

  // Extract what we know from sections
  AGENT_STATE.detectedInfo = extractInfoFromSections(sections);

  // Generate suggestions
  const suggestions = {
    critical: [],
    important: [],
    optional: []
  };

  // Check critical questions
  CRITICAL_QUESTIONS.critical.forEach(q => {
    if (!AGENT_STATE.askedQuestions.has(q.id) && !AGENT_STATE.detectedInfo[q.dataKey]) {
      suggestions.critical.push(q);
    }
  });

  // Check important questions
  CRITICAL_QUESTIONS.important.forEach(q => {
    if (!AGENT_STATE.askedQuestions.has(q.id) && !AGENT_STATE.detectedInfo[q.dataKey]) {
      suggestions.important.push(q);
    }
  });

  // Check optional questions
  CRITICAL_QUESTIONS.optional.forEach(q => {
    if (!AGENT_STATE.askedQuestions.has(q.id) && !AGENT_STATE.detectedInfo[q.dataKey]) {
      suggestions.optional.push(q);
    }
  });

  AGENT_STATE.suggestions = suggestions;
  updateSuggestionsUI();

  return suggestions;
}

/**
 * Update the suggestions UI
 */
function updateSuggestionsUI() {
  const panel = document.getElementById('agentSuggestionsPanel');
  const content = document.getElementById('agentSuggestionsContent');

  if (!panel || !content) {
    return;
  }

  if (!AGENT_STATE.enabled) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const { critical, important, optional } = AGENT_STATE.suggestions;
  const hasAnySuggestions = critical.length > 0 || important.length > 0 || optional.length > 0;

  if (!hasAnySuggestions) {
    content.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--muted);">
        <div style="font-size: 2rem; margin-bottom: 8px;">✓</div>
        <div style="font-size: 0.85rem;">All key questions covered!</div>
      </div>
    `;
    return;
  }

  let html = '';

  // Critical questions (red)
  if (critical.length > 0) {
    html += `
      <div class="suggestion-group">
        <div class="suggestion-header critical">
          <span class="priority-icon">🔴</span>
          <span>Critical Questions (${critical.length})</span>
        </div>
        ${critical.map(q => renderQuestion(q, 'critical')).join('')}
      </div>
    `;
  }

  // Important questions (yellow)
  if (important.length > 0) {
    html += `
      <div class="suggestion-group">
        <div class="suggestion-header important">
          <span class="priority-icon">🟡</span>
          <span>Important Questions (${important.length})</span>
        </div>
        ${important.map(q => renderQuestion(q, 'important')).join('')}
      </div>
    `;
  }

  // Optional questions (green)
  if (optional.length > 0) {
    html += `
      <div class="suggestion-group">
        <div class="suggestion-header optional">
          <span class="priority-icon">🟢</span>
          <span>Nice-to-Have (${optional.length})</span>
        </div>
        ${optional.map(q => renderQuestion(q, 'optional')).join('')}
      </div>
    `;
  }

  content.innerHTML = html;

  // Attach event listeners for "Mark as Asked" buttons
  content.querySelectorAll('.mark-asked-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const questionId = e.target.dataset.questionId;
      markQuestionAsked(questionId);
    });
  });
}

/**
 * Render a single question
 */
function renderQuestion(question, priority) {
  return `
    <div class="suggestion-item ${priority}">
      <div class="suggestion-question">${question.question}</div>
      <div class="suggestion-why">${question.why}</div>
      <button class="mark-asked-btn" data-question-id="${question.id}">
        Mark as Asked
      </button>
    </div>
  `;
}

/**
 * Clear suggestions UI
 */
function clearSuggestionsUI() {
  const panel = document.getElementById('agentSuggestionsPanel');
  if (panel) {
    panel.style.display = 'none';
  }
}

/**
 * Get current suggestions (for external use)
 */
export function getCurrentSuggestions() {
  return AGENT_STATE.suggestions;
}

/**
 * Get detected information (for external use)
 */
export function getDetectedInfo() {
  return AGENT_STATE.detectedInfo;
}

/**
 * Initialize agent mode
 */
export function initAgentMode() {
  loadAskedQuestions();
  loadAgentMode();
}

// Export state for debugging
if (typeof window !== 'undefined') {
  window.__depotAgentState = AGENT_STATE;
}
