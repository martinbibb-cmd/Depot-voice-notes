// @ts-check
import { loadWorkerEndpoint } from "../app/worker-config.js";

const DEFAULT_TOOL = "auto_fill_depot_session";

/**
 * @typedef {{ path?: string; label?: string; detail?: string; }} MissingInfoItem
 * @typedef {{ sessionPatch: Partial<import("../models/depotSession.js").DepotSurveySession>, missingInfo: MissingInfoItem[] }} AutoFillResponse
 */

/**
 * Call the AI worker to auto-fill a Depot survey session from transcript + current session.
 * @param {string} transcript
 * @param {import("../models/depotSession.js").DepotSurveySession} session
 * @returns {Promise<AutoFillResponse>}
 */
export async function autoFillSession(transcript, session) {
  const workerUrl = loadWorkerEndpoint();
  const payload = {
    transcript,
    session,
    tool: DEFAULT_TOOL,
    schema: "DepotSurveySession"
  };

  const response = await fetch(`${workerUrl}/tools/auto-fill-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auto-fill request failed: ${response.status} ${response.statusText} – ${text}`);
  }

  const data = await response.json();
  return {
    sessionPatch: data?.sessionPatch || {},
    missingInfo: Array.isArray(data?.missingInfo) ? data.missingInfo : []
  };
}

export default autoFillSession;
