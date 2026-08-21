import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/system-boiler-combi.json' with { type: 'json' };
import { auditPipelineOutput, buildDepotSections, buildHandoverDocuments } from '../js/pipelineInvariants.js';

test('system-boiler/combi fixture preserves intent, rejection rationale and selected scope', () => {
  const selected = fixture.options.find(x => x.status === 'preferred');
  const rejected = fixture.options.find(x => x.id === 'option-combi');
  const confirmed = [...fixture.sharedFacts, ...selected.facts];
  const text = JSON.stringify(confirmed);
  assert.match(text, /gain cupboard or loft space/);
  assert.match(JSON.stringify(rejected), /inadequate for the combi option/);
  assert.match(JSON.stringify(rejected), /shower suitability.*questioned/);
  assert.match(text, /approximately 10 L\/min unrestricted/);
  assert.doesNotMatch(text, /10 L\/min at 1 bar/);
  assert.doesNotMatch(text, /upgrade.*gas supply/i);
  assert.match(text, /system-boiler replacement/);
  assert.match(text, /retaining stored hot water/);
  assert.match(text, /Flue requires external access/);
  assert.match(text, /scaffold is required because/);
  assert.match(text, /Condensate needs a new route/);
  assert.match(text, /Vaillant was suggested/);
  assert.doesNotMatch(text, /cylinder.*failed/i);
  assert.match(JSON.stringify(fixture.uncertainties), /no definite diagnosis was established/i);

  const handover = buildHandoverDocuments({ confirmedChecklistItems: [...fixture.sharedFacts, ...selected.facts], uncertainties: fixture.uncertainties });
  const depot = buildDepotSections([...fixture.sharedFacts, ...selected.facts]);
  assert(!handover.engineer.find(x => x.heading === 'Flue').bullets.includes('No information recorded.'));
  assert(!handover.engineer.find(x => x.heading === 'Gas supply').bullets.includes('No information recorded.'));
  assert(!handover.engineer.find(x => x.heading === 'Unresolved points').bullets.includes('No information recorded.'));
  assert.doesNotMatch(JSON.stringify(handover.engineer), /upgrade.*gas supply/i);
  assert.match(handover.customer.find(x => x.heading === 'Why this suits your home').text, /gain cupboard or loft space/);
  assert.deepEqual(auditPipelineOutput({ confirmedItems: [...fixture.sharedFacts, ...selected.facts], depotSections: depot, handover }), []);
});
