/**
 * Agent Monitoring Mode
 * Live transcript analysis with intelligent question suggestions
 * Based on System-recommendation performance matrix
 */

import { CRITICAL_QUESTIONS, PERFORMANCE_DATA } from './performanceData.js';

// Agent state
const AGENT_STATE = {
  enabled: false,
  listenMode: false,
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

  panel.style.display = 'flex';

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
  initAgentUI();
}

/**
 * Initialize agent UI (tabs, chat, listen mode)
 */
function initAgentUI() {
  // Tab switching
  const tabs = document.querySelectorAll('.agent-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update active content
      const contents = document.querySelectorAll('.agent-tab-content');
      contents.forEach(c => c.classList.remove('active'));
      const targetContent = document.querySelector(`[data-content="${targetTab}"]`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

  // Listen mode toggle
  const listenSwitch = document.getElementById('agentListenSwitch');
  if (listenSwitch) {
    listenSwitch.addEventListener('change', (e) => {
      AGENT_STATE.listenMode = e.target.checked;
      localStorage.setItem('depot.agentListenMode', e.target.checked ? 'true' : 'false');

      window.dispatchEvent(new CustomEvent('agentListenModeChanged', {
        detail: { enabled: e.target.checked }
      }));
    });

    // Load saved state
    const savedListenMode = localStorage.getItem('depot.agentListenMode');
    if (savedListenMode === 'true') {
      listenSwitch.checked = true;
      AGENT_STATE.listenMode = true;
    }
  }

  // Chat functionality
  const chatSend = document.getElementById('agentChatSend');
  const chatInput = document.getElementById('agentChatInput');

  if (chatSend && chatInput) {
    chatSend.addEventListener('click', () => sendChatMessage());
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  // Close panel button
  const closeBtn = document.getElementById('closeAgentPanel');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const panel = document.getElementById('agentSuggestionsPanel');
      if (panel) {
        panel.style.display = 'none';
      }
    });
  }
}

/**
 * Send a chat message to the AI agent
 */
async function sendChatMessage() {
  const chatInput = document.getElementById('agentChatInput');
  const chatMessages = document.getElementById('agentChatMessages');
  const chatSend = document.getElementById('agentChatSend');

  if (!chatInput || !chatMessages) return;

  const message = chatInput.value.trim();
  if (!message) return;

  // Add user message
  addChatMessage('user', message);
  chatInput.value = '';
  chatSend.disabled = true;

  try {
    // Get current context (sections, transcript)
    const context = getCurrentContext();

    // Get worker URL
    const workerUrl = window.WORKER_URL || 'https://depot-voice-notes.martinbibb.workers.dev';

    // Call AI endpoint
    const response = await fetch(`${workerUrl}/agent-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        context
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get AI response');
    }

    const data = await response.json();

    // Add AI response
    if (data.response) {
      addChatMessage('agent', data.response);
    }
  } catch (err) {
    console.error('Chat error:', err);
    addChatMessage('agent', 'Sorry, I encountered an error. Please try again.');
  } finally {
    chatSend.disabled = false;
  }
}

/**
 * Add a message to the chat
 */
function addChatMessage(type, content) {
  const chatMessages = document.getElementById('agentChatMessages');
  if (!chatMessages) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `agent-chat-message ${type}`;

  const bubble = document.createElement('div');
  bubble.className = 'agent-chat-bubble';
  bubble.textContent = content;

  messageDiv.appendChild(bubble);

  // Add action buttons for agent messages
  if (type === 'agent') {
    const actions = document.createElement('div');
    actions.className = 'agent-chat-actions';

    const addToSectionBtn = document.createElement('button');
    addToSectionBtn.className = 'agent-chat-action-btn';
    addToSectionBtn.textContent = '+ Add to Section';
    addToSectionBtn.addEventListener('click', () => {
      showSectionSelector(content);
    });

    actions.appendChild(addToSectionBtn);
    messageDiv.appendChild(actions);
  }

  chatMessages.appendChild(messageDiv);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Show section selector modal
 */
function showSectionSelector(content) {
  // Get available sections
  const sections = getAvailableSections();

  if (sections.length === 0) {
    alert('No sections available. Please start a survey first.');
    return;
  }

  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;

  modalContent.innerHTML = `
    <h3 style="margin: 0 0 16px 0; font-size: 1.1rem;">Select Section</h3>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${sections.map((section, idx) => `
        <button class="section-select-btn" data-section="${section}" style="
          padding: 12px;
          text-align: left;
          background: var(--bg-secondary);
          border: 2px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.2s;
        ">${section}</button>
      `).join('')}
    </div>
    <button id="cancelSectionSelect" style="
      margin-top: 16px;
      width: 100%;
      padding: 10px;
      background: var(--muted);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    ">Cancel</button>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Add event listeners
  const sectionBtns = modalContent.querySelectorAll('.section-select-btn');
  sectionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      appendToSection(section, content);
      document.body.removeChild(modal);
    });

    btn.addEventListener('mouseenter', (e) => {
      e.target.style.borderColor = 'var(--accent)';
      e.target.style.background = 'var(--bg-hover)';
    });

    btn.addEventListener('mouseleave', (e) => {
      e.target.style.borderColor = 'var(--border)';
      e.target.style.background = 'var(--bg-secondary)';
    });
  });

  const cancelBtn = modalContent.querySelector('#cancelSectionSelect');
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

/**
 * Get available sections from the current survey
 */
function getAvailableSections() {
  // Try to get sections from the depot schema
  const schema = window.DEPOT?.schema || window.depotSchema;
  if (schema && Array.isArray(schema)) {
    return schema.map(s => s.name).filter(Boolean);
  }

  // Fallback: get from existing sections in the UI
  const sectionElements = document.querySelectorAll('[data-section-name]');
  if (sectionElements.length > 0) {
    return Array.from(sectionElements).map(el => el.dataset.sectionName).filter(Boolean);
  }

  // Default sections
  return [
    'Needs',
    'Existing System',
    'Property Details',
    'New System Recommendation',
    'Access & Installation',
    'Future Plans'
  ];
}

/**
 * Append content to a specific section
 */
function appendToSection(sectionName, content) {
  // Dispatch event for the main app to handle
  window.dispatchEvent(new CustomEvent('appendToSection', {
    detail: {
      section: sectionName,
      content: content
    }
  }));

  // Show confirmation
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--success);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 10001;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = `✓ Added to ${sectionName}`;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => document.body.removeChild(notification), 300);
  }, 2000);
}

/**
 * Get current context for AI chat
 */
function getCurrentContext() {
  const context = {
    sections: [],
    transcript: '',
    detectedInfo: AGENT_STATE.detectedInfo
  };

  // Try to get current sections from the app state
  if (window.DEPOT?.sections) {
    context.sections = window.DEPOT.sections;
  }

  // Try to get transcript
  if (window.DEPOT?.transcript) {
    context.transcript = window.DEPOT.transcript;
  }

  return context;
}

// Export state for debugging
if (typeof window !== 'undefined') {
  window.__depotAgentState = AGENT_STATE;
}
