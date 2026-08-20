export const BREEZE_PACKAGES = [
  ['combi-same','Combi replacement — same position',3],['combi-same-room','Combi replacement — different position, same room',9],['combi-same-floor','Combi replacement — different room, same floor',8],['combi-one-floor','Combi replacement — one floor away',10],['combi-two-floors','Combi replacement — two floors away',12],
  ['conv-same','Conventional replacement — same position',2],['conv-same-room','Conventional replacement — different position, same room',5],['conv-same-floor','Conventional replacement — different room, same floor',4],['conv-one-floor','Conventional replacement — one floor away',6],['conv-two-floors','Conventional replacement — two floors away',8],
  ['conv-pumped-same','Conventional replacement, convert to fully pumped — same position',5],['conv-pumped-same-room','Conventional replacement, convert to fully pumped — different position, same room',8],['conv-pumped-same-floor','Conventional replacement, convert to fully pumped — different room, same floor',7],['conv-pumped-one-floor','Conventional replacement, convert to fully pumped — one floor away',9],['conv-pumped-two-floors','Conventional replacement, convert to fully pumped — two floors away',11],
  ['conv-combi-same','Conventional to combi — same position',7],['conv-combi-same-room','Conventional to combi — different position, same room',11],['conv-combi-same-floor','Conventional to combi — different room, same floor',10],['conv-combi-one-floor','Conventional to combi — one floor away',12],['conv-combi-two-floors','Conventional to combi — two floors away',14]
].map(([id, description, includedSaleLengths]) => ({ id, description, includedSaleLengths }));

const multiplier = service => ['heatingFlowReturn','primaryFlowReturn'].includes(service) ? 2 : 1;
const serviceName = service => ({ heatingFlowReturn:'Heating flow & return', primaryFlowReturn:'Primary flow & return', hotWater:'Hot water', coldWater:'Cold water', gas:'Gas', condensate:'Condensate', pressureReliefDischarge:'Pressure relief/discharge' }[service] || 'Other pipework');

export function pipeRequirement(pipeRuns = []) {
  const runs = pipeRuns.map(run => {
    const physicalMetres = (run.segmentLengthsMetres || []).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const tubeMetres = Math.max(0, physicalMetres * multiplier(run.service) + (Number(run.manualCorrectionMetres) || 0));
    const roundedMetres = tubeMetres ? Math.ceil(tubeMetres / 2) * 2 : 0;
    return { service: run.service, label: serviceName(run.service), physicalMetres, multiplier: multiplier(run.service), roundedMetres, saleLengths: Math.ceil(roundedMetres / 2) };
  });
  return { runs, totalRoundedMetres: runs.reduce((sum, run) => sum + run.roundedMetres, 0), totalSaleLengths: runs.reduce((sum, run) => sum + run.saleLengths, 0) };
}

export function inferredPrimaryRequirement(proposal, existingRuns = []) {
  if (existingRuns.some(run => run.service === 'primaryFlowReturn')) return null;
  const text = (proposal?.facts || []).map(fact => fact.text || '').join(' ');
  if (!/primar(?:y|ies)/i.test(text)) return null;
  const match = text.match(/(?:cross|run|route|span)[^.;]{0,50}?(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)/i) || text.match(/(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)[^.;]{0,50}?primar/i);
  if (!match) return null;
  const physicalMetres = Number(match[1]);
  const roundedMetres = Math.ceil(physicalMetres * 2 / 2) * 2;
  return { service:'primaryFlowReturn', label:'Primary flow & return (recorded estimate)', physicalMetres, multiplier:2, roundedMetres, saleLengths:Math.ceil(roundedMetres / 2), inferred:true };
}

export function suggestPackage(proposal, requiredSaleLengths) {
  const text = [proposal?.title, ...(proposal?.facts || []).map(f => f.text)].filter(Boolean).join(' ').toLowerCase();
  const family = /(?:convert|conversion|change)[^.;]{0,30}(?:to|into) (?:a )?combi|conventional to combi/.test(text) ? 'conv-combi' : /fully pumped/.test(text) ? 'conv-pumped' : /\bcombi\b/.test(text) ? 'combi' : /\b(?:regular|system|conventional) boiler\b/.test(text) ? 'conv' : null;
  if (!family) return null;
  const position = /two floors?|2 floors?/.test(text) ? 'two-floors' : /one floor|1 floor/.test(text) ? 'one-floor' : /different room|another room/.test(text) ? 'same-floor' : /different position|relocat|move(?:d| the boiler)/.test(text) ? 'same-room' : /same (?:location|position)|existing (?:location|position|cupboard)/.test(text) ? 'same' : null;
  if (!position) return null;
  const selected = BREEZE_PACKAGES.find(item => item.id === `${family}-${position}`);
  return selected ? { ...selected, requiredSaleLengths, possibleAdditionalSaleLengths: Math.max(0, requiredSaleLengths - selected.includedSaleLengths) } : null;
}
