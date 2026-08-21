export function initialiseChecklist(existing, generated) {
  return existing || generated;
}

export function confirmedChecklistItems(state) {
  return (state?.items || []).filter(item => item.checked && !item.removed && item.includeInNotes !== false).map(item => ({
    text: item.text,
    targetSection: item.targetSection,
    manual: Boolean(item.manual),
    originalText: item.originalText,
    evidenceQuote: item.evidenceRelation || '',
    evidenceSource: item.evidenceSource || (item.manual ? 'surveyor' : 'captured evidence')
  }));
}

export function serialiseChecklists(checklists) {
  return Object.fromEntries(checklists);
}

export function restoreChecklists(value) {
  return new Map(Object.entries(value || {}));
}
