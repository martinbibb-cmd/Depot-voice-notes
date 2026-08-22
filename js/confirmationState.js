export function initialiseChecklist(existing, generated) {
  return existing || generated;
}

export function confirmedChecklistItems(state) {
  return (state?.items || []).filter(item => item.checked && !item.removed && item.includeInNotes !== false).map(item => ({
    id: item.id,
    factId: item.factId || item.id,
    text: item.canonicalMeaning || item.text,
    sourceQuote: item.sourceQuote || item.evidenceRelation || '',
    canonicalMeaning: item.canonicalMeaning || item.text,
    displayText: item.displayText || '',
    category: item.category || '',
    targetSection: item.targetSection,
    manual: Boolean(item.manual),
    originalText: item.originalText,
    evidenceQuote: item.evidenceRelation || '',
    evidenceSource: item.evidenceSource || (item.manual ? 'surveyor' : 'captured evidence'),
    evidenceState: item.evidenceState || (item.manual ? 'surveyorAdded' : 'captured'),
    surveyorConfirmed: true,
    relationship: item.relationship || null,
    intentType: item.intentType || null,
    intentOrigin: item.intentOrigin || null,
    supportingFactIds: item.supportingFactIds || [],
    supportingEvidenceQuotes: item.supportingEvidenceQuotes || []
  }));
}

export function visualSelection(state, component, field) {
  return (state?.items || []).find(item => !item.removed && item.visualComponent === component && item.visualField === field) || null;
}

export function advisoryDecision(state, advisoryId) {
  return state?.advisoryDecisions?.[advisoryId] || null;
}

export function setAdvisoryDecision(state, advisoryId, decision, answer = '') {
  state.advisoryDecisions ||= {};
  state.advisoryDecisions[advisoryId] = {
    decision,
    answer: String(answer || '').trim(),
    evidenceSource: 'surveyorConfirmation',
    updatedAt: new Date().toISOString()
  };
  return state.advisoryDecisions[advisoryId];
}

export function applyVisualSelection(state, selection) {
  state.items ||= [];
  const key = `visual-${selection.component}-${selection.field}`;
  state.items.forEach(item => {
    if (item.visualComponent === selection.component && item.visualField === selection.field) item.removed = true;
    if ((selection.affectedFactIds || []).includes(item.factId || item.id)) {
      item.includeInNotes = false;
      item.visualSupersededBy = key;
    }
  });
  const item = {
    id: key,
    factId: key,
    kind: 'evidenceFact',
    checked: true,
    removed: false,
    includeInNotes: true,
    manual: true,
    text: selection.text,
    originalText: selection.originalText || '',
    sourceQuote: (selection.evidenceQuotes || []).join(' | '),
    canonicalMeaning: selection.text,
    displayText: selection.text,
    targetSection: selection.targetSection,
    evidenceSource: 'surveyorVisualCorrection',
    evidenceState: selection.value === 'Unresolved' ? 'uncertain' : 'surveyorConfirmed',
    evidenceRelation: (selection.evidenceQuotes || []).join(' | '),
    supportingFactIds: selection.affectedFactIds || [],
    supportingEvidenceQuotes: selection.evidenceQuotes || [],
    visualComponent: selection.component,
    visualField: selection.field,
    visualValue: selection.value,
    updatedAt: new Date().toISOString()
  };
  state.items.push(item);
  return item;
}

export function applySurveyorCorrection(state, original, correctedText) {
  state.items ||= [];
  const originalId = original?.factId || original?.id || '';
  const id = `correction-${originalId || Date.now()}`;
  const existing = state.items.find(item => (item.factId || item.id) === originalId);
  if (existing) { existing.removed = true; existing.includeInNotes = false; existing.supersededBy = id; }
  const correction = {
    id, factId:id, kind:'evidenceFact', checked:true, removed:false, includeInNotes:true, manual:true,
    text:String(correctedText || '').trim(), originalText:original?.text || original?.originalText || '',
    sourceQuote:'Surveyor correction', canonicalMeaning:String(correctedText || '').trim(), displayText:String(correctedText || '').trim(),
    targetSection:original?.targetSection || 'Office notes', evidenceSource:'surveyorCorrection', evidenceState:'surveyorConfirmed',
    evidenceRelation:'Surveyor correction', supportingFactIds:originalId ? [originalId] : [], supportingEvidenceQuotes:original?.evidenceRelation ? [original.evidenceRelation] : [],
    correctedFactId:originalId, updatedAt:new Date().toISOString()
  };
  state.items.push(correction);
  return correction;
}

export function serialiseChecklists(checklists) {
  return Object.fromEntries(checklists);
}

export function restoreChecklists(value) {
  return new Map(Object.entries(value || {}));
}
