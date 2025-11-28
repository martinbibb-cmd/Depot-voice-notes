import { loadWorkerEndpoint } from "../app/worker-config.js";
import type { DepotSurveySession } from "../models/depotSession.js";

export interface MissingInfoItem {
  path?: string;
  label?: string;
  detail?: string;
}

export interface AutoFillResponse {
  sessionPatch: Partial<DepotSurveySession>;
  missingInfo: MissingInfoItem[];
}

const DEFAULT_TOOL = "auto_fill_depot_session";

export async function autoFillSession(
  transcript: string,
  session: DepotSurveySession
): Promise<AutoFillResponse> {
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

  const data = (await response.json()) as Partial<AutoFillResponse>;
  return {
    sessionPatch: data.sessionPatch || {},
    missingInfo: Array.isArray(data.missingInfo) ? data.missingInfo : []
  };
}

export default autoFillSession;
