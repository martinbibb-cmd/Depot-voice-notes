import test from 'node:test';
import assert from 'node:assert/strict';
import { hasStructuredSurvey, interpretationFromStructuredVisit, interpretationRequiresRefresh, structuredEvidence } from '../js/structuredVisit.js';

test('structured discharge remains separate from condensate and maps to installation pipework', () => {
  const payload = { schemaVersion:3, structuredVisit:{ existing:[], customer:[], measurements:[], evidence:[], proposals:[{
    id:'option-1', name:'Option 1', isSelected:true, components:[
      { id:'cond', section:'condensate', action:'retain', selectedNotes:[] },
      { id:'discharge', section:'discharge', action:'replace', selectedNotes:[{ id:'note', confirmed:true, text:'Alter existing discharge pipework.' }] }
    ]
  }] } };
  const result = interpretationFromStructuredVisit(payload);
  const option = result.options[0];
  assert(option.facts.some(item => item.category === 'Condensate' && /Retain/.test(item.canonicalMeaning)));
  assert(option.facts.some(item => item.category === 'Discharge' && /Alter existing discharge/.test(item.canonicalMeaning)));
  assert(option.facts.filter(item => item.category === 'Discharge').every(item => item.targetSection === 'Pipe work'));
});

function payload() {
  return {
    schemaVersion: 3,
    structuredVisit: {
      existing: [{ id: 'existing-boiler', section: 'boiler', type: 'System', position: 'Kitchen cupboard', completion: 'complete' }],
      customer: [
        { id: 'want', kind: 'want', text: 'Gain loft space', origin: 'customerStatement', confirmed: true },
        { id: 'need', kind: 'derivedNeed', text: 'Retain reliable bath and shower hot water', origin: 'derivedRequirement', confirmed: true },
        { id: 'unconfirmed', kind: 'preference', text: 'Possibly hide every pipe', origin: 'customerStatement', confirmed: false }
      ],
      measurements: [
        { id: 'flow', layer: 'existing', section: 'water', kind: 'flow', value: 10, unit: 'L/min', qualifier: 'approximate', sourceText: 'about 10 litres a minute' },
        { id: 'system-gas', layer: 'proposed', section: 'gas', proposalOptionID: 'system', kind: 'pipeSize', value: 22, unit: 'mm', qualifier: 'exact', sourceText: '22 mil gas' },
        { id: 'combi-gas', layer: 'proposed', section: 'gas', proposalOptionID: 'combi', kind: 'pipeSize', value: 28, unit: 'mm', qualifier: 'exact', sourceText: '28 mil for the combi' }
      ],
      proposals: [
        { id: 'system', name: 'Option 1', isSelected: true, components: [
          { id: 'boiler', section: 'boiler', type: 'System', action: 'replace', positionOrRoute: 'Same position', selectedNotes: [] },
          { id: 'gas', section: 'gas', specification: '22 mm', action: 'retain', selectedNotes: [{ id: 'note', libraryID: 'gas.retain', text: 'Retain existing gas supply.', confirmed: true }] }
        ] },
        { id: 'combi', name: 'Option 2', isSelected: false, components: [
          { id: 'boiler2', section: 'boiler', type: 'Combi', action: 'replace', selectedNotes: [] },
          { id: 'gas2', section: 'gas', specification: '28 mm', action: 'replace', selectedNotes: [] }
        ] }
      ], evidence: []
    }
  };
}

test('structured survey is a primary interpretation source with Wants and Needs preserved', () => {
  const input = payload();
  assert.equal(hasStructuredSurvey(input), true);
  const result = interpretationFromStructuredVisit(input);
  assert.equal(result.sourceMode, 'structuredVisit');
  assert.ok(result.sharedFacts.some(fact => fact.category === 'Want' && fact.text === 'Gain loft space'));
  assert.ok(result.sharedFacts.some(fact => fact.category === 'Derived Need' && fact.text.includes('bath and shower')));
  assert.ok(!result.sharedFacts.some(fact => fact.text.includes('hide every pipe')));
});

