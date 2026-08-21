const text = value => String(value || '').trim();
const corpus = item => `${item?.category || ''} ${item?.text || ''}`.toLowerCase();
const numeric = item => /\d+(?:\.\d+)?\s*(?:mm|m\b|bar|l\/min|litres?\/min|kw|°c|minutes?|hours?)/i.test(text(item?.text));

export const REVIEW_GROUPS = [
  { id: 'decision', title: 'Decision', description: 'What the customer wants and what is being proposed.' },
  { id: 'measurements', title: 'Key measurements', description: 'Recorded values that affect the job.' },
  { id: 'work', title: 'Works and restrictions', description: 'Routes, access, enabling work and disruption.' },
  { id: 'unresolved', title: 'Resolve for quote', description: 'Missing or uncertain information that may affect the quote or handover.' },
  { id: 'other', title: 'Other captured details', description: 'Useful supporting facts, kept out of the main path.' }
];

export function confirmationGroup(item) {
  const value = corpus(item);
  if (item?.kind === 'informationGap' || item?.evidenceState === 'uncertain' || /unknown|uncertain|to confirm|not established/.test(value)) return 'unresolved';
  if (item?.intentType === 'want' || item?.intentType === 'need') return 'decision';
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
  if (item?.intentType === 'want') return 'CUSTOMER WANT';
  if (item?.intentType === 'need' && item?.intentOrigin === 'derivedFromEvidence') return 'DERIVED REQUIREMENT';
  if (item?.intentType === 'need') return 'CUSTOMER-STATED NEED';
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
  const wants = interpretation?.customerIntent?.wants || [];
  const needs = interpretation?.customerIntent?.needs || [];
  const find = pattern => shared.filter(item => pattern.test(corpus(item)));
  const unique = values => [...new Map(values.filter(Boolean).map(item => [item.id || text(item.text), item])).values()];
  const claimed = new Set();
  const take = values => unique(values).filter(item => {
    const key = item.id || text(item.text);
    if (claimed.has(key)) return false;
    claimed.add(key); return true;
  });
  const customer = take(wants.length ? wants : find(/customer.*(want|prefer|priority)|reason for change|requested outcome/));
  const installationNeeds = take(needs);
  const proposal = take(optionFacts.filter(item => /propos|recommend|replace.*boiler|install.*boiler|retain.*(?:system|cylinder)|selected|same type/i.test(corpus(item))));
  const measurements = take([...shared, ...optionFacts].filter(numeric));
  const restrictions = take([...shared, ...optionFacts].filter(item => /access|scaffold|floor|boxing|cupboard|furniture|drill|restrict|hazard|disruption/i.test(corpus(item))));
  const existing = take(find(/existing|current|pressure|flow|failed|condition|reported|customer uses|bath|shower/).filter(item => !numeric(item)));
  const alternatives = take([...(interpretation?.options || []).filter(item => item.id !== option?.id).flatMap(item => item.facts || []), ...rejected]);
  const why = take([...optionFacts.filter(item => item.relationship), ...rejected.filter(item => item.reason)]);
  const work = take(optionFacts.filter(item => /install|replace|fit|route|flue|condens|gas|pipe|filter|control|hive|radiator|cylinder/i.test(corpus(item))));
  return [
    { id: 'customer', title: 'Customer wants', items: customer },
    { id: 'needs', title: 'Installation needs', items: installationNeeds },
    { id: 'existing', title: 'What we found', items: existing },
    { id: 'alternatives', title: 'Options considered', items: alternatives },
    { id: 'proposal', title: 'Selected proposal', items: proposal },
    { id: 'why', title: 'Why', items: why },
    { id: 'measurements', title: 'Key measurements', items: measurements },
    { id: 'work', title: 'Likely work', items: work },
    { id: 'restrictions', title: 'Restrictions', items: restrictions },
    { id: 'missing', title: 'Resolve for quote', items: uncertainties }
  ];
}
