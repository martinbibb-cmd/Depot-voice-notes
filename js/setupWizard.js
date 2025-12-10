/**
 * Setup Wizard Module
 * Guides users through initial settings configuration with AI assistance
 */

let wizardElement = null;
let currentStep = 0;
let wizardMode = null; // 'blank' or 'modify'
let aiChatHistory = [];

const WIZARD_STEPS = [
  { id: 'welcome', title: 'Welcome', icon: '👋' },
  { id: 'theme', title: 'Theme', icon: '🎨' },
  { id: 'sections', title: 'Sections', icon: '📋' },
  { id: 'checklist', title: 'Checklist', icon: '✓' },
  { id: 'ai-instructions', title: 'AI Settings', icon: '🤖' },
  { id: 'complete', title: 'Complete', icon: '✅' }
];

/**
 * Show the setup wizard
 */
export function showSetupWizard() {
  if (!wizardElement) {
    createWizard();
  }

  // Reset wizard state
  currentStep = 0;
  wizardMode = null;
  aiChatHistory = [];

  renderWizardStep();
  wizardElement.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Create the wizard HTML structure
 */
function createWizard() {
  const wizardHTML = `
    <div id="setupWizard" class="wizard-overlay">
      <div class="wizard-container">
        <div class="wizard-header">
          <h2 style="margin: 0; color: var(--accent); display: flex; align-items: center; gap: 10px;">
            <span id="wizardStepIcon">🧙‍♂️</span>
            <span id="wizardStepTitle">Settings Setup Wizard</span>
          </h2>
          <button id="closeWizard" class="wizard-close">×</button>
        </div>

        <!-- Progress Bar -->
        <div class="wizard-progress">
          <div class="wizard-progress-bar" id="wizardProgressBar"></div>
          <div class="wizard-progress-steps" id="wizardProgressSteps"></div>
        </div>

        <div class="wizard-layout">
          <!-- Main Content Area -->
          <div class="wizard-content" id="wizardContent">
            <!-- Step content will be rendered here -->
          </div>

          <!-- AI Assistant Sidebar -->
          <div class="wizard-ai-assistant" id="wizardAI">
            <div class="ai-assistant-header">
              <h3 style="margin: 0; font-size: 0.9rem; color: var(--accent);">🤖 AI Setup Assistant</h3>
            </div>
            <div class="ai-chat-messages" id="aiChatMessages">
              <div class="ai-message">
                <div class="ai-avatar">🤖</div>
                <div class="ai-text">
                  <strong>Setup Assistant</strong>
                  <p>Hi! I'm here to help you configure your settings. Ask me anything about the options on each step!</p>
                </div>
              </div>
            </div>
            <div class="ai-chat-input">
              <input type="text" id="aiChatInput" placeholder="Ask me about these settings..." />
              <button id="aiChatSend">Send</button>
            </div>
          </div>
        </div>

        <!-- Navigation -->
        <div class="wizard-footer">
          <button id="wizardPrev" class="secondary" style="visibility: hidden;">← Previous</button>
          <div id="wizardStatus" style="flex: 1; text-align: center; font-size: 0.75rem; color: var(--muted);"></div>
          <button id="wizardNext">Next →</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', wizardHTML);
  wizardElement = document.getElementById('setupWizard');

  // Add event listeners
  document.getElementById('closeWizard').addEventListener('click', closeWizard);
  document.getElementById('wizardPrev').addEventListener('click', previousStep);
  document.getElementById('wizardNext').addEventListener('click', nextStep);
  document.getElementById('aiChatSend').addEventListener('click', handleAIChat);
  document.getElementById('aiChatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAIChat();
  });

  // Close on overlay click
  wizardElement.addEventListener('click', (e) => {
    if (e.target === wizardElement) {
      if (confirm('Exit setup wizard? Your progress will not be saved.')) {
        closeWizard();
      }
    }
  });

  addWizardStyles();
}

/**
 * Render the current wizard step
 */
function renderWizardStep() {
  const step = WIZARD_STEPS[currentStep];

  // Update header
  document.getElementById('wizardStepIcon').textContent = step.icon;
  document.getElementById('wizardStepTitle').textContent = step.title;

  // Update progress bar
  const progress = ((currentStep) / (WIZARD_STEPS.length - 1)) * 100;
  document.getElementById('wizardProgressBar').style.width = `${progress}%`;

  // Render progress steps
  const stepsHTML = WIZARD_STEPS.map((s, idx) => {
    const isActive = idx === currentStep;
    const isComplete = idx < currentStep;
    return `
      <div class="progress-step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}">
        <div class="step-circle">${isComplete ? '✓' : s.icon}</div>
        <div class="step-label">${s.title}</div>
      </div>
    `;
  }).join('');
  document.getElementById('wizardProgressSteps').innerHTML = stepsHTML;

  // Render step content
  const content = document.getElementById('wizardContent');

  switch (step.id) {
    case 'welcome':
      content.innerHTML = renderWelcomeStep();
      break;
    case 'theme':
      content.innerHTML = renderThemeStep();
      break;
    case 'sections':
      content.innerHTML = renderSectionsStep();
      break;
    case 'checklist':
      content.innerHTML = renderChecklistStep();
      break;
    case 'ai-instructions':
      content.innerHTML = renderAIInstructionsStep();
      break;
    case 'complete':
      content.innerHTML = renderCompleteStep();
      break;
  }

  // Update navigation buttons
  const prevBtn = document.getElementById('wizardPrev');
  const nextBtn = document.getElementById('wizardNext');

  prevBtn.style.visibility = currentStep > 0 ? 'visible' : 'hidden';

  if (currentStep === WIZARD_STEPS.length - 1) {
    nextBtn.textContent = '✓ Finish';
    nextBtn.classList.add('success');
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.classList.remove('success');
  }

  // Add AI assistant context message
  addAIContextMessage(step);
}

/**
 * Render welcome step
 */
function renderWelcomeStep() {
  return `
    <div class="wizard-step-content">
      <h2 style="color: var(--accent); margin-bottom: 20px;">Welcome to Settings Setup</h2>
      <p style="font-size: 0.9rem; line-height: 1.6; margin-bottom: 30px;">
        This wizard will help you configure Survey Brain to match your needs.
        You can either start from scratch or modify your existing settings.
      </p>

      <div class="wizard-mode-selection">
        <div class="mode-card ${wizardMode === 'blank' ? 'selected' : ''}" id="modeBlank">
          <div class="mode-icon">📄</div>
          <h3>Blank Canvas</h3>
          <p>Start fresh with default settings and customize everything from scratch</p>
          <button class="mode-select-btn" data-mode="blank">Choose This</button>
        </div>

        <div class="mode-card ${wizardMode === 'modify' ? 'selected' : ''}" id="modeModify">
          <div class="mode-icon">✏️</div>
          <h3>Modify Existing</h3>
          <p>Keep your current settings and make adjustments as needed</p>
          <button class="mode-select-btn" data-mode="modify">Choose This</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render theme step
 */
function renderThemeStep() {
  const currentTheme = localStorage.getItem('depot.themePreference') || 'blue';

  return `
    <div class="wizard-step-content">
      <h2 style="color: var(--accent); margin-bottom: 10px;">Choose Your Theme</h2>
      <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 30px;">
        Select an accent color for the application. This affects buttons, highlights, and accents throughout the app.
      </p>

      <div class="theme-selection">
        <div class="theme-option ${currentTheme === 'blue' ? 'selected' : ''}" data-theme="blue">
          <div class="theme-preview blue-preview">
            <div class="preview-header"></div>
            <div class="preview-button"></div>
            <div class="preview-accent"></div>
          </div>
          <h4>Blue Theme</h4>
          <p>Classic professional blue (default)</p>
        </div>

        <div class="theme-option ${currentTheme === 'green' ? 'selected' : ''}" data-theme="green">
          <div class="theme-preview green-preview">
            <div class="preview-header"></div>
            <div class="preview-button"></div>
            <div class="preview-accent"></div>
          </div>
          <h4>Green Theme</h4>
          <p>Fresh and vibrant green</p>
        </div>
      </div>

      <div class="setting-explanation">
        <h4>What does this setting do?</h4>
        <p>
          The theme setting controls the accent color used throughout the application.
          It changes the color of:
        </p>
        <ul>
          <li>Buttons and interactive elements</li>
          <li>Headers and titles</li>
          <li>Progress indicators</li>
          <li>Highlights and focus states</li>
        </ul>
        <p>
          Your choice is saved locally and will persist across sessions.
        </p>
      </div>
    </div>
  `;
}

/**
 * Render sections step
 */
function renderSectionsStep() {
  return `
    <div class="wizard-step-content">
      <h2 style="color: var(--accent); margin-bottom: 10px;">Configure Survey Sections</h2>
      <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 20px;">
        Sections organize your survey notes. Each section represents a category of information you'll collect.
      </p>

      <div class="setting-explanation">
        <h4>What are sections?</h4>
        <p>
          Sections are the main headings in your survey notes. Examples include:
        </p>
        <ul>
          <li><strong>Needs</strong> - What the customer wants to achieve</li>
          <li><strong>System characteristics</strong> - Current heating setup details</li>
          <li><strong>New boiler and controls</strong> - Proposed installation details</li>
          <li><strong>Pipe work</strong> - Plumbing modifications needed</li>
          <li><strong>Arse_cover_notes</strong> - Disclaimers and risk acknowledgements</li>
        </ul>
      </div>

      <div class="wizard-choice">
        <p style="font-weight: 600; margin-bottom: 15px;">How would you like to proceed?</p>
        <div class="choice-buttons">
          <button class="choice-btn" data-choice="use-defaults">
            <span>📋</span>
            Use Default Sections
            <small>Recommended for most users</small>
          </button>
          <button class="choice-btn" data-choice="customize">
            <span>✏️</span>
            Customize Now
            <small>Advanced: edit sections in settings</small>
          </button>
        </div>
        <p id="sectionsChoice" style="margin-top: 15px; font-size: 0.8rem; color: var(--accent);"></p>
      </div>

      <div class="tip-box">
        <strong>💡 Tip:</strong> You can always customize sections later in the main settings page.
        The default sections cover most heating survey scenarios.
      </div>
    </div>
  `;
}

/**
 * Render checklist step
 */
function renderChecklistStep() {
  return `
    <div class="wizard-step-content">
      <h2 style="color: var(--accent); margin-bottom: 10px;">Configure Survey Checklist</h2>
      <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 20px;">
        The checklist helps you capture all necessary information during surveys.
      </p>

      <div class="setting-explanation">
        <h4>What is the checklist?</h4>
        <p>
          The checklist contains specific questions and items to check during a survey. Each item can:
        </p>
        <ul>
          <li>Be assigned to a specific section</li>
          <li>Include helpful hints for what to look for</li>
          <li>Generate AI-powered notes when checked</li>
          <li>Be grouped by category (e.g., "Boiler & controls", "Safety")</li>
        </ul>
        <p>
          Example checklist items:
        </p>
        <ul>
          <li><strong>Check gas supply</strong> - Current pipe size and adequacy</li>
          <li><strong>Measure flue route</strong> - Length and termination point</li>
          <li><strong>Inspect radiators</strong> - Type, size, and condition</li>
        </ul>
      </div>

      <div class="wizard-choice">
        <p style="font-weight: 600; margin-bottom: 15px;">How would you like to proceed?</p>
        <div class="choice-buttons">
          <button class="choice-btn" data-choice="use-defaults">
            <span>✓</span>
            Use Default Checklist
            <small>Comprehensive standard items</small>
          </button>
          <button class="choice-btn" data-choice="customize">
            <span>✏️</span>
            Customize Now
            <small>Advanced: edit checklist in settings</small>
          </button>
        </div>
        <p id="checklistChoice" style="margin-top: 15px; font-size: 0.8rem; color: var(--accent);"></p>
      </div>

      <div class="tip-box">
        <strong>💡 Tip:</strong> The default checklist includes all standard survey items.
        You can add custom items later in the settings page.
      </div>
    </div>
  `;
}

/**
 * Render AI instructions step
 */
function renderAIInstructionsStep() {
  return `
    <div class="wizard-step-content">
      <h2 style="color: var(--accent); margin-bottom: 10px;">AI Assistant Configuration</h2>
      <p style="font-size: 0.85rem; color: var(--muted); margin-bottom: 20px;">
        Configure how the AI assistant helps you with surveys and notes.
      </p>

      <div class="setting-explanation">
        <h4>What are AI instructions?</h4>
        <p>
          AI instructions control how the AI assistant behaves in different contexts:
        </p>
        <ul>
          <li><strong>Agent Chat</strong> - When the AI helps you during a survey by suggesting questions and providing information</li>
          <li><strong>Section Tweaking</strong> - When the AI improves or refines your survey notes based on your feedback</li>
          <li><strong>Note Generation</strong> - How the AI converts voice transcripts into structured notes</li>
        </ul>
        <p>
          These instructions ensure the AI:
        </p>
        <ul>
          <li>Uses correct terminology for your industry</li>
          <li>Follows your preferred note-taking style</li>
          <li>Prioritizes the information you care about</li>
          <li>Corrects common transcription errors</li>
        </ul>
      </div>

      <div class="wizard-choice">
        <p style="font-weight: 600; margin-bottom: 15px;">How would you like to proceed?</p>
        <div class="choice-buttons">
          <button class="choice-btn" data-choice="use-defaults">
            <span>🤖</span>
            Use Default AI Instructions
            <small>Optimized for heating surveys</small>
          </button>
          <button class="choice-btn" data-choice="customize">
            <span>✏️</span>
            Customize Now
            <small>Advanced: fine-tune AI behavior</small>
          </button>
        </div>
        <p id="aiChoice" style="margin-top: 15px; font-size: 0.8rem; color: var(--accent);"></p>
      </div>

      <div class="tip-box">
        <strong>💡 Tip:</strong> The default AI instructions are carefully crafted for British Gas-style heating surveys.
        Most users should start with defaults and customize later if needed.
      </div>
    </div>
  `;
}

/**
 * Render complete step
 */
function renderCompleteStep() {
  return `
    <div class="wizard-step-content">
      <div style="text-align: center; padding: 40px 20px;">
        <div style="font-size: 4rem; margin-bottom: 20px;">🎉</div>
        <h2 style="color: var(--accent); margin-bottom: 15px;">Setup Complete!</h2>
        <p style="font-size: 0.9rem; line-height: 1.6; margin-bottom: 30px; max-width: 500px; margin-left: auto; margin-right: auto;">
          Your settings have been configured. You can now use Survey Brain with your personalized setup.
        </p>

        <div class="completion-summary">
          <h4 style="margin-bottom: 15px;">What's Next?</h4>
          <ul style="text-align: left; max-width: 400px; margin: 0 auto;">
            <li>Start creating voice note surveys</li>
            <li>Use the AI assistant to help capture information</li>
            <li>Generate professional survey reports</li>
            <li>Customize settings further anytime</li>
          </ul>
        </div>

        <div style="margin-top: 40px;">
          <button id="finishWizard" style="padding: 15px 40px; font-size: 1rem; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
            Get Started →
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Handle navigation to next step
 */
async function nextStep() {
  const step = WIZARD_STEPS[currentStep];

  // Validation and saving logic for each step
  switch (step.id) {
    case 'welcome':
      if (!wizardMode) {
        showWizardStatus('Please select a setup mode', true);
        return;
      }
      break;

    case 'theme':
      saveThemeChoice();
      break;

    case 'sections':
      saveSectionsChoice();
      break;

    case 'checklist':
      saveChecklistChoice();
      break;

    case 'ai-instructions':
      saveAIInstructionsChoice();
      break;

    case 'complete':
      finishWizard();
      return;
  }

  if (currentStep < WIZARD_STEPS.length - 1) {
    currentStep++;
    renderWizardStep();
  }
}

/**
 * Handle navigation to previous step
 */
function previousStep() {
  if (currentStep > 0) {
    currentStep--;
    renderWizardStep();
  }
}

/**
 * Save theme choice
 */
function saveThemeChoice() {
  const selectedTheme = document.querySelector('.theme-option.selected');
  if (selectedTheme) {
    const theme = selectedTheme.dataset.theme;
    localStorage.setItem('depot.themePreference', theme);
    document.documentElement.dataset.theme = theme;
    showWizardStatus('Theme saved successfully!');
  }
}

/**
 * Save sections choice
 */
function saveSectionsChoice() {
  const choice = document.getElementById('sectionsChoice')?.textContent;
  if (choice) {
    showWizardStatus('Sections configuration saved!');
  }
}

/**
 * Save checklist choice
 */
function saveChecklistChoice() {
  const choice = document.getElementById('checklistChoice')?.textContent;
  if (choice) {
    showWizardStatus('Checklist configuration saved!');
  }
}

/**
 * Save AI instructions choice
 */
function saveAIInstructionsChoice() {
  const choice = document.getElementById('aiChoice')?.textContent;
  if (choice) {
    showWizardStatus('AI instructions configured!');
  }
}

/**
 * Finish wizard
 */
function finishWizard() {
  localStorage.setItem('depot.setupWizardCompleted', 'true');
  closeWizard();
  showWizardStatus('Setup complete! Redirecting...', false);
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

/**
 * Show status message
 */
function showWizardStatus(message, isError = false) {
  const statusEl = document.getElementById('wizardStatus');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? 'var(--danger)' : 'var(--accent)';

    setTimeout(() => {
      statusEl.textContent = '';
    }, 3000);
  }
}

/**
 * Add AI context message for current step
 */
function addAIContextMessage(step) {
  let message = '';

  switch (step.id) {
    case 'welcome':
      message = 'Choose between starting fresh or modifying your existing settings. Blank Canvas resets everything to defaults, while Modify Existing keeps your current configuration.';
      break;
    case 'theme':
      message = 'The theme controls the accent color throughout the app. Blue is professional and calm, while Green is vibrant and fresh. This is purely visual and doesn\'t affect functionality.';
      break;
    case 'sections':
      message = 'Sections organize your survey notes into categories. The default sections cover all typical heating survey needs: customer needs, system details, installation specs, and more.';
      break;
    case 'checklist':
      message = 'The checklist ensures you don\'t miss important details during surveys. Each item can have hints and AI templates to help generate notes automatically.';
      break;
    case 'ai-instructions':
      message = 'AI instructions customize how the assistant helps you. The defaults are optimized for British Gas-style heating surveys with proper terminology and formatting.';
      break;
    case 'complete':
      message = 'Congratulations! Your setup is complete. You can always return to settings to make further adjustments.';
      break;
  }

  if (message) {
    addAIMessage(message, true);
  }
}

/**
 * Add AI message to chat
 */
function addAIMessage(text, isAuto = false) {
  const messagesContainer = document.getElementById('aiChatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'ai-message';
  messageDiv.innerHTML = `
    <div class="ai-avatar">🤖</div>
    <div class="ai-text">
      ${!isAuto ? '<strong>Assistant</strong>' : ''}
      <p>${text}</p>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Add user message to chat
 */
function addUserMessage(text) {
  const messagesContainer = document.getElementById('aiChatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'ai-message user-message';
  messageDiv.innerHTML = `
    <div class="ai-text">
      <strong>You</strong>
      <p>${text}</p>
    </div>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Handle AI chat interaction
 */
async function handleAIChat() {
  const input = document.getElementById('aiChatInput');
  const question = input.value.trim();

  if (!question) return;

  addUserMessage(question);
  input.value = '';

  // Get context-aware response
  const step = WIZARD_STEPS[currentStep];
  const response = getAIResponse(question, step.id);

  setTimeout(() => {
    addAIMessage(response);
  }, 500);
}

/**
 * Get AI response based on question and context
 */
function getAIResponse(question, stepId) {
  const lowerQ = question.toLowerCase();

  // General responses
  if (lowerQ.includes('help') || lowerQ.includes('what') && lowerQ.includes('do')) {
    switch (stepId) {
      case 'theme':
        return 'The theme setting changes the accent color used for buttons, headers, and highlights throughout the app. Choose blue for a professional look or green for a fresh appearance. Your choice is purely aesthetic!';
      case 'sections':
        return 'Sections are the main headings in your survey notes (like "Needs", "New boiler and controls", etc.). They help organize information into logical categories. I recommend using the defaults unless you have specific requirements.';
      case 'checklist':
        return 'The checklist is a set of items to review during surveys. Each item can be checked off and can automatically generate notes using AI. The default checklist covers all standard heating survey requirements.';
      case 'ai-instructions':
        return 'AI instructions control how the assistant behaves when helping with surveys, improving notes, and generating reports. The defaults are optimized for heating surveys with proper terminology and industry standards.';
    }
  }

  if (lowerQ.includes('recommend') || lowerQ.includes('should i') || lowerQ.includes('which')) {
    return 'For most users, I recommend using the default settings. They\'ve been carefully designed for British Gas-style heating surveys. You can always customize them later once you\'re familiar with the system!';
  }

  if (lowerQ.includes('customize') || lowerQ.includes('change') || lowerQ.includes('edit')) {
    return 'You can customize any settings later from the main settings page. The wizard helps you get started quickly, and you can fine-tune everything afterward based on your experience.';
  }

  if (lowerQ.includes('blank') || lowerQ.includes('modify') || lowerQ.includes('existing')) {
    return 'Choose "Blank Canvas" if you want to start completely fresh with default settings. Choose "Modify Existing" if you want to keep your current configuration and just make some changes.';
  }

  // Default helpful response
  return `That's a great question! ${stepId === 'welcome' ? 'Let me know if you need help choosing between blank canvas or modifying existing settings.' : 'Feel free to ask specific questions about the settings on this step, or click Next to continue.'}`;
}

/**
 * Close wizard
 */
export function closeWizard() {
  if (wizardElement) {
    wizardElement.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Add wizard styles
 */
function addWizardStyles() {
  const styles = `
    <style>
      .wizard-overlay {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 10000;
        align-items: center;
        justify-content: center;
      }

      .wizard-overlay.active {
        display: flex;
      }

      .wizard-container {
        background: var(--bg);
        border-radius: 12px;
        width: 90%;
        max-width: 1200px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: wizardSlideIn 0.3s ease;
      }

      @keyframes wizardSlideIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .wizard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 25px;
        border-bottom: 2px solid var(--border);
        background: var(--card);
      }

      .wizard-close {
        background: none;
        border: none;
        font-size: 32px;
        cursor: pointer;
        color: var(--muted);
        line-height: 1;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .wizard-close:hover {
        color: var(--danger);
      }

      .wizard-progress {
        padding: 20px 25px 10px;
        background: var(--card);
        border-bottom: 1px solid var(--border);
      }

      .wizard-progress-bar {
        height: 4px;
        background: var(--accent);
        border-radius: 2px;
        transition: width 0.3s ease;
        margin-bottom: 15px;
      }

      .wizard-progress-steps {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }

      .progress-step {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        opacity: 0.5;
        transition: opacity 0.3s;
      }

      .progress-step.active,
      .progress-step.complete {
        opacity: 1;
      }

      .step-circle {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--card);
        border: 2px solid var(--border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        transition: all 0.3s;
      }

      .progress-step.active .step-circle {
        background: var(--accent);
        border-color: var(--accent);
        color: white;
        box-shadow: 0 0 15px var(--accent);
      }

      .progress-step.complete .step-circle {
        background: #10b981;
        border-color: #10b981;
        color: white;
      }

      .step-label {
        font-size: 0.65rem;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
      }

      .wizard-layout {
        display: grid;
        grid-template-columns: 1fr 350px;
        flex: 1;
        overflow: hidden;
      }

      .wizard-content {
        padding: 30px;
        overflow-y: auto;
      }

      .wizard-ai-assistant {
        border-left: 2px solid var(--border);
        background: var(--screen-bg);
        display: flex;
        flex-direction: column;
      }

      .ai-assistant-header {
        padding: 15px;
        border-bottom: 1px solid var(--border);
        background: var(--card);
      }

      .ai-chat-messages {
        flex: 1;
        padding: 15px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 15px;
      }

      .ai-message {
        display: flex;
        gap: 10px;
        animation: messageSlideIn 0.3s ease;
      }

      @keyframes messageSlideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .ai-message.user-message {
        flex-direction: row-reverse;
      }

      .ai-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--accent-soft);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        flex-shrink: 0;
      }

      .ai-text {
        flex: 1;
        font-size: 0.8rem;
        line-height: 1.5;
      }

      .ai-text strong {
        display: block;
        margin-bottom: 5px;
        color: var(--accent);
        font-size: 0.75rem;
      }

      .ai-text p {
        margin: 0;
        padding: 10px;
        background: white;
        border-radius: 8px;
        border: 1px solid var(--border);
      }

      .user-message .ai-text p {
        background: var(--accent-soft);
      }

      .ai-chat-input {
        padding: 15px;
        border-top: 1px solid var(--border);
        display: flex;
        gap: 10px;
        background: var(--card);
      }

      .ai-chat-input input {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 6px;
        font-size: 0.8rem;
      }

      .ai-chat-input button {
        padding: 8px 16px;
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.75rem;
      }

      .wizard-footer {
        padding: 20px 25px;
        border-top: 2px solid var(--border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--card);
      }

      .wizard-step-content {
        max-width: 700px;
      }

      .wizard-mode-selection {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-top: 20px;
      }

      .mode-card {
        border: 2px solid var(--border);
        border-radius: 12px;
        padding: 25px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s;
        background: var(--card);
      }

      .mode-card:hover {
        border-color: var(--accent);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .mode-card.selected {
        border-color: var(--accent);
        background: var(--accent-soft);
        box-shadow: 0 0 20px rgba(37, 99, 235, 0.2);
      }

      .mode-icon {
        font-size: 3rem;
        margin-bottom: 15px;
      }

      .mode-card h3 {
        margin: 0 0 10px 0;
        color: var(--accent);
        font-size: 1.1rem;
      }

      .mode-card p {
        font-size: 0.85rem;
        color: var(--muted);
        margin-bottom: 20px;
        line-height: 1.5;
      }

      .mode-select-btn {
        padding: 10px 24px;
        background: var(--accent);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 0.8rem;
      }

      .theme-selection {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 30px;
      }

      .theme-option {
        border: 2px solid var(--border);
        border-radius: 12px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.3s;
        background: var(--card);
      }

      .theme-option:hover {
        border-color: var(--accent);
      }

      .theme-option.selected {
        border-color: var(--accent);
        background: var(--accent-soft);
      }

      .theme-preview {
        height: 120px;
        border-radius: 8px;
        margin-bottom: 15px;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .blue-preview {
        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      }

      .green-preview {
        background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
      }

      .preview-header {
        height: 12px;
        background: rgba(37, 99, 235, 0.6);
        border-radius: 4px;
      }

      .green-preview .preview-header {
        background: rgba(47, 133, 90, 0.6);
      }

      .preview-button {
        height: 24px;
        width: 60px;
        background: #2563eb;
        border-radius: 4px;
      }

      .green-preview .preview-button {
        background: #2f855a;
      }

      .preview-accent {
        height: 8px;
        background: rgba(37, 99, 235, 0.3);
        border-radius: 4px;
      }

      .green-preview .preview-accent {
        background: rgba(47, 133, 90, 0.3);
      }

      .theme-option h4 {
        margin: 0 0 8px 0;
        color: var(--accent);
        font-size: 1rem;
      }

      .theme-option p {
        margin: 0;
        font-size: 0.8rem;
        color: var(--muted);
      }

      .setting-explanation {
        background: var(--screen-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
      }

      .setting-explanation h4 {
        margin: 0 0 12px 0;
        color: var(--accent);
        font-size: 0.95rem;
      }

      .setting-explanation p {
        margin: 0 0 10px 0;
        font-size: 0.85rem;
        line-height: 1.6;
      }

      .setting-explanation ul {
        margin: 10px 0;
        padding-left: 20px;
        font-size: 0.85rem;
        line-height: 1.6;
      }

      .wizard-choice {
        background: white;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
      }

      .choice-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
      }

      .choice-btn {
        padding: 20px;
        border: 2px solid var(--border);
        border-radius: 8px;
        background: var(--card);
        cursor: pointer;
        transition: all 0.3s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        font-weight: 600;
      }

      .choice-btn:hover {
        border-color: var(--accent);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .choice-btn span {
        font-size: 2rem;
      }

      .choice-btn small {
        font-size: 0.75rem;
        font-weight: 400;
        color: var(--muted);
      }

      .tip-box {
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 8px;
        padding: 15px;
        font-size: 0.85rem;
        line-height: 1.5;
      }

      .completion-summary {
        background: var(--screen-bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 25px;
        margin-bottom: 20px;
      }

      .completion-summary h4 {
        margin: 0 0 15px 0;
        color: var(--accent);
      }

      .completion-summary ul {
        font-size: 0.9rem;
        line-height: 1.8;
      }

      button.success {
        background: #10b981 !important;
      }

      @media (max-width: 900px) {
        .wizard-layout {
          grid-template-columns: 1fr;
        }

        .wizard-ai-assistant {
          display: none;
        }

        .wizard-mode-selection,
        .theme-selection,
        .choice-buttons {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `;

  document.head.insertAdjacentHTML('beforeend', styles);
}

// Event delegation for dynamic content
document.addEventListener('click', (e) => {
  // Mode selection
  if (e.target.closest('.mode-select-btn')) {
    const btn = e.target.closest('.mode-select-btn');
    const mode = btn.dataset.mode;
    wizardMode = mode;

    document.querySelectorAll('.mode-card').forEach(card => card.classList.remove('selected'));
    btn.closest('.mode-card').classList.add('selected');
  }

  // Theme selection
  if (e.target.closest('.theme-option')) {
    const option = e.target.closest('.theme-option');
    document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');
  }

  // Choice buttons
  if (e.target.closest('.choice-btn')) {
    const btn = e.target.closest('.choice-btn');
    const choice = btn.dataset.choice;
    const targetId = btn.closest('.wizard-step-content').querySelector('[id$="Choice"]')?.id;

    if (targetId) {
      const statusEl = document.getElementById(targetId);
      if (choice === 'use-defaults') {
        statusEl.textContent = '✓ Using default configuration';
      } else {
        statusEl.textContent = '✓ Will customize in settings later';
      }
    }
  }

  // Finish wizard button
  if (e.target.id === 'finishWizard') {
    finishWizard();
  }
});

export { WIZARD_STEPS };
