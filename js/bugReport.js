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
 * Show bug report modal
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
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;

  content.innerHTML = `
    <h2 style="margin-top: 0;">Report a Bug</h2>
    <p>Describe the issue you're experiencing. Your report will include app state and error logs to help diagnose the problem.</p>

    <textarea id="bug-description"
      placeholder="Describe what happened, what you expected, and steps to reproduce..."
      style="width: 100%; min-height: 150px; padding: 0.5rem; margin-bottom: 1rem; font-family: inherit; resize: vertical;"
    ></textarea>

    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
      <button id="copy-markdown" style="padding: 0.5rem 1rem; cursor: pointer; background: #007bff; color: white; border: none; border-radius: 4px;">
        Copy as Markdown
      </button>
      <button id="copy-json" style="padding: 0.5rem 1rem; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 4px;">
        Copy as JSON
      </button>
      <button id="download-report" style="padding: 0.5rem 1rem; cursor: pointer; background: #6c757d; color: white; border: none; border-radius: 4px;">
        Download Report
      </button>
      <button id="close-modal" style="padding: 0.5rem 1rem; cursor: pointer; background: #dc3545; color: white; border: none; border-radius: 4px; margin-left: auto;">
        Close
      </button>
    </div>

    <div id="copy-status" style="color: green; font-weight: bold;"></div>

    <details style="margin-top: 1rem;">
      <summary style="cursor: pointer; font-weight: bold;">Preview Report</summary>
      <pre id="report-preview" style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; max-height: 300px; overflow-y: auto;"></pre>
    </details>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const descriptionEl = document.getElementById('bug-description');
  const statusEl = document.getElementById('copy-status');
  const previewEl = document.getElementById('report-preview');

  // Update preview when description changes
  descriptionEl.addEventListener('input', () => {
    const report = collectBugReportData();
    previewEl.textContent = formatBugReportForAI(report, descriptionEl.value);
  });

  // Initial preview
  const initialReport = collectBugReportData();
  previewEl.textContent = formatBugReportForAI(initialReport, '');

  // Copy markdown
  document.getElementById('copy-markdown').addEventListener('click', async () => {
    const success = await copyBugReportToClipboard('markdown', descriptionEl.value);
    if (success) {
      statusEl.textContent = 'Copied to clipboard as Markdown!';
      setTimeout(() => statusEl.textContent = '', 3000);
    } else {
      statusEl.textContent = 'Failed to copy. Please try downloading instead.';
      statusEl.style.color = 'red';
    }
  });

  // Copy JSON
  document.getElementById('copy-json').addEventListener('click', async () => {
    const success = await copyBugReportToClipboard('json', descriptionEl.value);
    if (success) {
      statusEl.textContent = 'Copied to clipboard as JSON!';
      setTimeout(() => statusEl.textContent = '', 3000);
    } else {
      statusEl.textContent = 'Failed to copy. Please try downloading instead.';
      statusEl.style.color = 'red';
    }
  });

  // Download
  document.getElementById('download-report').addEventListener('click', () => {
    downloadBugReport('markdown', descriptionEl.value);
    statusEl.textContent = 'Report downloaded!';
    setTimeout(() => statusEl.textContent = '', 3000);
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
}