test('a transcript-era processing state cannot shadow a newer structured Visit', () => {
  const input = payload();
  const stale = {
    interpretationVersion: 12,
    sharedFacts: [],
    options: [{ id: 'empty-shell', facts: [] }]
  };
  assert.equal(hasStructuredSurvey(input), true);
  assert.equal(interpretationRequiresRefresh(input, stale), true);

  const current = interpretationFromStructuredVisit(input);
  assert.equal(interpretationRequiresRefresh(input, current), false);
  assert.ok(current.options[0].facts.length > 0);
});

test('proposal options remain isolated and approved notes remain grounded selections', () => {
  const result = interpretationFromStructuredVisit(payload());
  const system = result.options.find(option => option.id === 'system');
  const combi = result.options.find(option => option.id === 'combi');
  assert.ok(system.facts.some(fact => fact.text.includes('22 mm')));
  assert.ok(system.facts.some(fact => fact.text === 'Retain existing gas supply.'));
  assert.ok(!system.facts.some(fact => fact.text.includes('28 mm')));
  assert.ok(combi.facts.some(fact => fact.text.includes('28 mm')));
  assert.equal(system.status, 'preferred');
  assert.equal(combi.status, 'alternative');
});

test('structured evidence is readable audit material without requiring a transcript', () => {
  const lines = structuredEvidence(payload());
  assert.ok(lines.some(line => line.includes('Existing — Boiler: System')));
  assert.ok(lines.some(line => line.includes('Option 1 [selected]')));
  assert.ok(lines.some(line => line.includes('approved note: Retain existing gas supply.')));
  assert.ok(lines.some(line => line.includes('approximately 10 L/min')));
});

test('structured measurements preserve exact values, qualifiers and source evidence', () => {
  const result = interpretationFromStructuredVisit(payload());
  const flow = result.sharedFacts.find(item => item.id === 'structured-measurement-flow');
  assert.equal(flow.text, 'Flow: approximately 10 L/min');
  assert.equal(flow.sourceQuote, 'about 10 litres a minute');
  const system = result.options.find(option => option.id === 'system');
  const gas = system.facts.find(item => item.id === 'structured-measurement-system-gas');
  assert.equal(gas.text, 'Pipe Size: 22 mm');
  assert.equal(gas.sourceQuote, '22 mil gas');
});

test('option-scoped measurements never leak between proposals', () => {
  const result = interpretationFromStructuredVisit(payload());
  const system = result.options.find(option => option.id === 'system');
  const combi = result.options.find(option => option.id === 'combi');
  assert.ok(system.facts.some(item => item.text === 'Pipe Size: 22 mm'));
  assert.ok(!system.facts.some(item => item.text === 'Pipe Size: 28 mm'));
  assert.ok(combi.facts.some(item => item.text === 'Pipe Size: 28 mm'));
  assert.ok(!combi.facts.some(item => item.text === 'Pipe Size: 22 mm'));
});

test('structured interpretation attaches deterministic advisories to their proposal only', () => {
  const input = payload();
  input.structuredVisit.measurements.find(item => item.id === 'flow').qualifier = 'exact';
  input.structuredVisit.measurements.find(item => item.id === 'flow').sourceText = '10 litres a minute';
  input.structuredVisit.measurements.push({ id:'pressure', layer:'existing', section:'water', kind:'dynamicPressure', value:2, unit:'bar', qualifier:'exact' });
  input.structuredVisit.existing.push({ id:'hot-water', section:'hotWater', type:'Vented cylinder' });
  input.structuredVisit.proposals.find(item => item.id === 'system').components.push({ id:'stored', section:'hotWater', action:'retain', type:'Vented cylinder' });
  input.structuredVisit.proposals.find(item => item.id === 'combi').components.push({ id:'remove-cylinder', section:'hotWater', action:'remove' });
  const result = interpretationFromStructuredVisit(input);
  const system = result.options.find(option => option.id === 'system');
  const combi = result.options.find(option => option.id === 'combi');
  assert.equal(result.interpretationVersion, 14);
  assert(system.customerAdvisories.some(item => item.flagType === 'gas_supply_retained'));
  assert(!system.customerAdvisories.some(item => item.flagType === 'gas_supply_upgrade_required'));
  assert(combi.customerAdvisories.some(item => item.flagType === 'gas_supply_upgrade_required'));
  assert(combi.customerAdvisories.some(item => item.flagType === 'combi_hot_water_outlet_allowance'));
});
