/**
 * Bug Report System
 * Collects app state, errors, and context for easy sharing with AI or developers
 */

// Store recent errors for bug reports
const errorLog = [];
const MAX_ERROR_LOG_SIZE = 20;

/**
 * Log an error to the bug report system
 */
export function logError(error, context = {}) {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    message: error?.message || String(error),
    stack: error?.stack || null,
    context,
    url: window.location.href
  };

  errorLog.unshift(errorEntry);
  if (errorLog.length > MAX_ERROR_LOG_SIZE) {
    errorLog.pop();
  }

  console.error("Error logged:", errorEntry);
}

/**
 * Collect comprehensive app state for bug reporting
 */
export function collectBugReportData() {
  const report = {
    meta: {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    },
    browser: {
      language: navigator.language,
      platform: navigator.platform,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      vendor: navigator.vendor
    },
    appState: {
      localStorage: collectLocalStorageData(),
      debugInfo: window.__depotVoiceNotesDebug || null
    },
    errors: errorLog.slice(0, 10), // Last 10 errors
    performance: {
      memory: (performance.memory) ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      } : null,
      timing: performance.timing ? {
        loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
        domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
      } : null
    }
  };

  return report;
}

/**
 * Collect relevant localStorage data (excluding sensitive info)
 */
function collectLocalStorageData() {
  const data = {};
  const sensitiveKeys = ['token', 'password', 'secret', 'key', 'auth'];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // Skip sensitive keys
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        data[key] = '[REDACTED]';
        continue;
      }

      // Skip large values (over 10KB)
      const value = localStorage.getItem(key);
      if (value && value.length > 10000) {
        data[key] = `[TRUNCATED - ${value.length} chars]`;
        continue;
      }

      data[key] = value;
    }
  } catch (err) {
    data._error = `Failed to read localStorage: ${err.message}`;
  }

  return data;
}

/**
 * Format bug report for AI consumption
 */
