export function communicationSafeguards(interpretation, option, photos = [], sourceText = '') {
  // A missing keyword is not proof that a completed survey omitted a subject.
  // Required technical choices are completed in the visual proposal editor.
  // Only an actual capture fault creates an additional blocking check.
  const faultPattern = /\[blank_audio\]|\[transcription (?:interrupted|failed)\]|transcription (?:was )?(?:interrupted|failed)/i;
  const fault = sourceText.match(faultPattern)?.[0];
  if (!fault) return [];
  return [{
    id: 'safeguard-capture-integrity',
    originalText: 'The transcript contains a capture interruption.',
    text: 'Part of the visit may not have transcribed correctly.',
    reason: 'Review the nearby transcript, add the missing information if necessary, or dismiss the marker as a transcription error.',
    evidenceRelation: fault,
    targetSection: 'Office notes',
    checked: false,
    manual: false,
    removed: false,
    kind: 'informationGap',
    includeInNotes: false
  }];
}

export function derivedWorkSuggestions(interpretation, option) {
  const facts = [...(interpretation?.sharedFacts || []), ...(option?.facts || [])];
  const corpus = facts.map(item => `${item.category || ''} ${item.text || ''}`).join(' ').toLowerCase();
  const suggestions = [];
  const add = (id, text, reason, parent) => suggestions.push({
    id: `derived-${id}-${parent?.id || 'evidence'}`, factId: `derived-${id}-${parent?.id || 'evidence'}`,
    originalText: text, text, reason, evidenceRelation: parent?.evidenceQuote || parent?.text || '',
    evidenceSource: 'derived from confirmed survey evidence', evidenceState: 'derivedSuggestion',
    parentFactId: parent?.id || null, targetSection: 'Restrictions to work', checked: false,
    manual: false, removed: false, kind: 'derivedSuggestion', includeInNotes: true
  });
  const find = pattern => facts.find(item => pattern.test(`${item.category || ''} ${item.text || ''}`));
  const flueAccess = find(/flue.{0,100}(?:access|ladder|slope|garden)|(?:ladder|slope|garden).{0,100}flue/i);
  if (flueAccess && !/scaffold/.test(corpus)) add('scaffold', 'Scaffold may be required for the recorded flue access.', 'Suggested because the recorded flue access may not be reachable by normal ladder access.', flueAccess);
  const condensateRoute = find(/condensate.{0,120}(?:route|through|outside|inside|sink|soakaway)/i);
  if (condensateRoute && !/install|new condensate|fit.*condensate/.test(corpus)) {
    const item = { ...condensateRoute };
    add('condensate-pipe', 'New condensate pipework may be required for the recorded route.', 'Suggested because a condensate route is recorded but the installation work is not explicit.', item);
    suggestions.at(-1).targetSection = 'Pipe work';
  }
  const obstruction = find(/(?:boxing|cupboard|shelving|obstruction).{0,100}(?:access|remove|clear)|(?:access|remove|clear).{0,100}(?:boxing|cupboard|shelving|obstruction)/i);
  if (obstruction && !/remove|clear|refit/.test(corpus)) add('clear-access', 'The recorded boiler obstruction may need clearing for access.', 'Suggested because an obstruction is recorded at the proposed work area.', obstruction);
  const dirtySystem = find(/(?:dirty|sludge|poor circulation|contaminat)/i);
  if (dirtySystem && !/powerflush|clean|treat|flush/.test(corpus)) {
    add('system-clean', 'System cleaning or treatment may be required.', 'Suggested because system condition or circulation concerns were recorded.', dirtySystem);
    suggestions.at(-1).targetSection = 'Pipe work';
  }
  return suggestions;
}

export function mergeSafeguards(state, safeguards) {
  const result = state || { items: [] };
  const currentSafeguardIds = new Set(safeguards.map(item => item.id));
  // A previously missing subject must disappear when the transcript or added
  // context now establishes it. Never leave a stale generated gap behind.
  result.items = (result.items || []).filter(item => !String(item.id || '').startsWith('safeguard-') || currentSafeguardIds.has(item.id));
  const existingItems = new Map(result.items.map(item => [item.id, item]));
  safeguards.forEach(generated => {
    const existing = existingItems.get(generated.id);
    if (!existing) return;
    const wasLegacyGap = /Gap$/.test(existing.kind || '') || /^TO CONFIRM:/i.test(existing.text || '');
    existing.responseOptions = generated.responseOptions;
    existing.reason ||= generated.reason;
    existing.evidenceRelation ||= generated.evidenceRelation;
    existing.kind = generated.kind;
    existing.includeInNotes = generated.includeInNotes;
    if (wasLegacyGap) {
      existing.originalText = generated.originalText;
      existing.text = generated.text;
      existing.checked = false;
    }
  });
  const existing = new Set(existingItems.keys());
  result.items = [...(result.items || []), ...safeguards.filter(item => !existing.has(item.id))];
  return result;
}

export function unresolvedSafeguards(state) {
  return [];
}
