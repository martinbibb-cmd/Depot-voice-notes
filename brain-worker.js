import {
  handleRegister,
  handleLogin,
  handleSaveSettings,
  handleLoadSettings,
  handleGetProfile,
  handleRequestReset,
  handleResetPassword
} from './auth-handlers.js';
import {
  handleSaveSession,
  handleLoadSession,
  handleDeleteSession
} from './session-handlers.js';

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // CORS / preflight
      if (request.method === "OPTIONS") {
        return handleOptions();
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({
          status: "ok",
          timestamp: new Date().toISOString(),
          version: "1.0.0"
        }, 200);
      }

      // Detailed auth system health check
      if (request.method === "GET" && url.pathname === "/auth/health") {
        const health = {
          status: "ok",
          timestamp: new Date().toISOString(),
          database: {
            connected: false,
            tables: []
          },
          jwt: {
            configured: false
          }
        };

        try {
          // Check database connection
          if (env.DB) {
            health.database.connected = true;

            // Check if auth tables exist
            try {
              const tables = await env.DB.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table'
                AND name IN ('users', 'user_settings', 'password_reset_tokens')
                ORDER BY name
              `).all();

              health.database.tables = tables.results.map(t => t.name);
              health.database.tablesExist = health.database.tables.length === 3;
            } catch (err) {
              health.database.error = "Failed to query tables";
            }
          }

          // Check JWT secret
          if (env.JWT_SECRET) {
            health.jwt.configured = true;
          }

          // Set overall status
          if (!health.database.connected || !health.jwt.configured) {
            health.status = "degraded";
          }

        } catch (err) {
          health.status = "error";
          health.error = err.message;
        }

        return jsonResponse(health, 200);
      }

      // Authentication endpoints
      if (request.method === "POST" && url.pathname === "/auth/register") {
        return handleRegister(request, env);
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        return handleLogin(request, env);
      }

      if (request.method === "POST" && url.pathname === "/auth/request-reset") {
        return handleRequestReset(request, env);
      }

      if (request.method === "POST" && url.pathname === "/auth/reset-password") {
        return handleResetPassword(request, env);
      }

      if (request.method === "GET" && url.pathname === "/auth/profile") {
        return handleGetProfile(request, env);
      }

      // Settings sync endpoints
      if (request.method === "POST" && url.pathname === "/settings/sync") {
        return handleSaveSettings(request, env);
      }

      if (request.method === "GET" && url.pathname === "/settings/sync") {
        return handleLoadSettings(request, env);
      }

      // Cloud session endpoints
      if (request.method === "POST" && url.pathname === "/cloud-session") {
        return handleSaveSession(request, env);
      }

      if (request.method === "GET" && url.pathname === "/cloud-session") {
        return handleLoadSession(request, env);
      }

      if (request.method === "DELETE" && url.pathname === "/cloud-session") {
        return handleDeleteSession(request, env);
      }

      // Existing endpoints
      if (request.method === "POST" && url.pathname === "/text") {
        return handleText(request, env);
      }

      if (request.method === "POST" && url.pathname === "/audio") {
        return handleAudio(request, env);
      }

      if (request.method === "POST" && url.pathname === "/bug-report") {
        return handleBugReport(request, env);
      }

      if (request.method === "POST" && url.pathname === "/tweak-section") {
        return handleTweakSection(request, env);
      }

      if (request.method === "POST" && url.pathname === "/agent-chat") {
        return handleAgentChat(request, env);
      }

      if (request.method === "POST" && url.pathname === "/query") {
        return handleQuery(request, env);
      }

      if (request.method === "POST" && url.pathname === "/generate-presentation") {
        return handleGeneratePresentation(request, env);
      }

      if (request.method === "POST" && url.pathname === "/tools/auto-fill-session") {
        return handleAutoFillSession(request, env);
      }

      return jsonResponse({ error: "not_found" }, 404);
    } catch (err) {
      console.error("Worker fatal error:", err);
      return jsonResponse({ error: "model_error", message: String(err) }, 500);
    }
  }
};

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
    ...extra
  };
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders()
  });
}

/* ---------- /tools/auto-fill-session ---------- */

async function handleAutoFillSession(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const transcript = typeof payload.transcript === "string"
    ? payload.transcript.trim()
    : "";

  if (!transcript) {
    return jsonResponse(
      { error: "bad_request", message: "transcript required" },
      400
    );
  }

  const session = payload.session && typeof payload.session === "object" && !Array.isArray(payload.session)
    ? payload.session
    : {};

  const tool = typeof payload.tool === "string" && payload.tool.trim()
    ? payload.tool.trim()
    : "auto_fill_depot_session";

  const schema = typeof payload.schema === "string" && payload.schema.trim()
    ? payload.schema.trim()
    : "DepotSurveySession";

  try {
    const result = await autoFillSessionWithAI(env, {
      transcript,
      session,
      tool,
      schema
    });
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleAutoFillSession error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
      500
    );
  }
}

/* ---------- /text ---------- */

async function handleText(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const transcript = typeof payload.transcript === "string"
    ? payload.transcript.trim()
    : "";

  const { sanitisedTranscript, sanityNotes } = applyTranscriptionSanityChecks(transcript);

  if (!transcript) {
    return jsonResponse(
      { error: "bad_request", message: "transcript required" },
      400
    );
  }

  const checklistItems = Array.isArray(payload.checklistItems)
    ? payload.checklistItems
    : [];

  const depotNotesInstructions = typeof payload.depotNotesInstructions === "string"
    ? payload.depotNotesInstructions
    : "";

  const alreadyCaptured = normaliseCapturedSections(payload.alreadyCaptured);
  const expectedSections = normaliseExpectedSections(payload.expectedSections);
  const sectionHints = normaliseSectionHints(payload.sectionHints);
  const forceStructured = Boolean(payload.forceStructured);

  try {
    const result = await callNotesModel(env, {
      transcript: sanitisedTranscript,
      checklistItems,
      depotSections: payload.depotSections,
      alreadyCaptured,
      expectedSections,
      sectionHints,
      forceStructured,
      sanityNotes,
      customInstructions: depotNotesInstructions
    });
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleText model error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
      500
    );
  }
}

/* ---------- /audio ---------- */

async function handleAudio(request, env) {
  const contentType = request.headers.get("Content-Type") || "";

  if (!contentType.startsWith("audio/") && !contentType.startsWith("application/octet-stream")) {
    return jsonResponse(
      { error: "bad_request", message: "audio content-type required" },
      400
    );
  }

  const audioData = await request.arrayBuffer();

  try {
    const transcript = await transcribeAudio(env, audioData, contentType);
    const { sanitisedTranscript, sanityNotes } = applyTranscriptionSanityChecks(transcript);
    const result = await callNotesModel(env, {
      transcript: sanitisedTranscript,
      checklistItems: [],
      depotSections: [],
      alreadyCaptured: [],
      expectedSections: [],
      sectionHints: {},
      forceStructured: true,
      sanityNotes
    });
    return jsonResponse(
      {
        ...result,
        transcript: sanitisedTranscript,
        fullTranscript: transcript,
        sanityNotes
      },
      200
    );
  } catch (err) {
    console.error("handleAudio error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
      500
    );
  }
}

/* ---------- /bug-report ---------- */

async function handleBugReport(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const { userDescription, bugReportData, screenshots = [] } = payload;

  if (!userDescription || typeof userDescription !== "string") {
    return jsonResponse(
      { error: "bad_request", message: "userDescription required" },
      400
    );
  }

  try {
    // Send email via Mailchannels
    await sendBugReportEmail(userDescription, bugReportData, screenshots);
    return jsonResponse({ success: true, message: "Bug report sent successfully" }, 200);
  } catch (err) {
    console.error("handleBugReport error:", err);
    return jsonResponse(
      { error: "email_error", message: String(err) },
      500
    );
  }
}

async function sendBugReportEmail(userDescription, bugReportData, screenshots) {
  // Format the bug report data as HTML
  const htmlBody = formatBugReportHTML(userDescription, bugReportData);

  // Prepare attachments from screenshots
  const attachments = screenshots.map((screenshot, index) => ({
    filename: screenshot.filename || `screenshot-${index + 1}.png`,
    content: screenshot.data.split(',')[1], // Remove data URL prefix
    type: screenshot.type || 'image/png',
    disposition: 'attachment'
  }));

  const emailPayload = {
    personalizations: [
      {
        to: [{ email: "martinbibb@gmail.com", name: "Martin Bibb" }],
      },
    ],
    from: {
      email: "bugreport@depot-voice-notes.com",
      name: "Depot Voice Notes Bug Reporter",
    },
    subject: `Bug Report: ${userDescription.substring(0, 50)}${userDescription.length > 50 ? '...' : ''}`,
    content: [
      {
        type: "text/html",
        value: htmlBody,
      },
    ],
  };

  // Add attachments if present
  if (attachments.length > 0) {
    emailPayload.attachments = attachments;
  }

  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mailchannels error ${response.status}: ${errorText}`);
  }
}

function formatBugReportHTML(userDescription, data) {
  const report = data || {};

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #667eea; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
    h2 { color: #764ba2; margin-top: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; }
    h3 { color: #5a67d8; margin-top: 20px; }
    .section { background: #f8fafc; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .meta { background: #ecfdf5; padding: 10px; border-left: 4px solid #10b981; margin: 10px 0; }
    .error { background: #fee2e2; padding: 10px; border-left: 4px solid #ef4444; margin: 10px 0; }
    pre { background: #0f172a; color: #e2e8f0; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    th { background: #f1f5f9; font-weight: bold; }
    .user-description { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; font-size: 16px; }
  </style>
</head>
<body>
  <h1>🐛 Bug Report - Depot Voice Notes</h1>

  <div class="user-description">
    <h2>User Description</h2>
    <p><strong>${escapeHtml(userDescription)}</strong></p>
  </div>

  <div class="meta">
    <h2>📋 Environment Information</h2>
    <table>
      <tr><th>Timestamp</th><td>${report.meta?.timestamp || 'N/A'}</td></tr>
      <tr><th>URL</th><td>${escapeHtml(report.meta?.url || 'N/A')}</td></tr>
      <tr><th>User Agent</th><td>${escapeHtml(report.meta?.userAgent || 'N/A')}</td></tr>
      <tr><th>Browser</th><td>${escapeHtml(report.browser?.vendor || 'N/A')}</td></tr>
      <tr><th>Platform</th><td>${escapeHtml(report.browser?.platform || 'N/A')}</td></tr>
      <tr><th>Language</th><td>${report.browser?.language || 'N/A'}</td></tr>
      <tr><th>Viewport</th><td>${report.meta?.viewport?.width || 'N/A'}x${report.meta?.viewport?.height || 'N/A'}</td></tr>
      <tr><th>Online Status</th><td>${report.browser?.onLine ? 'Online ✅' : 'Offline ❌'}</td></tr>
      <tr><th>Cookies Enabled</th><td>${report.browser?.cookiesEnabled ? 'Yes ✅' : 'No ❌'}</td></tr>
    </table>
  </div>

  ${formatErrorsSection(report.errors)}
  ${formatAppStateSection(report.appState)}
  ${formatPerformanceSection(report.performance)}

  <div class="section">
    <h2>📄 Full Report JSON</h2>
    <pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
  </div>
</body>
</html>
  `;
}

function formatErrorsSection(errors) {
  if (!errors || !Array.isArray(errors) || errors.length === 0) {
    return '<div class="section"><h2>✅ Recent Errors</h2><p>No errors logged.</p></div>';
  }

  let html = '<div class="error"><h2>⚠️ Recent Errors</h2>';
  errors.forEach((err, idx) => {
    html += `
      <h3>Error ${idx + 1}: ${escapeHtml(err.timestamp || 'N/A')}</h3>
      <p><strong>Message:</strong> ${escapeHtml(err.message || 'N/A')}</p>
      ${err.context && Object.keys(err.context).length > 0 ? `<p><strong>Context:</strong> <pre>${escapeHtml(JSON.stringify(err.context, null, 2))}</pre></p>` : ''}
      ${err.stack ? `<p><strong>Stack:</strong><pre>${escapeHtml(err.stack)}</pre></p>` : ''}
    `;
  });
  html += '</div>';
  return html;
}

function formatAppStateSection(appState) {
  if (!appState) {
    return '<div class="section"><h2>💾 App State</h2><p>No app state data.</p></div>';
  }

  let html = '<div class="section"><h2>💾 App State</h2>';

  if (appState.debugInfo) {
    html += `<h3>Debug Info</h3><pre>${escapeHtml(JSON.stringify(appState.debugInfo, null, 2))}</pre>`;
  }

  if (appState.localStorage) {
    html += `<h3>LocalStorage</h3><pre>${escapeHtml(JSON.stringify(appState.localStorage, null, 2))}</pre>`;
  }

  html += '</div>';
  return html;
}

function formatPerformanceSection(performance) {
  if (!performance) {
    return '<div class="section"><h2>⚡ Performance</h2><p>No performance data.</p></div>';
  }

  let html = '<div class="section"><h2>⚡ Performance</h2><table>';

  if (performance.memory) {
    html += `
      <tr><th>JS Heap Used</th><td>${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB</td></tr>
      <tr><th>JS Heap Total</th><td>${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB</td></tr>
      <tr><th>JS Heap Limit</th><td>${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB</td></tr>
    `;
  }

  if (performance.timing) {
    html += `
      <tr><th>Load Time</th><td>${performance.timing.loadTime}ms</td></tr>
      <tr><th>DOM Ready</th><td>${performance.timing.domReady}ms</td></tr>
    `;
  }

  html += '</table></div>';
  return html;
}

function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- /tweak-section ---------- */

async function handleTweakSection(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const { section, instructions } = payload;

  if (!section || typeof section !== "object") {
    return jsonResponse(
      { error: "bad_request", message: "section object required" },
      400
    );
  }

  if (!instructions || typeof instructions !== "string" || !instructions.trim()) {
    return jsonResponse(
      { error: "bad_request", message: "instructions string required" },
      400
    );
  }

  const sectionName = section.section || section.name || "";
  const plainText = section.plainText || "";
  const naturalLanguage = section.naturalLanguage || "";

  if (!sectionName) {
    return jsonResponse(
      { error: "bad_request", message: "section must have a name" },
      400
    );
  }

  try {
    const improved = await tweakSectionWithAI(env, {
      sectionName,
      plainText,
      naturalLanguage,
      instructions: instructions.trim()
    });
    return jsonResponse(improved, 200);
  } catch (err) {
    console.error("handleTweakSection error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
      500
    );
  }
}

/* ---------- /agent-chat ---------- */

async function handleAgentChat(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const { message, context } = payload;

  if (!message || typeof message !== "string" || !message.trim()) {
    return jsonResponse(
      { error: "bad_request", message: "message string required" },
      400
    );
  }

  try {
    const { sanitisedTranscript, sanityNotes } = applyTranscriptionSanityChecks(context?.transcript || "");
    const response = await agentChatWithAI(env, {
      message: message.trim(),
      context: {
        ...context,
        transcript: sanitisedTranscript,
        sanityNotes: Array.isArray(sanityNotes) ? sanityNotes : []
      }
    });
    return jsonResponse({ response }, 200);
  } catch (err) {
    console.error("handleAgentChat error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
      500
    );
  }
}

async function agentChatWithAI(env, payload) {
  const openaiKey = env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    throw new Error("Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be configured");
  }

  const { message, context, customInstructions } = payload;

  // Fetch reference materials from database
  const referenceMaterials = await fetchReferenceMaterials(env, context.transcript || '');

  // Use custom instructions if provided, otherwise use default
  const defaultSystemPrompt = `You are an AI assistant helping with heating survey work for a British Gas style boiler installation surveyor.

You have access to:
- The current survey sections and notes
- The transcript of conversations
- Reference materials from the knowledge database

Your job is to:
1. Answer questions about the survey, products, pricing, or technical details
2. Provide helpful suggestions based on the context
3. Help fill in missing information
4. Be concise but accurate

SANITY CHECKING:
- Actively correct obvious transcription mistakes using the context provided (e.g., if a pipe size looks wrong, normalise it to the nearest standard size).
- Standard pipework sizes are 8/10mm (microbore), 15mm, 22mm, 28mm, and 35mm—prefer these when resolving ambiguities.
- Prefer the most recent reference material versions (e.g., the latest pricebook such as November 2025) when multiple versions exist.

IMPORTANT:
- Use the reference materials to provide accurate product specifications and pricing
- If you don't know something, say so
- Keep responses brief and actionable
- Focus on helping complete the survey accurately`;

  let systemPrompt = customInstructions || defaultSystemPrompt;

  // Inject reference materials if available
  if (referenceMaterials) {
    const insertPoint = systemPrompt.indexOf('Your job is to:');
    if (insertPoint > 0) {
      systemPrompt = systemPrompt.slice(0, insertPoint) + `\n${referenceMaterials}\n\n` + systemPrompt.slice(insertPoint);
    } else {
      systemPrompt = systemPrompt + `\n\n${referenceMaterials}`;
    }
  }

  systemPrompt = systemPrompt.trim();

  const userContent = JSON.stringify({
    message,
    currentSections: context.sections || [],
    transcript: context.transcript || '',
    detectedInfo: context.detectedInfo || {},
    sanityNotes: context.sanityNotes || []
  });

  // Try OpenAI first, fall back to Anthropic if it fails
  let response;
  let lastError;

  if (openaiKey) {
    try {
      console.log("Attempting to call OpenAI for agent chat...");
      const body = {
        model: "gpt-4.1",
        temperature: 0.5,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ]
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const rawText = await res.text();

      if (!res.ok) {
        throw new Error(`OpenAI chat.completions ${res.status}: ${rawText}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        throw new Error(`OpenAI returned non-JSON response: ${String(err)} :: ${rawText}`);
      }

      const content = parsed?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("No content from OpenAI model");
      }

      response = content.trim();
      console.log("OpenAI call successful");
    } catch (err) {
      console.error("OpenAI call failed:", String(err));
      lastError = err;
      response = null;
    }
  }

  // Fall back to Anthropic if OpenAI failed or wasn't available
  if (!response && anthropicKey) {
    try {
      console.log("Falling back to Anthropic for agent chat...");
      response = await callAnthropicChat(
        anthropicKey,
        systemPrompt,
        userContent,
        0.5
      );
      console.log("Anthropic call successful");
    } catch (err) {
      console.error("Anthropic call failed:", String(err));
      lastError = err;
      response = null;
    }
  }

  if (!response) {
    throw new Error(`All AI providers failed. Last error: ${String(lastError)}`);
  }

  return response;
}

async function tweakSectionWithAI(env, payload) {
  const openaiKey = env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    throw new Error("Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be configured");
  }

  const { sectionName, plainText, naturalLanguage, instructions, customInstructions } = payload;

  // Use custom instructions if provided, otherwise use default
  const defaultSystemPrompt = `You are an expert heating survey assistant helping to improve survey notes.

You will receive:
- A section name (e.g., "Needs", "New boiler and controls")
- Current plainText (bullet-point style, semicolon-separated)
- Current naturalLanguage (prose description)
- User instructions on how to improve the section

Your job is to:
1. Read the current section content carefully
2. Apply the user's improvement instructions
3. Return an improved version of the section that maintains the same format

IMPORTANT RULES:
- Keep the same section name
- Maintain the plainText format (semicolon-separated bullet points)
- Maintain the naturalLanguage format (clear prose)
- Apply the user's instructions precisely
- Only modify what the user asks to improve
- Keep the technical accuracy and detail level
- Do not add information that wasn't requested
- Correct any obvious transcription errors using the context provided, especially standard pipe sizes (8/10mm, 15mm, 22mm, 28mm, 35mm) and other common measurements. Normalise improbable values to the nearest sensible standard size.

You MUST respond with ONLY valid JSON matching this shape:

{
  "section": "${sectionName}",
  "plainText": "Improved bullet points; separated by semicolons;",
  "naturalLanguage": "Improved prose description."
}

Do not wrap the JSON in backticks or markdown.
Do not include any explanation outside the JSON.`;

  const systemPrompt = (customInstructions || defaultSystemPrompt).trim();

  const userPayload = {
    sectionName,
    currentPlainText: plainText,
    currentNaturalLanguage: naturalLanguage,
    instructions
  };

  // Try OpenAI first, fall back to Anthropic if it fails
  let trimmedContent;
  let lastError;

  if (openaiKey) {
    try {
      console.log("Attempting to call OpenAI for section tweak...");
      const body = {
        model: "gpt-4.1",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const rawText = await res.text();

      if (!res.ok) {
        throw new Error(`OpenAI chat.completions ${res.status}: ${rawText}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        throw new Error(`OpenAI returned non-JSON response: ${String(err)} :: ${rawText}`);
      }

      const content = parsed?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("No content from OpenAI model");
      }

      trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error("OpenAI model content was empty");
      }

      console.log("OpenAI call successful");
    } catch (err) {
      console.error("OpenAI call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  // Fall back to Anthropic if OpenAI failed or wasn't available
  if (!trimmedContent && anthropicKey) {
    try {
      console.log("Falling back to Anthropic for section tweak...");
      trimmedContent = await callAnthropicChat(
        anthropicKey,
        systemPrompt,
        JSON.stringify(userPayload),
        0.3
      );
      console.log("Anthropic call successful");
    } catch (err) {
      console.error("Anthropic call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  if (!trimmedContent) {
    throw new Error(`All AI providers failed. Last error: ${String(lastError)}`);
  }

  let jsonOut;
  try {
    jsonOut = JSON.parse(trimmedContent);
  } catch (err) {
    throw new Error(`Model content was not valid JSON: ${String(err)} :: ${content}`);
  }

  // Safety defaults
  if (typeof jsonOut.section !== "string" || !jsonOut.section.trim()) {
    jsonOut.section = sectionName;
  }
  if (typeof jsonOut.plainText !== "string") {
    jsonOut.plainText = plainText;
  }
  if (typeof jsonOut.naturalLanguage !== "string") {
    jsonOut.naturalLanguage = naturalLanguage;
  }

  return {
    section: jsonOut.section,
    plainText: jsonOut.plainText,
    naturalLanguage: jsonOut.naturalLanguage
  };
}

/**
 * Extract structured DepotSurveySession data from a voice transcript.
 *
 * Uses AI to parse a raw heating survey transcript and populate session fields
 * with high confidence, while identifying questions that need on-site confirmation.
 *
 * @param {object} env - Worker environment with OPENAI_API_KEY or ANTHROPIC_API_KEY
 * @param {object} payload - Contains transcript, session, tool, schema
 * @returns {Promise<{sessionPatch: object, missingInfo: Array}>}
 *   - sessionPatch: Partial DepotSurveySession with extracted fields
 *   - missingInfo: Array of {target: "expert"|"customer", question: string}
 */
async function autoFillSessionWithAI(env, payload) {
  const openaiKey = env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    throw new Error("Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be configured");
  }

  const { transcript, session, tool, schema } = payload;

  const systemPrompt = `You are an expert British Gas heating-survey assistant.

You receive:
- A raw voice transcript from a home heating survey.
- An existing DepotSurveySession JSON object (may be partially filled).

Your goals:

1. Extract as much **reliable structured information** as possible from the
   transcript and place it into a PARTIAL DepotSurveySession object called
   "sessionPatch".
   - Only include fields you can fill with HIGH confidence.
   - Do NOT invent values.
   - If a value is ambiguous, leave it undefined.

2. Do NOT overwrite values that are already clearly set in currentSession
   unless the transcript explicitly corrects them.
   - Example: if currentSession.vulnerability.hsaInstallRating is "urgent"
     and the transcript confirms that, you don't need to repeat it.
   - If the transcript contradicts a value, prefer the transcript and note
     the discrepancy as a missingInfo question.

3. Identify any **missing but important information** that the adviser should
   confirm on site, and return them as "missingInfo" questions.
   - Each question should specify target: "expert" (adviser/engineer) or
     "customer".
   - Focus on safety, feasibility, and anything that would prevent you from
     booking the job or planning materials correctly.

4. Use the following enum values EXACTLY as written when filling fields:
   - YesNoNone: "yes" | "no" | "none"
   - Urgency: "asap" | "soon" | "flexible" | "unknown"
   - SystemType: "conventional" | "system" | "combi" | "back_boiler" | "unknown"
   - JobType: "boiler_replacement" | "full_system" | "conversion" | "new_install" | "unknown"
   - HomecareStatus: "none" | "boiler_warranty" | "multiprem_homecare" | "unknown"
   - FuelType: "natural_gas" | "lpg" | "oil" | "electric" | "unknown"
   - HSAInstallationRating: "normal" | "urgent"
   - PriorityInstallationRating: "none" | "standard" | "urgent"
   - EarthSystemType: "TT" | "TN" | "TN-S" | "TN-C-S" | "unknown"
   - PowerflushStatus: "required" | "not_required" | "recommended"
   - MagneticFilterType: "22mm" | "28mm" | "none"
   - BathroomZone: "outside" | "zone_1" | "zone_2" | "zone_3"
   - CondensateRoute: "internal_drain" | "external_soakaway" | "pumped" | "other"

5. High-level mapping hints (CloudSense-aligned):

   SECTION 1 - Customer Status & Vulnerability:
   - "Boiler not working", "no heating" -> vulnerability.boilerWorking = "no", hsaInstallationRating = "urgent"
   - "No hot water" -> vulnerability.hotWaterAvailable = "no"
   - "Over 75", "elderly", "disabled" -> vulnerability.vulnerabilityReason = "75 and over" | "Disability"
   - "Boiler breakdown", "failed boiler" -> vulnerability.reasonForQuotation = "Boiler failure"
   - Safety concerns -> vulnerability.safetyIssuesAtProperty = "yes", vulnerability.safetyIssuesNotes

   SECTION 2 - Existing System:
   - "conventional / regular" boiler -> existingSystem.existingSystemType = "conventional"
   - "system boiler with cylinder" -> existingSystem.existingSystemType = "system"
   - "combi" -> existingSystem.existingSystemType = "combi"
   - "like-for-like swap" -> existingSystem.jobTypeRequired = "boiler_replacement"
   - "full system upgrade" -> existingSystem.jobTypeRequired = "full_system"
   - "homecare customer" -> existingSystem.homecareStatus = "multiprem_homecare"

   SECTION 3 - Electrical:
   - "TT system", "TN-S earth" -> electrical.earthSystemType
   - "RCD fitted", "consumer unit has RCD" -> electrical.rcdPresent = "yes"
   - "Socket test passed", "<1 ohm" -> electrical.socketAndSeeReading = "<1 ohm"

   SECTION 4 - Working at Height:
   - "Scaffolding needed", "tower required" -> workingAtHeight.safeAccessAtHeightRequired = "yes"
   - "Loft access difficult" -> workingAtHeight.restrictionsToWorkAreas

   SECTION 5 - Asbestos:
   - "Artex ceiling", "suspect asbestos" -> asbestos.anyArtexOrSuspectAsbestos = "yes"
   - "No asbestos", "clear" -> asbestos.anyArtexOrSuspectAsbestos = "no"

   SECTION 6 - Water System:
   - "Mains pressure 2.5 bar" -> waterSystem.pressure = 2.5
   - "Flow rate 15 litres per minute" -> waterSystem.flowRate = 15

   SECTION 7 - Boiler Job:
   - "A2 Conv-Conv", "same room same location" -> boilerJob.systemTypeA, boilerJob.locationTypeB
   - Natural gas / LPG -> boilerJob.fuelType
   - "Kitchen install", "loft location" -> boilerJob.installationLocation

   SECTION 8 - Cleansing & Controls:
   - "Powerflush needed" -> cleansing.powerflushRequired = "required"
   - "Mag filter 22mm" -> cleansing.magneticFilterType = "22mm"
   - "Hive installed" -> cleansing.smartStatAlreadyInstalled = "yes"
   - "Internal condensate" -> cleansing.condensateRoute = "internal_drain"

   SECTION 9 - Heat Loss:
   - "Total heat loss 18kW" -> heatLoss.totalHeatLossKw = 18
   - "Detached house" -> heatLoss.propertyType = "Detached"

   SECTION 10 - Installer Notes (map voice notes to specific fields):
   - Delivery instructions -> installerNotes.deliveryLocation, installerNotes.additionalDeliveryNotes
   - Boiler/controls work -> installerNotes.boilerControlsNotes
   - Flue work details -> installerNotes.flueNotes
   - Gas/water work -> installerNotes.gasWaterNotes
   - Making good / decoration -> installerNotes.disruptionNotes
   - Customer to clear cupboard -> installerNotes.customerAgreedActions
   - Future plans / extensions -> installerNotes.specialRequirements

6. Use installer-focused paragraphs from the transcript to populate the
   installerNotes fields. For example, any clear instructions about:
   - Boiler & controls work -> installerNotes.boilerControlsNotes
   - Flue work -> installerNotes.flueNotes
   - Gas / water pipework -> installerNotes.gasWaterNotes
   - Disruption / making good / decoration -> installerNotes.disruptionNotes
   - Customer agreed actions -> installerNotes.customerAgreedActions
   - Special future plans -> installerNotes.specialRequirements

7. Use any clear summary of what will be installed to improve:
   - sections[] items such as "New boiler and controls"
   - ai.customerSummary (short friendly paragraph)

You are NOT pricing the job and NOT selecting SKUs. You are ONLY:
- extracting structured survey fields, and
- capturing unanswered questions.

Return ONLY valid JSON matching this shape (no markdown, no extra text):
{
  "sessionPatch": { ...partial DepotSurveySession fields you are confident about... },
  "missingInfo": [
    { "target": "expert" | "customer", "question": "What needs to be confirmed?" }
  ]
}

Rules:
- Only set fields you can infer with high confidence from the transcript.
- Keep existing user-entered values unless they clearly conflict with the transcript; do not blank out data.
- Prefer concise strings and arrays; avoid invented numbers or boiler models.
- If unsure about a value, leave it out of sessionPatch and add a missingInfo entry instead.
- When adding arrays (e.g., materials, allowances), include only items mentioned in the transcript.
- Preserve units and common pipe sizes (8mm/10mm/15mm/22mm/28mm/35mm) when present.`;

  const userPayload = {
    tool: tool || "auto_fill_depot_session",
    schema: schema || "DepotSurveySession",
    transcript,
    currentSession: session || {}
  };

  let trimmedContent;
  let lastError;

  if (openaiKey) {
    try {
      console.log("Attempting to call OpenAI for auto-fill...");
      const body = {
        model: "gpt-4.1",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const rawText = await res.text();

      if (!res.ok) {
        throw new Error(`OpenAI chat.completions ${res.status}: ${rawText}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        throw new Error(`OpenAI returned non-JSON response: ${String(err)} :: ${rawText}`);
      }

      const content = parsed?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("No content from OpenAI model");
      }

      trimmedContent = content.trim();
      console.log("OpenAI call successful");
    } catch (err) {
      console.error("OpenAI call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  if (!trimmedContent && anthropicKey) {
    try {
      console.log("Falling back to Anthropic for auto-fill...");
      trimmedContent = await callAnthropicChat(
        anthropicKey,
        systemPrompt,
        JSON.stringify(userPayload),
        0.2
      );
      console.log("Anthropic call successful");
    } catch (err) {
      console.error("Anthropic call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  if (!trimmedContent) {
    throw new Error(`All AI providers failed. Last error: ${String(lastError)}`);
  }

  let jsonOut;
  try {
    jsonOut = JSON.parse(trimmedContent);
  } catch (err) {
    throw new Error(`Model content was not valid JSON: ${String(err)} :: ${trimmedContent}`);
  }

  const sessionPatch = jsonOut && typeof jsonOut.sessionPatch === "object" && !Array.isArray(jsonOut.sessionPatch)
    ? jsonOut.sessionPatch
    : {};
  const missingInfo = Array.isArray(jsonOut?.missingInfo)
    ? jsonOut.missingInfo.filter((item) => item && typeof item === "object")
    : [];

  return { sessionPatch, missingInfo };
}

/* ---------- OpenAI helpers ---------- */

async function transcribeAudio(env, audioBuffer, mime) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const form = new FormData();
  const file = new File([audioBuffer], "audio.webm", { type: mime || "audio/webm" });
  form.append("file", file);
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: form
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`transcription error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.text || "";
}

async function handleQuery(request, env) {
  if (!env.DB) {
    return jsonResponse(
      { error: "db_unavailable", message: "Database binding not configured" },
      503
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const { query, params = [] } = payload || {};

  if (typeof query !== "string" || !query.trim()) {
    return jsonResponse(
      { error: "bad_request", message: "query string required" },
      400
    );
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery.toLowerCase().startsWith("select")) {
    return jsonResponse(
      { error: "forbidden", message: "only SELECT queries are allowed" },
      403
    );
  }

  try {
    const stmt = env.DB.prepare(trimmedQuery);
    const result = await stmt.bind(...(Array.isArray(params) ? params : [])).all();
    return jsonResponse({ results: result.results || [], success: result.success !== false }, 200);
  } catch (err) {
    console.error("handleQuery DB error:", err);
    return jsonResponse(
      { error: "db_error", message: String(err) },
      500
    );
  }
}

/* ---------- /generate-presentation ---------- */

async function handleGeneratePresentation(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { error: "bad_request", message: "JSON body required" },
      400
    );
  }

  const {
    transcript,
    sections,
    materials,
    customerSummary,
    recommendations
  } = payload;

  if (!transcript || typeof transcript !== "string") {
    return jsonResponse(
      { error: "bad_request", message: "transcript string required" },
      400
    );
  }

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return jsonResponse(
      { error: "bad_request", message: "recommendations array required" },
      400
    );
  }

  try {
    const result = await generatePresentationWithAI(env, {
      transcript,
      sections: sections || [],
      materials: materials || [],
      customerSummary: customerSummary || '',
      recommendations
    });
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("handleGeneratePresentation error:", err);
    return jsonResponse(
      { error: "model_error", message: String(err) },
      500
    );
  }
}

async function generatePresentationWithAI(env, payload) {
  const openaiKey = env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    throw new Error("Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be configured");
  }

  const {
    transcript,
    sections,
    materials,
    customerSummary,
    recommendations
  } = payload;

  // Fetch reference materials from database
  const referenceMaterials = await fetchReferenceMaterials(env, transcript);

  // Build a comprehensive context about the conversation
  const conversationContext = buildConversationContext(transcript, sections, materials, customerSummary);

  const systemPrompt = `You are an expert heating system advisor creating a personalized presentation for a customer based on their actual conversation with a heating engineer.

You will receive:
- The full transcript of the conversation between the customer and heating expert
- Structured notes from the survey (depot sections)
- Materials/parts discussed
- System recommendations with scores
${referenceMaterials ? '- Reference materials from the knowledge database\n' : ''}
Your job is to create a compelling, customer-specific presentation that:
1. References specific things the customer said during the conversation
2. Explains why each recommended system fits THEIR specific situation
3. Addresses any concerns or questions they raised
4. Uses their actual property details and requirements
5. Feels personal and conversational, not generic

For each recommended system, provide:
- **Customer-specific explanation**: Why THIS system is right for THEIR home based on what they told you (reference specific details from the conversation)
- **Benefits for them**: How this addresses THEIR specific needs, concerns, or goals mentioned in the conversation
- **Concerns addressed**: Any doubts or questions they raised, answered directly
- **What happens next**: The installation process specific to their property
- **Estimated timeline**: Based on their property type and current system

IMPORTANT RULES:
- Always reference specific details from the conversation (e.g., "You mentioned you have 3 bedrooms and often run showers simultaneously...")
- Use conversational language, as if continuing the discussion
- Be honest about limitations - don't oversell
- If they expressed concerns, acknowledge and address them
- Use their actual property details (not generic examples)
${referenceMaterials ? '\n' + referenceMaterials + '\n' : ''}
You MUST respond with ONLY valid JSON matching this shape:

{
  "propertyProfile": {
    "summary": "2-3 sentence summary of their property based on the conversation",
    "keyDetails": ["Detail 1 they mentioned", "Detail 2 they mentioned", ...]
  },
  "conversationHighlights": [
    "Key point 1 from the conversation",
    "Key point 2 from the conversation"
  ],
  "systemPresentations": [
    {
      "systemKey": "system-unvented",
      "customerSpecificExplanation": "Multi-paragraph explanation of why this system fits their specific situation, referencing things they said...",
      "benefitsForThem": [
        "Specific benefit 1 based on their needs",
        "Specific benefit 2 addressing their concerns"
      ],
      "concernsAddressed": [
        {
          "concern": "Something they were worried about",
          "response": "How this system addresses that concern"
        }
      ],
      "installationDetails": {
        "whatHappens": "Description of installation specific to their property type and current system",
        "timeline": "Estimated timeline with reasoning",
        "disruption": "What disruption to expect in their specific situation"
      },
      "whyNotOthers": "Brief explanation of why the other options might not be as suitable for them"
    }
  ]
}

Do not wrap the JSON in backticks or markdown.
Do not include any explanation outside the JSON.
Make it personal, specific, and conversational.`.trim();

  const userPayload = {
    transcript,
    conversationContext,
    sections,
    materials,
    customerSummary,
    recommendations: recommendations.map(rec => ({
      systemKey: rec.systemKey,
      systemName: rec.systemName,
      score: rec.score,
      reasons: rec.reasons || []
    }))
  };

  // Try OpenAI first, fall back to Anthropic if it fails
  let trimmedContent;
  let lastError;

  if (openaiKey) {
    try {
      console.log("Attempting to call OpenAI for presentation generation...");
      const body = {
        model: "gpt-4.1",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const rawText = await res.text();

      if (!res.ok) {
        throw new Error(`OpenAI chat.completions ${res.status}: ${rawText}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        throw new Error(`OpenAI returned non-JSON response: ${String(err)} :: ${rawText}`);
      }

      const content = parsed?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("No content from OpenAI model");
      }

      trimmedContent = content.trim();
      console.log("OpenAI call successful");
    } catch (err) {
      console.error("OpenAI call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  // Fall back to Anthropic if OpenAI failed or wasn't available
  if (!trimmedContent && anthropicKey) {
    try {
      console.log("Falling back to Anthropic for presentation generation...");
      trimmedContent = await callAnthropicChat(
        anthropicKey,
        systemPrompt,
        JSON.stringify(userPayload),
        0.7
      );
      console.log("Anthropic call successful");
    } catch (err) {
      console.error("Anthropic call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  if (!trimmedContent) {
    throw new Error(`All AI providers failed. Last error: ${String(lastError)}`);
  }

  let jsonOut;
  try {
    jsonOut = JSON.parse(trimmedContent);
  } catch (err) {
    throw new Error(`Model content was not valid JSON: ${String(err)} :: ${trimmedContent}`);
  }

  // Safety defaults
  if (!jsonOut.propertyProfile) {
    jsonOut.propertyProfile = {
      summary: "Property profile not available",
      keyDetails: []
    };
  }
  if (!Array.isArray(jsonOut.conversationHighlights)) {
    jsonOut.conversationHighlights = [];
  }
  if (!Array.isArray(jsonOut.systemPresentations)) {
    jsonOut.systemPresentations = [];
  }

  return jsonOut;
}

function buildConversationContext(transcript, sections, materials, customerSummary) {
  const context = {
    customerSummary,
    keyFacts: []
  };

  // Extract key facts from sections
  const importantSections = ['Needs', 'System characteristics', 'New boiler and controls', 'Future plans'];
  sections.forEach(section => {
    if (importantSections.includes(section.section) && section.naturalLanguage) {
      context.keyFacts.push(`${section.section}: ${section.naturalLanguage}`);
    }
  });

  // Add materials context
  if (materials && materials.length > 0) {
    const materialsSummary = materials.map(m =>
      `${m.item}${m.notes ? ' (' + m.notes + ')' : ''}`
    ).join(', ');
    context.keyFacts.push(`Materials discussed: ${materialsSummary}`);
  }

  return context;
}

async function callAnthropicChat(apiKey, systemPrompt, userContent, temperature = 0.2) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const body = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    temperature,
    system: systemPrompt,
    messages: [
      { role: "user", content: userContent }
    ]
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const rawText = await res.text();

  if (!res.ok) {
    throw new Error(`anthropic.messages ${res.status}: ${rawText}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Anthropic returned non-JSON response: ${String(err)} :: ${rawText}`);
  }

  const content = parsed?.content?.[0]?.text;
  if (!content || typeof content !== "string") {
    throw new Error("No content from Anthropic model");
  }

  return content.trim();
}

/* ---------- Reference Materials Fetcher ---------- */

async function fetchReferenceMaterials(env, transcript) {
  const materials = [];

  try {
    if (env.DB) {
      const columns = await getReferenceMaterialColumns(env);
      const query = buildReferenceMaterialQuery(columns);
      const result = await env.DB.prepare(query).all();

      if (result.success && result.results && result.results.length > 0) {
        materials.push("=== Reference Materials from Database (latest versions preferred) ===");
        result.results.forEach(row => {
          materials.push(`\n${row.title || 'Untitled'}:`);
          materials.push(row.content || '');
        });
      }
    }
  } catch (err) {
    console.error("Failed to fetch reference materials from DB:", err);
    // Don't fail the whole request if reference fetch fails
  }

  return materials.length > 0 ? materials.join("\n") : "";
}

async function getReferenceMaterialColumns(env) {
  try {
    const result = await env.DB.prepare("PRAGMA table_info(reference_materials)").all();
    if (result?.results?.length) {
      return new Set(result.results.map(row => row.name));
    }
  } catch (err) {
    console.error("Failed to inspect reference_materials schema:", err);
  }
  return new Set();
}

function buildReferenceMaterialQuery(columns) {
  const orderColumns = [];
  const preferredOrder = [
    "version_date",
    "effective_date",
    "version_tag",
    "version",
    "updated_at",
    "created_at"
  ];

  preferredOrder.forEach(col => {
    if (columns.has(col)) {
      orderColumns.push(`${col} DESC`);
    }
  });

  const whereClause = columns.has("is_latest") ? "WHERE is_latest = 1" : "";
  const orderClause = orderColumns.length ? `ORDER BY ${orderColumns.join(", ")}` : "ORDER BY ROWID DESC";
  const limitClause = "LIMIT 50";

  return `SELECT * FROM reference_materials ${whereClause} ${orderClause} ${limitClause}`.trim();
}

function applyTranscriptionSanityChecks(transcript) {
  if (typeof transcript !== "string") {
    return { sanitisedTranscript: "", sanityNotes: [] };
  }

  const allowedPipeSizes = [8, 10, 15, 22, 28, 35];
  const sanityNotes = [];
  let sanitisedTranscript = transcript;

  sanitisedTranscript = sanitisedTranscript.replace(/(\d{1,2})\s*mm/gi, (match, sizeStr) => {
    const size = Number(sizeStr);
    if (allowedPipeSizes.includes(size)) return `${size}mm`;

    const correctedSize = closestValue(size, allowedPipeSizes);
    if (correctedSize) {
      sanityNotes.push(`Normalised pipe size ${size}mm to ${correctedSize}mm based on standard dimensions.`);
      return `${correctedSize}mm`;
    }

    return match;
  });

  return { sanitisedTranscript: sanitisedTranscript.trim(), sanityNotes };
}

function closestValue(value, candidates) {
  if (!candidates?.length) return null;
  let best = candidates[0];
  let minDiff = Math.abs(value - candidates[0]);
  for (let i = 1; i < candidates.length; i++) {
    const diff = Math.abs(value - candidates[i]);
    if (diff < minDiff) {
      minDiff = diff;
      best = candidates[i];
    }
  }
  return best;
}

const DEFAULT_DEPOT_NOTES_INSTRUCTIONS = `
You are generating engineer-friendly "Depot Notes" from a voice transcript for a domestic heating job.

General rules:
- Prefer clear, non-duplicated bullets.
- Avoid contradictions in the same section.
- When there is a conflict between earlier speculative text and later, typed "summary" lines from the adviser, ALWAYS prefer the later summary lines.
- Preserve the adviser's intent, not the raw transcription glitches.

High-priority source of truth:
- If the transcript contains a clearly typed list or short summary entered by the adviser (for example in a "Customer summary", "Engineer notes", or "typed notes" section), treat these as the final instructions.
- When such a summary contradicts earlier spoken content, follow the summary and drop the conflicting spoken content.

---

### Gas supply rules (Pipe work section)

When generating Pipe work bullets about the gas supply:

1. If the transcript contains phrases like:
   - "increase gas supply" OR "upgrade gas supply"
   AND
   - a route phrase such as "from meter", "via cupboards", "through cupboards", "along the same route", "to the boiler position"
   then:
   - Treat that as the authoritative gas instruction.
   - Generate ONE clear bullet describing the upgrade and route, for example:

     - "• Upgrade gas supply from meter via cupboards to new boiler position (size to suit 24kW boiler output plus diversity);"

   - Do NOT also generate a bullet stating that the "existing 15mm gas supply is adequate". Avoid any wording that contradicts the upgrade.

2. If the transcript only says the gas is adequate, with no "increase"/"upgrade" wording or route:
   - Generate a simple confirmation bullet, for example:

     - "• Existing gas supply confirmed adequate for new boiler;"

3. Never output both "existing 15mm gas supply confirmed adequate" AND "increase gas supply" in the same job. If upgrade wording is present, the upgrade wins and the "adequate" line should not appear.

---

### Primary pipework (primaries) rules (Pipe work section)

When generating Pipe work bullets about primaries (primary flow and return):

1. Look for phrases in the transcript such as:
   - "primaries", "primary pipework", "flow and return"
   AND
   - power or sizing context such as "set up for up to 18 kW", "you've got 24", "change them to 28mm", "24Ri", etc.

2. When these are present, generate two distinct bullets instead of a single vague one:

   - A route / location bullet tying the change to the physical path, for example:
     - "• Replace primary flow and return between loft hatches and airing cupboard;"

   - A sizing / justification bullet, for example:
     - "• Upgrade primary pipework to 28mm to allow full 24kW boiler output without overheating;"

3. Avoid vague or duplicate wording when the above bullets are used. For example, drop weaker lines like:
   - "Pipework between loft hatches and in airing cupboard to be replaced;"
   if they would duplicate a clearer, more explicit primaries bullet.

4. If the transcript clearly states that existing primaries are undersized (e.g. "current pipework is set up for up to 18kW and you’ve got 24"), ensure the notes include the reason:
   - Mention that the upgrade to 28mm is to match boiler output and reduce overheating / cycling.

---

### S-plan, pump, and open vent / cold feed assembly

When the transcript mentions replacing the pump, mid-position valve, or open vent / cold feed:

- Use clear, standard wording such as:
  - "• Replace primary pump and motorised valve assembly;"
  - "• Replace open vent and cold feed arrangement as part of system upgrade;"
  - "• Install new S-plan with two motorised valves (one heating, one hot water) and automatic bypass;"

- Normalise common mis-heard phrases:
  - "open venting code fade" → "open vent / cold feed arrangement".

---

### Brand and component clean-ups

Correct obvious transcription errors for well-known components:

- "Ferox TF1" → "Fernox TF1"
- Similar mis-spellings of common filters, inhibitors, and boiler models should be corrected to the standard brand spelling where unambiguous.

---

### General clean-up and de-duplication

- Remove "noise" bullets that do not contain a clear instruction or could cause confusion.
  - Example to drop: "possible issues with pipework in screening area;" if it has no route, size, or action.
- Favour fewer, clearer bullets over many vague ones.
- Where possible, make each bullet:
  - Specific to a location or route (e.g. "between loft hatches and airing cupboard").
  - Explicit about size or rating when changing pipework (e.g. "upgrade to 28mm").
  - Consistent with any final typed summary from the adviser.

Output concise, engineer-ready bullets in each section: no waffle, no contradictions, just what needs doing and why.
`;

function buildDepotNotesInstructions(customInstructions, referenceMaterials) {
  const base = (customInstructions && typeof customInstructions === "string" && customInstructions.trim())
    ? customInstructions.trim()
    : DEFAULT_DEPOT_NOTES_INSTRUCTIONS.trim();

  if (referenceMaterials && typeof referenceMaterials === "string" && referenceMaterials.trim()) {
    return `${base}\n\nReference materials to use:\n${referenceMaterials.trim()}`;
  }

  return base;
}

async function callNotesModel(env, payload) {
  const openaiKey = env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    throw new Error("Either OPENAI_API_KEY or ANTHROPIC_API_KEY must be configured");
  }

  const {
    transcript,
    checklistItems: rawChecklistItems = [],
    depotSections: depotSectionsRaw = [],
    alreadyCaptured = [],
    sectionHints = {},
    forceStructured = false,
    sanityNotes = [],
    customInstructions = "",
    multipleQuotesHint = false
  } = payload || {};

  const checklistFromPayload = sanitiseChecklistConfig(rawChecklistItems);
  const checklistItems = checklistFromPayload.items.length
    ? checklistFromPayload.items
    : cloneChecklistItems(DEFAULT_CHECKLIST_CONFIG.items);

  const activeSchemaInfo = getSchemaInfoFromPayload(depotSectionsRaw);
  const sectionListText = activeSchemaInfo.names
    .map((name, idx) => `${idx + 1}. ${name}`)
    .join("\n");

  // Fetch reference materials from database
  const referenceMaterials = await fetchReferenceMaterials(env, transcript);

  // IMPORTANT: we do NOT use response_format here.
  // Instead we *ask* for JSON and parse it ourselves.

  const multipleQuotesInstructions = multipleQuotesHint ? `

MULTIPLE QUOTE OPTIONS DETECTED:
- The transcript discusses multiple quote options or alternatives (e.g., "Option 1", "Quote 2", "alternatively").
- You MUST generate separate quote variants using the "quoteVariants" field.
- Each quote variant should have:
  - A descriptive label (e.g., "Quote A", "Quote B", "Option 1", "Option 2")
  - Complete sections with all depot notes specific to that option
- Common information should go in the main "sections" field.
- Quote-specific information (different boilers, alternative approaches, etc.) should go in "quoteVariants".
- Each variant should be self-contained and complete enough for the engineer to understand what's different about that option.
` : '';

  const systemPrompt = `
${buildDepotNotesInstructions(customInstructions, referenceMaterials)}

Depot section names (in order):
${sectionListText}

Always return all of these sections, even if a section has no notes. Use the exact names and order.

Your job is to:
1. Decide which checklist ids are clearly satisfied by the transcript.
2. Write depot notes grouped into the given section names.
3. Suggest a small list of materials/parts.
4. Write a short customer-friendly summary of the job.
5. ACTIVELY ANALYZE the live transcript and ASK QUESTIONS about missing or unclear information.
6. SANITY CHECK transcription details and correct obvious errors using context and standard dimensions (pipework sizes should be 8/10mm, 15mm, 22mm, 28mm, or 35mm; avoid improbable sizes by normalising to the nearest standard size).
7. Prefer the most recent reference material versions (e.g., the latest pricebook, such as November 2025) if multiple versions are available.
${multipleQuotesInstructions}
CRITICAL DETAIL RETENTION RULES:
- RETAIN ALL SPECIFIC DETAILS: If the transcript mentions specific measurements, routes, locations, sizes, or technical specifications, include ALL of them in the notes.
- SHARPEN VAGUE DESCRIPTIONS: Convert conversational descriptions into precise technical specifications. For example, "the flue goes up and around" becomes "Flue route: vertical from boiler, 90° bend at ceiling level, horizontal run 2m through loft space to external wall."
- ROUTES AND PATHS: When describing pipe routes, flue routes, or cable runs, capture EVERY waypoint, measurement, and direction change mentioned. Include start point, intermediate points, and end point.
- SIZES AND SPECIFICATIONS: Always include exact measurements when mentioned (e.g., "22mm copper pipe" not "pipe", "2.5m vertical rise" not "goes up").
- LOCATIONS: Be specific about locations - include room names, relative positions, heights, and any landmarks mentioned.
- MATERIALS AND MODELS: Always capture full product names, model numbers, and specifications when mentioned.

DEDUPLICATION RULES:
- If alreadyCaptured contains information for a section, DO NOT repeat that information.
- Only add NEW information from the current transcript that isn't already captured.
- If a detail is semantically the same (e.g., "Worcester Bosch 35kW boiler" vs "35kW Worcester Bosch"), treat as duplicate.
- Within each section, avoid listing the same information multiple times even if worded differently.

REAL-TIME QUESTION GENERATION:
- As you process the live transcript, identify what information is MISSING or UNCLEAR.
- Generate specific, actionable questions in the missingInfo array to help complete the survey.
- Questions should be directly relevant to what's being discussed in the current transcript.
- Ask about details that would be needed to complete the depot sections or checklist items.
- Target questions appropriately: "expert" for surveyor to investigate, "customer" for customer to answer.
- Be proactive - if the transcript mentions something vague (e.g., "the boiler is old"), ask for specifics (e.g., "What is the make and model of the existing boiler?").
- If critical information for a section is missing, ask about it even if the section hasn't been fully discussed yet.

You MUST respond with ONLY valid JSON matching this shape:

{
  "checkedItems": ["<checklistId>", ...],
  "sections": [
    {
      "section": "<one of the depot section names>",
      "plainText": "Short semi-bullet summary; clauses separated by semicolons;",
      "naturalLanguage": "Human sentence description for depot notes."
    }
  ],
  "materials": [
    {
      "category": "Boiler | Cylinder | Flue | Controls | System clean | Filter | Misc",
      "item": "Exact part description (include make and model for boilers/cylinders where known).",
      "qty": 1,
      "notes": "Optional short note such as size, orientation or location."
    }
  ],
  "missingInfo": [
    { "target": "expert | customer", "question": "Short question if anything important is unclear." }
  ],
  "customerSummary": "2–4 sentence summary suitable to show the customer."${multipleQuotesHint ? `,
  "quoteVariants": [
    {
      "label": "Quote A | Quote B | Option 1 | etc.",
      "sections": [
        {
          "section": "<one of the depot section names>",
          "plainText": "Quote-specific notes for this variant;",
          "naturalLanguage": "Quote-specific description for this variant."
        }
      ]
    }
  ]` : ''}
}

Do not wrap the JSON in backticks or markdown.
Do not include any explanation outside the JSON.
If something isn't mentioned, leave it out rather than guessing.
Always preserve boiler/cylinder make & model exactly as spoken.
`.trim();

  const userPayload = {
    transcript,
    checklistItems,
    depotSections: activeSchemaInfo.schema,
    alreadyCaptured,
    expectedSections: activeSchemaInfo.names,
    sectionHints,
    forceStructured,
    sanityNotes
  };

  // Try OpenAI first, fall back to Anthropic if it fails
  let trimmedContent;
  let lastError;

  if (openaiKey) {
    try {
      console.log("Attempting to call OpenAI for notes model...");
      const body = {
        model: "gpt-4.1",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      };

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const rawText = await res.text();

      if (!res.ok) {
        throw new Error(`OpenAI chat.completions ${res.status}: ${rawText}`);
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        throw new Error(`OpenAI returned non-JSON response: ${String(err)} :: ${rawText}`);
      }

      const content = parsed?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("No content from OpenAI model");
      }

      trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error("OpenAI model content was empty");
      }

      console.log("OpenAI call successful");
    } catch (err) {
      console.error("OpenAI call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  // Fall back to Anthropic if OpenAI failed or wasn't available
  if (!trimmedContent && anthropicKey) {
    try {
      console.log("Falling back to Anthropic for notes model...");
      trimmedContent = await callAnthropicChat(
        anthropicKey,
        systemPrompt,
        JSON.stringify(userPayload),
        0.2
      );
      console.log("Anthropic call successful");
    } catch (err) {
      console.error("Anthropic call failed:", String(err));
      lastError = err;
      trimmedContent = null;
    }
  }

  if (!trimmedContent) {
    throw new Error(`All AI providers failed. Last error: ${String(lastError)}`);
  }

  let jsonOut;
  try {
    jsonOut = JSON.parse(trimmedContent);
  } catch (err) {
    throw new Error(`Model content was not valid JSON: ${String(err)} :: ${content}`);
  }

  // Safety defaults
  if (!Array.isArray(jsonOut.sections)) jsonOut.sections = [];
  if (!Array.isArray(jsonOut.materials)) jsonOut.materials = [];
  if (!Array.isArray(jsonOut.checkedItems)) jsonOut.checkedItems = [];
  if (!Array.isArray(jsonOut.missingInfo)) jsonOut.missingInfo = [];
  if (typeof jsonOut.customerSummary !== "string") jsonOut.customerSummary = "";

  jsonOut.sections = normaliseSectionsFromModel(jsonOut.sections, activeSchemaInfo);

  return jsonOut;
}

function normaliseCapturedSections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => {
      if (typeof entry === "string") {
        const section = entry.trim();
        if (!section) return null;
        return { section, plainText: "", naturalLanguage: "" };
      }
      if (!entry || typeof entry !== "object") return null;
      const section = entry.section != null ? String(entry.section).trim() : "";
      if (!section) return null;
      const plainText = entry.plainText != null ? String(entry.plainText) : "";
      const naturalLanguage = entry.naturalLanguage != null ? String(entry.naturalLanguage) : "";
      return { section, plainText, naturalLanguage };
    })
    .filter(Boolean);
}

function normaliseExpectedSections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(section => section != null ? String(section).trim() : "")
    .filter(Boolean);
}

function normaliseSectionHints(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const key = rawKey != null ? String(rawKey).trim() : "";
    if (!key) continue;
    const val = rawVal != null ? String(rawVal).trim() : "";
    if (!val) continue;
    out[key] = val;
  }
  return out;
}

function resolveCanonicalSectionName(name, schemaInfo) {
  const key = normaliseSectionKey(name);
  if (!key) return null;
  return schemaInfo.keyLookup.get(key) || null;
}

function normaliseSectionsFromModel(rawSections, schemaInfo) {
  const orderedNames = schemaInfo.names;
  const map = new Map();

  (Array.isArray(rawSections) ? rawSections : []).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const rawName = typeof entry.section === "string"
      ? entry.section.trim()
      : typeof entry.name === "string"
        ? entry.name.trim()
        : "";
    if (!rawName) return;
    const resolved = resolveCanonicalSectionName(rawName, schemaInfo);
    if (!resolved) return;
    if (map.has(resolved)) return;
    const plainText = typeof entry.plainText === "string" ? entry.plainText : String(entry.plainText || "");
    const naturalLanguage = typeof entry.naturalLanguage === "string"
      ? entry.naturalLanguage
      : String(entry.naturalLanguage || entry.summary || "");
    map.set(resolved, {
      section: resolved,
      plainText,
      naturalLanguage
    });
  });

  const missing = [];
  const normalised = orderedNames.map((name) => {
    const existing = map.get(name);
    if (existing) return existing;
    missing.push(name);
    return {
      section: name,
      plainText: "• No additional notes;",
      naturalLanguage: "No additional notes."
    };
  });

  if (missing.length) {
    console.warn("Depot notes: model response missing sections:", missing);
  }

  return normalised;
}
import schemaConfig from "./depot.output.schema.json" with { type: "json" };
import checklistConfig from "./checklist.config.json" with { type: "json" };

const FUTURE_PLANS_NAME = "Future plans";
const FUTURE_PLANS_DESCRIPTION = "Notes about any future work or follow-on visits.";

function sanitiseSectionSchema(input) {
  const asArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.sections)) {
      return value.sections;
    }
    return [];
  };

  const rawEntries = asArray(input);
  const prepared = [];
  rawEntries.forEach((entry, idx) => {
    if (!entry) return;
    const rawName = entry.name ?? entry.section ?? entry.title ?? entry.heading;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || name === "Arse_cover_notes") return;
    const rawDescription = entry.description ?? entry.hint ?? "";
    const description = typeof rawDescription === "string"
      ? rawDescription.trim()
      : String(rawDescription || "").trim();
    const order = typeof entry.order === "number" ? entry.order : idx + 1;
    prepared.push({ name, description, order, idx });
  });

  prepared.sort((a, b) => {
    const aHasOrder = typeof a.order === "number";
    const bHasOrder = typeof b.order === "number";
    if (aHasOrder && bHasOrder && a.order !== b.order) {
      return a.order - b.order;
    }
    if (aHasOrder && !bHasOrder) return -1;
    if (!aHasOrder && bHasOrder) return 1;
    return a.idx - b.idx;
  });

  const unique = [];
  const seen = new Set();
  prepared.forEach((entry) => {
    if (seen.has(entry.name)) return;
    seen.add(entry.name);
    unique.push({
      name: entry.name,
      description: entry.description || "",
      order: entry.order
    });
  });

  let withoutFuture = unique.filter((entry) => entry.name !== FUTURE_PLANS_NAME);
  let future = unique.find((entry) => entry.name === FUTURE_PLANS_NAME);
  if (!future) {
    future = {
      name: FUTURE_PLANS_NAME,
      description: FUTURE_PLANS_DESCRIPTION,
      order: withoutFuture.length + 1
    };
  } else if (!future.description) {
    future = { ...future, description: FUTURE_PLANS_DESCRIPTION };
  }

  const final = [...withoutFuture, future].map((entry, idx) => ({
    name: entry.name,
    description: entry.description || "",
    order: idx + 1
  }));

  return final;
}

function normaliseSectionKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildSchemaInfo(raw) {
  const schema = sanitiseSectionSchema(raw);
  const names = schema.map((entry) => entry.name);
  const keyLookup = new Map();
  schema.forEach((entry) => {
    const key = normaliseSectionKey(entry.name);
    if (!key) return;
    const variants = new Set([key]);
    if (key.endsWith("s")) variants.add(key.replace(/s$/, ""));
    if (key.endsWith("ies")) {
      variants.add(key.replace(/ies$/, "y"));
    } else if (key.endsWith("y")) {
      variants.add(key.replace(/y$/, "ies"));
    }
    if (key.includes(" and ")) {
      variants.add(key.replace(/\band\b/g, "").replace(/\s+/g, " ").trim());
    }
    variants.forEach((variant) => {
      if (variant && !keyLookup.has(variant)) {
        keyLookup.set(variant, entry.name);
      }
    });
  });
  return { schema, names, keyLookup };
}

function sanitiseChecklistConfig(raw) {
  const asArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object" && Array.isArray(value.items)) {
      return value.items;
    }
    return [];
  };

  const items = [];
  const seen = new Set();

  asArray(raw).forEach((item) => {
    if (!item || typeof item !== "object") return;
    const id = item.id != null ? String(item.id).trim() : "";
    const label = item.label != null ? String(item.label).trim() : "";
    if (!id || !label || seen.has(id)) return;
    seen.add(id);

    const section = item.section != null
      ? String(item.section).trim()
      : item.depotSection != null
        ? String(item.depotSection).trim()
        : "";

    const cloneMaterials = () => {
      if (!Array.isArray(item.materials)) return [];
      return item.materials
        .map((mat) => {
          if (!mat || typeof mat !== "object") return null;
          const itemName = mat.item != null ? String(mat.item).trim() : "";
          if (!itemName) return null;
          const qtyNum = Number(mat.qty);
          const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;
          return {
            category: mat.category != null ? String(mat.category).trim() : "Misc",
            item: itemName,
            qty,
            notes: mat.notes != null ? String(mat.notes).trim() : ""
          };
        })
        .filter(Boolean);
    };

    items.push({
      id,
      group: item.group != null ? String(item.group).trim() : "",
      section,
      depotSection: section || undefined,
      label,
      hint: item.hint != null ? String(item.hint).trim() : "",
      plainText: item.plainText != null ? String(item.plainText).trim() : "",
      naturalLanguage: item.naturalLanguage != null ? String(item.naturalLanguage).trim() : "",
      materials: cloneMaterials()
    });
  });

  let sectionsOrder = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.sectionsOrder)) {
    sectionsOrder = raw.sectionsOrder
      .map((name) => String(name || "").trim())
      .filter(Boolean);
  }

  return {
    items,
    sectionsOrder
  };
}

function cloneChecklistItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    materials: Array.isArray(item.materials)
      ? item.materials.map((mat) => ({ ...mat }))
      : []
  }));
}

const DEFAULT_SCHEMA_INFO = buildSchemaInfo(schemaConfig);
const DEFAULT_CHECKLIST_CONFIG = sanitiseChecklistConfig(checklistConfig);

function getSchemaInfoFromPayload(raw) {
  const rawArrayLength = Array.isArray(raw)
    ? raw.length
    : raw && Array.isArray(raw.sections)
      ? raw.sections.length
      : 0;
  if (rawArrayLength > 0) {
    return buildSchemaInfo(raw);
  }
  return DEFAULT_SCHEMA_INFO;
}
