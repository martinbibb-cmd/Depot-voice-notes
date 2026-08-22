export function proposalMissing(interpreted) {
  return !Array.isArray(interpreted?.options) || interpreted.options.length === 0;
}

export function addSurveyorProposal(interpreted, identifier = 'surveyor-proposal-1') {
  if (!interpreted) throw new Error('Interpret the captured survey before creating a proposal.');
  if (!proposalMissing(interpreted)) return interpreted.options[0];

  const option = {
    id: identifier,
    name: 'Option 1',
    title: 'Option 1',
    summary: '',
    status: 'preferred',
    facts: [],
    customerAdvisories: [],
    surveyorCreated: true
  };
  interpreted.options = [option];
  return option;
}
