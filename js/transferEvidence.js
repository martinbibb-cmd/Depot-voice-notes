export function trustworthyTransferredFacts(payload) {
  return (payload?.facts || payload?.observations || []).filter(item => {
    if (typeof item === 'string') return true;
    if (Number(payload?.schemaVersion || 1) >= 2) return true;
    return ['capturedFact', 'derivedFact', 'assumption'].includes(item?.state);
  });
}
