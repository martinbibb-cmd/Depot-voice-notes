function evidenceText(interpretation, option, sourceText = '') {
  const values = [
    ...(interpretation?.sharedFacts || []),
    ...(option?.facts || [])
  ];
  return `${values.map(item => `${item.category || ''} ${item.text || ''}`).join(' ')} ${sourceText}`.toLowerCase();
}

const boilerRequirements = [
  { id: 'boiler-position', label: 'Boiler position', pattern: /boiler[^.]{0,80}(position|location|same place|same location|cupboard)|\b(position|location)\b[^.]{0,80}boiler/, targetSection: 'New boiler and controls', responses: ['Install boiler in the existing position.', 'Install boiler in a different position in the same room.', 'Install boiler in a different room.', 'TO CONFIRM: Proposed boiler position has not been established.'] },
  { id: 'flue', label: 'Flue', pattern: /\bflue\b|terminal|plume/, targetSection: 'Flue', responses: ['Reuse the existing flue route/opening.', 'Install a new horizontal flue route.', 'Install flue vertically, then horizontally through the external wall.', 'TO CONFIRM: Flue route has not been established.'] },
  { id: 'condensate', label: 'Condensate', pattern: /condensate|condensulate/, targetSection: 'Pipe work', responses: ['Reuse the existing condensate route.', 'Route condensate internally to waste.', 'Route condensate externally to a suitable termination.', 'Fit a condensate pump.', 'TO CONFIRM: Condensate route has not been established.'] },
  { id: 'gas', label: 'Gas supply', pattern: /gas meter|gas pipe|gas run|gas supply|\bgas\b/, targetSection: 'Pipe work', responses: ['Retain the existing gas supply route.', 'Install a new or upgraded gas supply run.', 'TO CONFIRM: Gas supply route has not been established.'] },
  { id: 'controls', label: 'Controls', pattern: /control|thermostat|programmer|room stat|smart heating/, targetSection: 'New boiler and controls', responses: ['Retain the existing controls.', 'Install Hive/smart heating controls.', 'Replace the existing heating controls.', 'TO CONFIRM: Controls have not been established.'] },
  { id: 'electrical', label: 'Electrical supply', pattern: /electrical|electric|consumer unit|fused spur|master fuse/, targetSection: 'New boiler and controls', responses: ['Retain the existing boiler electrical supply.', 'Provide a new boiler supply from the consumer unit.', 'Provide or replace the boiler fused spur.', 'TO CONFIRM: Boiler electrical supply has not been established.'] }
];

const coreRequirements = [
  { id: 'customer-needs', label: 'Customer wants and needs', pattern: /customer.{0,30}(want|need|prefer|priority)|reason for change|requested outcome|large family/, targetSection: 'Needs', responses: ['Customer wants a like-for-like boiler replacement.', 'Customer wants improved heating reliability.', 'Customer wants improved heating or hot-water performance.', 'TO CONFIRM: Customer wants and needs have not been recorded.'] },
  { id: 'existing-system', label: 'Existing system', pattern: /existing|current boiler|current system|open.?vented|sealed system|combi|regular boiler|system boiler/, targetSection: 'System characteristics', responses: ['Existing combination-boiler system.', 'Existing regular/open-vented system.', 'Existing system-boiler/sealed system.', 'TO CONFIRM: Existing system type has not been established.'] }
];

export function communicationSafeguards(interpretation, option, photos = [], sourceText = '') {
  const corpus = evidenceText(interpretation, option, sourceText);
  const boilerProposal = /boiler|combi/.test((option?.facts || []).map(item => `${item.category || ''} ${item.text || ''}`).join(' ').toLowerCase());
  const requirements = boilerProposal ? [...coreRequirements, ...boilerRequirements] : coreRequirements;
  const gaps = requirements.filter(item => !item.pattern.test(corpus)).map(item => ({
    id: `safeguard-${item.id}`,
    originalText: item.label,
    text: `I could not establish ${item.label.toLowerCase()} from the survey evidence.`,
    reason: 'Add a comment if this was discussed, or leave it unresolved and continue.',
    evidenceRelation: '',
    targetSection: item.targetSection,
    checked: false,
    manual: false,
    removed: false,
    kind: 'informationGap',
    includeInNotes: false
  }));
  if (boilerProposal) {
    const photoText = photos.map(photo => `${photo.subject || ''} ${photo.caption || ''}`).join(' ').toLowerCase();
    if (!/\bflue\b|terminal|plume/.test(photoText)) gaps.push({
      id: 'safeguard-flue-photo',
      originalText: 'No flue photograph is attached to this Visit.',
      text: 'No flue photograph is attached to this Visit.',
      reason: 'A flue photograph normally helps the engineer understand the proposed arrangement.',
      evidenceRelation: 'No photograph tagged or captioned Flue was found.',
      targetSection: 'Flue',
      checked: false,
      manual: false,
      removed: false,
      kind: 'informationGap',
      includeInNotes: false
    });
  }
  return gaps;
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
