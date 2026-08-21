const clean = value => String(value || '').trim();
const corpus = item => `${item?.category || ''} ${item?.text || ''}`.toLowerCase();

function stableId(value) {
  let hash = 2166136261;
  for (const character of String(value).toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `intent-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function intentFact({ type, text, origin, evidence, supporting = [evidence], state = 'captured' }) {
  const evidenceQuote = clean(evidence?.evidenceQuote || evidence?.text);
  const supportingFacts = supporting.filter(Boolean);
  return {
    id: stableId(`${type}|${text}|${supportingFacts.map(item => item.id || item.evidenceQuote).join('|')}`),
    category: type === 'want' ? 'Customer want' : 'Customer need',
    text,
    evidenceQuote,
    evidenceSource: evidence?.evidenceSource || 'transcript',
    evidenceState: state,
    intentType: type,
    intentOrigin: origin,
    supportingFactIds: supportingFacts.map(item => item.id).filter(Boolean),
    supportingEvidenceQuotes: supportingFacts.map(item => clean(item.evidenceQuote || item.text)).filter(Boolean)
  };
}

function isCustomerIntent(item) {
  return /customer|household|client|reason for change|requested outcome|priority/.test(corpus(item));
}

export function explicitCustomerIntents(sharedFacts = []) {
  const wants = [], needs = [];
  for (const fact of sharedFacts) {
    const value = corpus(fact);
    const factText = clean(fact.text).toLowerCase();
    if (!isCustomerIntent(fact)) continue;
    const functionalNeed = /\bcustomer.{0,30}(?:need|needs|require|requires|wants reliable)|\b(?:accessibility requirement)\b/.test(factText);
    const preference = /\b(?:want|wants|would like|asked|prefer|preference|priority|gain|remove|space|hide|move|brand|control)\b/.test(factText);
    if (functionalNeed) needs.push(intentFact({ type: 'need', text: fact.text, origin: 'customerStated', evidence: fact }));
    else if (preference) wants.push(intentFact({ type: 'want', text: fact.text, origin: 'customerStated', evidence: fact }));
  }
  return { wants, needs };
}

export function deriveCustomerNeeds({ sharedFacts = [], options = [], rejectedAlternatives = [] } = {}) {
  const all = [...sharedFacts, ...options.flatMap(option => option.facts || []), ...rejectedAlternatives];
  const find = pattern => all.find(item => pattern.test(corpus(item)));
  const results = [];
  const add = (text, supporting) => {
    if (!supporting?.length || results.some(item => item.text === text)) return;
    results.push(intentFact({ type: 'need', text, origin: 'derivedFromEvidence', evidence: supporting[0], supporting, state: 'derivedRequirement' }));
  };

  const failure = find(/\b(?:boiler|heating|hot water|appliance)\b.{0,80}\b(?:failed|inoperative|not working|broken down)\b|\b(?:failed|inoperative|not working|broken down)\b.{0,80}\b(?:boiler|heating|hot water|appliance)\b/);
  if (failure) add('The proposed solution needs to restore the heating and hot-water service affected by the recorded appliance failure.', [failure]);

  const bathShower = find(/\b(?:uses?|requires?|needs?)\b.{0,60}\bbath\b.{0,40}\bshower\b|\bbath\b.{0,40}\bshower\b/);
  if (bathShower) add('The proposed solution needs to support the household’s recorded bath and shower use.', [bathShower]);

  const water = find(/\b(?:water|mains|flow|pressure)\b.{0,100}\b(?:measur|reported|poor|low|approximately|litres|l\/min|bar)\b|\b(?:measur|reported|poor|low)\b.{0,100}\b(?:water|flow|pressure)\b/);
  if (water) add('The proposed solution needs to account for the recorded incoming-water performance.', [water]);

  const combiGas = find(/\b(?:gas|supply)\b.{0,100}\b(?:inadequate|unsuitable|upgrade)\b.{0,60}\bcombi\b|\bcombi\b.{0,100}\b(?:gas|supply)\b.{0,80}\b(?:inadequate|unsuitable|upgrade)\b/);
  const combiWater = find(/\bcombi\b.{0,100}\b(?:water|flow|pressure|shower)\b.{0,80}\b(?:questioned|inadequate|unsuitable|poor|low|marginal)\b|\b(?:water|flow|pressure|shower)\b.{0,100}\bcombi\b.{0,80}\b(?:questioned|inadequate|unsuitable|poor|low|marginal)\b/);
  if (combiGas || combiWater) add('The selected proposal must not assume combi performance unsupported by the recorded water or gas evidence.', [combiWater, combiGas].filter(Boolean));

  return results;
}

export function buildCustomerIntent(interpretation) {
  const explicit = explicitCustomerIntents(interpretation.sharedFacts || []);
  const derived = deriveCustomerNeeds(interpretation);
  const unique = values => [...new Map(values.map(item => [item.id || `${item.intentType}|${item.text}`, item])).values()];
  return { wants: unique(explicit.wants), needs: unique([...explicit.needs, ...derived]) };
}

export function customerIntentLabel(item) {
  if (item?.intentType === 'want') return 'CUSTOMER WANT';
  if (item?.intentOrigin === 'derivedFromEvidence') return 'DERIVED REQUIREMENT';
  if (item?.intentOrigin === 'surveyorStated') return 'SURVEYOR REQUIREMENT';
  if (item?.intentOrigin === 'provisional') return 'PROVISIONAL NEED';
  return 'CUSTOMER-STATED NEED';
}