export function formatBugReportForAI(report, userDescription = "") {
  const sections = [];

  sections.push("# Bug Report");
  sections.push("");
  sections.push(`**Reported:** ${report.meta.timestamp}`);
  sections.push("");

  if (userDescription) {
    sections.push("## User Description");
    sections.push(userDescription);
    sections.push("");
  }

  sections.push("## Environment");
  sections.push(`- **URL:** ${report.meta.url}`);
  sections.push(`- **Browser:** ${report.browser.vendor} ${extractBrowserInfo(report.meta.userAgent)}`);
  sections.push(`- **Platform:** ${report.browser.platform}`);
  sections.push(`- **Language:** ${report.browser.language}`);
  sections.push(`- **Viewport:** ${report.meta.viewport.width}x${report.meta.viewport.height}`);
  sections.push(`- **Online:** ${report.browser.onLine ? 'Yes' : 'No'}`);
  sections.push("");

  if (report.errors && report.errors.length > 0) {
    sections.push("## Recent Errors");
    report.errors.forEach((err, idx) => {
      sections.push(`### Error ${idx + 1}: ${err.timestamp}`);
      sections.push(`**Message:** ${err.message}`);
      if (err.context && Object.keys(err.context).length > 0) {
        sections.push(`**Context:** ${JSON.stringify(err.context, null, 2)}`);
      }
      if (err.stack) {
        sections.push("**Stack:**");
        sections.push("```");
        sections.push(err.stack);
        sections.push("```");
      }
      sections.push("");
    });
  }

  if (report.appState.debugInfo) {
    sections.push("## App Debug Info");
    sections.push("```json");
    sections.push(JSON.stringify(report.appState.debugInfo, null, 2));
    sections.push("```");
    sections.push("");
  }

  sections.push("## localStorage State");
  sections.push("```json");
  sections.push(JSON.stringify(report.appState.localStorage, null, 2));
  sections.push("```");
  sections.push("");

  if (report.performance.memory) {
    sections.push("## Performance");
    sections.push(`- **Memory Used:** ${(report.performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    sections.push(`- **Memory Limit:** ${(report.performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`);
    if (report.performance.timing) {
      sections.push(`- **Load Time:** ${report.performance.timing.loadTime}ms`);
      sections.push(`- **DOM Ready:** ${report.performance.timing.domReady}ms`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Format bug report as JSON
 */
export function formatBugReportAsJSON(report, userDescription = "") {
  return JSON.stringify({
    userDescription,
    ...report
  }, null, 2);
}

/**
 * Extract browser name and version from user agent
 */
function extractBrowserInfo(userAgent) {
  const browsers = [
    { name: 'Chrome', pattern: /Chrome\/(\d+\.\d+)/ },
    { name: 'Firefox', pattern: /Firefox\/(\d+\.\d+)/ },
    { name: 'Safari', pattern: /Version\/(\d+\.\d+).*Safari/ },
    { name: 'Edge', pattern: /Edg\/(\d+\.\d+)/ }
  ];

  for (const browser of browsers) {
    const match = userAgent.match(browser.pattern);
    if (match) {
      return `${browser.name} ${match[1]}`;
    }
  }

  return 'Unknown';
}

/**
 * Copy bug report to clipboard
 */
export async function copyBugReportToClipboard(format = 'markdown', userDescription = "") {
  const report = collectBugReportData();
  const text = format === 'json'
    ? formatBugReportAsJSON(report, userDescription)
    : formatBugReportForAI(report, userDescription);

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("Failed to copy to clipboard:", err);
    return false;
  }
}

/**
 * Download bug report as a file
 */
export function downloadBugReport(format = 'markdown', userDescription = "") {
  const report = collectBugReportData();
  const text = format === 'json'
    ? formatBugReportAsJSON(report, userDescription)
    : formatBugReportForAI(report, userDescription);

  const filename = `depot-bug-report-${Date.now()}.${format === 'json' ? 'json' : 'md'}`;
  const blob = new Blob([text], { type: 'text/plain' });
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
 * Send bug report via mailto: link
 */
async function sendBugReport(userDescription, screenshots) {
  const bugReportData = collectBugReportData();

  // Format the bug report
  const formattedReport = formatBugReportForAI(bugReportData, userDescription);

  // Add note about screenshots if any were selected
  let emailBody = formattedReport;
  if (screenshots && screenshots.length > 0) {
    emailBody += "\n\n---\n\n";
    emailBody += `Note: ${screenshots.length} screenshot(s) were selected but could not be automatically attached.\n`;
    emailBody += "Please attach them manually to this email if needed.\n";
  }

  // Create mailto: link
  const recipient = 'martinbibb@gmail.com';
  const subject = `Bug Report: ${userDescription.substring(0, 50)}${userDescription.length > 50 ? '...' : ''}`;

  // Encode the email body for URL (limit length to avoid issues with very long URLs)
  const maxBodyLength = 8000;
  let bodyForEmail = emailBody;
  if (bodyForEmail.length > maxBodyLength) {
    bodyForEmail = bodyForEmail.substring(0, maxBodyLength) + '\n\n[Report truncated - full details in localStorage]';
  }

  const mailtoLink = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyForEmail)}`;

  // Open the mailto: link
  window.location.href = mailtoLink;

  return { success: true };
}

/**
 * Show simplified bug report modal
 */
export function showBugReportModal() {
  const modal = document.createElement('div');
  modal.id = 'bug-report-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 2rem;
    border-radius: 8px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;

  content.innerHTML = `
    <h2 style="margin-top: 0; color: #667eea;">Report a Bug</h2>
    <p style="color: #64748b; font-size: 0.9rem;">
      Describe the issue you're experiencing. Your email app will open with technical details automatically included to help diagnose the problem.
    </p>

    <div style="margin-bottom: 1rem;">
      <label for="bug-description" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #0f172a;">
        What went wrong?
      </label>
      <textarea id="bug-description"
        placeholder="Example: Recording stops unexpectedly when I pause and resume..."
        style="width: 100%; min-height: 120px; padding: 0.75rem; margin-bottom: 0.5rem; font-family: inherit; resize: vertical; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem;"
      ></textarea>
      <p style="font-size: 0.75rem; color: #64748b; margin: 0;">
        Please include what you were doing, what happened, and what you expected.
      </p>
    </div>

    <div style="margin-bottom: 1.5rem;">
      <label for="screenshot-input" style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #0f172a;">
        Screenshots (optional)
      </label>
      <input type="file" id="screenshot-input" accept="image/*" multiple
        style="width: 100%; padding: 0.5rem; border: 2px dashed #cbd5e1; border-radius: 8px; cursor: pointer; font-size: 0.85rem;"
      />
      <p style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
        Note: Screenshots will need to be attached manually in your email app
      </p>
      <div id="screenshot-preview" style="margin-top: 0.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;"></div>
    </div>

    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
      <button id="close-modal" style="padding: 0.75rem 1.5rem; cursor: pointer; background: #e2e8f0; color: #0f172a; border: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
        Cancel
      </button>
      <button id="send-report" style="padding: 0.75rem 1.5rem; cursor: pointer; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem;">
        Open Email App
      </button>
    </div>

    <div id="status-message" style="margin-top: 1rem; padding: 0.75rem; border-radius: 8px; display: none; font-size: 0.85rem;"></div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const descriptionEl = document.getElementById('bug-description');
  const screenshotInput = document.getElementById('screenshot-input');
  const screenshotPreview = document.getElementById('screenshot-preview');
  const sendButton = document.getElementById('send-report');
  const statusEl = document.getElementById('status-message');

  let screenshots = [];

  // Handle screenshot selection
  screenshotInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    screenshots = [];
    screenshotPreview.innerHTML = '';

    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataURL(file);
        screenshots.push({
          filename: file.name,
          type: file.type,
          data: dataUrl
        });

        // Show preview
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 2px solid #e2e8f0;';
        screenshotPreview.appendChild(img);
      } catch (err) {
        console.error("Failed to read file:", file.name, err);
      }
    }
  });

  // Send report
  sendButton.addEventListener('click', async () => {
    const description = descriptionEl.value.trim();

    if (!description) {
      showStatus('Please describe the issue before opening your email app.', 'error');
      return;
    }

    sendButton.disabled = true;
    sendButton.textContent = 'Opening...';

    try {
      await sendBugReport(description, screenshots);
      showStatus('Email app opened! Please send the email to complete your bug report.', 'success');

      // Close modal after 3 seconds
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 3000);
    } catch (err) {
      showStatus(`Failed to open email app: ${err.message}`, 'error');
      sendButton.disabled = false;
      sendButton.textContent = 'Open Email App';
    }
  });

  // Close
  document.getElementById('close-modal').addEventListener('click', () => {
    document.body.removeChild(modal);
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.style.background = type === 'success' ? '#d1fae5' : '#fee2e2';
    statusEl.style.color = type === 'success' ? '#065f46' : '#991b1b';
    statusEl.style.borderLeft = `4px solid ${type === 'success' ? '#10b981' : '#ef4444'}`;
  }
}

/**
 * Read file as data URL
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
