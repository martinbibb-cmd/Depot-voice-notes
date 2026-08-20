function evidenceText(interpretation, option) {
  const values = [
    ...(interpretation?.sharedFacts || []),
    ...(option?.facts || [])
  ];
  return values.map(item => `${item.category || ''} ${item.text || ''}`).join(' ').toLowerCase();
}

const boilerRequirements = [
  { id: 'boiler-position', label: 'Boiler position', pattern: /boiler[^.]{0,80}(position|location|same place|same location|cupboard)|\b(position|location)\b[^.]{0,80}boiler/, targetSection: 'New boiler and controls' },
  { id: 'flue', label: 'Flue', pattern: /\bflue\b|terminal|plume/, targetSection: 'Flue' },
  { id: 'condensate', label: 'Condensate', pattern: /condensate|condensulate/, targetSection: 'Pipe work' },
  { id: 'gas', label: 'Gas supply', pattern: /gas meter|gas pipe|gas run|gas supply|\bgas\b/, targetSection: 'Pipe work' },
  { id: 'controls', label: 'Controls', pattern: /control|thermostat|programmer|room stat|smart heating/, targetSection: 'New boiler and controls' },
  { id: 'electrical', label: 'Electrical supply', pattern: /electrical|electric|consumer unit|fused spur|master fuse/, targetSection: 'New boiler and controls' }
];

const coreRequirements = [
  { id: 'customer-needs', label: 'Customer wants and needs', pattern: /customer.{0,30}(want|need|prefer|priority)|reason for change|requested outcome|large family/, targetSection: 'Needs' },
  { id: 'existing-system', label: 'Existing system', pattern: /existing|current boiler|current system|open.?vented|sealed system|combi|regular boiler|system boiler/, targetSection: 'System characteristics' }
];

export function communicationSafeguards(interpretation, option, photos = []) {
  const corpus = evidenceText(interpretation, option);
  const boilerProposal = /boiler|combi/.test((option?.facts || []).map(item => `${item.category || ''} ${item.text || ''}`).join(' ').toLowerCase());
  const requirements = boilerProposal ? [...coreRequirements, ...boilerRequirements] : coreRequirements;
  const gaps = requirements.filter(item => !item.pattern.test(corpus)).map(item => ({
    id: `safeguard-${item.id}`,
    originalText: `TO CONFIRM: ${item.label} information has not been recorded.`,
    text: `TO CONFIRM: ${item.label} information has not been recorded.`,
    reason: `The selected proposal needs ${item.label.toLowerCase()} information for a complete handover.`,
    evidenceRelation: 'No matching canonical visit fact was found.',
    targetSection: item.targetSection,
    checked: false,
    manual: false,
    removed: false,
    kind: 'communicationGap',
    includeInNotes: true
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
      kind: 'evidenceGap',
      includeInNotes: false
    });
  }
  return gaps;
}

export function mergeSafeguards(state, safeguards) {
  const result = state || { items: [] };
  const existing = new Set((result.items || []).map(item => item.id));
  result.items = [...(result.items || []), ...safeguards.filter(item => !existing.has(item.id))];
  return result;
}

export function unresolvedSafeguards(state) {
  return (state?.items || []).filter(item => /Gap$/.test(item.kind || '') && !item.checked);
}
