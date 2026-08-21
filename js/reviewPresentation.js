const text = value => String(value || '').trim();
const corpus = item => `${item?.category || ''} ${item?.text || ''}`.toLowerCase();
const numeric = item => /\d+(?:\.\d+)?\s*(?:mm|m\b|bar|l\/min|litres?\/min|kw|°c|minutes?|hours?)/i.test(text(item?.text));

export const REVIEW_GROUPS = [
  { id: 'decision', title: 'Decision', description: 'What the customer wants and what is being proposed.' },
  { id: 'measurements', title: 'Key measurements', description: 'Recorded values that affect the job.' },
  { id: 'work', title: 'Works and restrictions', description: 'Routes, access, enabling work and disruption.' },
  { id: 'unresolved', title: 'Check before leaving', description: 'Missing or uncertain information that needs attention.' },
  { id: 'other', title: 'Other captured details', description: 'Useful supporting facts, kept out of the main path.' }
];

export function confirmationGroup(item) {
  const value = corpus(item);
  if (item?.kind === 'informationGap' || item?.evidenceState === 'uncertain' || /unknown|uncertain|to confirm|not established/.test(value)) return 'unresolved';
  if (/customer.*(want|need|prefer|priority)|reason for change|requested outcome|propos|recommend|selected|reject|unsuitable|inadequate/.test(value)) return 'decision';
  if (numeric(item)) return 'measurements';
  if (/flue|gas|condens|pipe|route|access|restrict|hazard|scaffold|floor|boxing|cupboard|furniture|drill|disruption|customer action|prep|boiler|radiator|cylinder/.test(value)) return 'work';
  return 'other';
}

export function confirmationPriority(item) {
  if (item?.kind === 'informationGap') return 0;
  if (item?.evidenceState === 'uncertain') return 1;
  const group = confirmationGroup(item);
  return ({ decision: 2, measurements: 3, work: 4, other: 5 })[group] ?? 5;
}

export function evidenceStateLabel(item) {
  if (item?.kind === 'informationGap') return 'MISSING';
  if (item?.evidenceState === 'uncertain') return 'UNCERTAIN';
  if (item?.evidenceState === 'derivedSuggestion') return 'SUGGESTED WORK';
  if (item?.manual) return 'SURVEYOR ADDED';
  if (item?.evidenceSource === 'capturedEvidence') return numeric(item) ? 'MEASURED' : 'CAPTURED';
  return 'FROM CONVERSATION';
}

export function buildVisitBrief(interpretation, selectedOption = null) {
  const shared = interpretation?.sharedFacts || [];
  const option = selectedOption || (interpretation?.options || []).find(item => item.status === 'preferred') || interpretation?.options?.[0];
  const rejected = interpretation?.rejectedAlternatives || [];
  const uncertainties = interpretation?.uncertainties || [];
  const optionFacts = option?.facts || [];
  const proposalFacts = optionFacts.filter(item => /propos|recommend|replace|install|retain|boiler|system/i.test(corpus(item)));
  const proposalIds = new Set(proposalFacts.map(item => item.id || text(item.text)));
  const find = pattern => shared.filter(item => pattern.test(corpus(item)));
  const unique = values => [...new Map(values.filter(Boolean).map(item => [item.id || text(item.text), item])).values()];
  return [
    { id: 'customer', title: 'Customer wants', items: find(/customer.*(want|need|prefer|priority)|reason for change|requested outcome/) },
    { id: 'existing', title: 'What we found', items: find(/existing|current|measur|pressure|flow|failed|condition|reported|customer uses|bath|shower/) },
    { id: 'alternatives', title: 'Options considered', items: unique([...(interpretation?.options || []).filter(item => item.id !== option?.id).flatMap(item => item.facts || []), ...rejected]) },
    { id: 'proposal', title: 'Selected proposal', items: proposalFacts },
    { id: 'why', title: 'Why', items: unique([...optionFacts.filter(item => item.relationship), ...rejected.filter(item => item.reason)]) },
    { id: 'measurements', title: 'Key measurements', items: unique([...shared, ...optionFacts].filter(numeric)) },
    { id: 'work', title: 'Likely work', items: optionFacts.filter(item => !proposalIds.has(item.id || text(item.text)) && /install|replace|fit|route|flue|condens|gas|pipe|filter|control|hive|radiator|cylinder/i.test(corpus(item))) },
    { id: 'restrictions', title: 'Restrictions', items: unique([...shared, ...optionFacts].filter(item => /access|scaffold|floor|boxing|cupboard|furniture|drill|restrict|hazard|disruption/i.test(corpus(item)))) },
    { id: 'missing', title: 'Check before leaving', items: uncertainties }
  ];
}
