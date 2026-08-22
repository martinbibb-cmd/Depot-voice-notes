import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_ADVISORY_FLAGS, CUSTOMER_ADVISORY_RULE_VERSION,
  buildCustomerAdvisories, buildVisitCustomerAdvisories, conservativeSupportedOutlets, proposalWithVisualSelections
} from '../js/customerAdvisories.js';

const measurement = (id, kind, value, unit, qualifier = 'exact') => ({ id, layer:'existing', section:'water', kind, value, unit, qualifier, sourceText:`${qualifier === 'approximate' ? 'about ' : ''}${value} ${unit}` });
const proposal = (id, components) => ({ id, name:id, isSelected:id === 'system', components });
const component = (id, section, action, type = '', specification = '') => ({ id, section, action, type, specification });
const base = () => ({
  existing:[
    { id:'existing-boiler', section:'boiler', type:'System boiler' },
    { id:'existing-hot', section:'hotWater', type:'Vented cylinder' },
    { id:'existing-heating', section:'heating', type:'Open vented', specification:'Some pipework concealed beneath floor' }
  ],
  customer:[
    { id:'space', kind:'want', origin:'customerStatement', confirmed:true, text:'Gain cupboard space by removing the cylinder.' },
    { id:'use', kind:'need', origin:'customerStatement', confirmed:true, text:'We use the bath and shower at the same time.' }
  ],
  measurements:[measurement('flow','flow',20,'L/min'), measurement('dynamic','dynamicPressure',2,'bar')],
  proposals:[], evidence:[]
});

test('starter advisory registry includes all required deterministic flags', () => {
  assert(CUSTOMER_ADVISORY_FLAGS.length >= 20);
  assert.equal(new Set(CUSTOMER_ADVISORY_FLAGS).size, CUSTOMER_ADVISORY_FLAGS.length);
  assert.match(CUSTOMER_ADVISORY_RULE_VERSION, /^\d+\.\d+\.\d+$/);
});

test('water outlet formula rounds down using both flow and dynamic pressure', () => {
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:20, dynamicPressureBar:2 }), 2);
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:15, dynamicPressureBar:2 }), 1);
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:28, dynamicPressureBar:3 }), 2);
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:30, dynamicPressureBar:3 }), 3);
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:20 }), null);
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:30, dynamicPressureBar:3, applianceOutletCap:2 }), 2);
});

test('known appliance capability caps the measured outlet allowance', () => {
  const survey = base();
  survey.measurements = [measurement('flow','flow',30,'L/min'), measurement('dynamic','dynamicPressure',3,'bar'),
    { id:'boiler-cap', layer:'proposed', proposalOptionID:'combi', section:'boiler', kind:'supportedOutlets', value:2, unit:'outlets', qualifier:'exact' }];
  const advisories = buildCustomerAdvisories(survey, proposal('combi', [component('b','boiler','replace','Combi')]));
  assert.equal(advisories.find(item => item.flagType === 'combi_hot_water_outlet_allowance').supportedOutlets, 2);
});

test('approximate boundary performance under-promises instead of promising threshold', () => {
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:20, dynamicPressureBar:2, flowApproximate:true, pressureApproximate:true }), 1);
  assert.equal(conservativeSupportedOutlets({ flowLitresPerMinute:25, dynamicPressureBar:2.5, flowApproximate:true }), 2);
});

test('combi advisories preserve measurements and expose a simultaneous-use mismatch', () => {
  const survey = base();
  const option = proposal('combi', [
    component('boiler','boiler','replace','Combi'), component('hot','hotWater','remove'), component('gas','gas','replace','','Upgrade gas supply')
  ]);
  const advisories = buildCustomerAdvisories(survey, option);
  const allowance = advisories.find(item => item.flagType === 'combi_hot_water_outlet_allowance');
  assert.equal(allowance.supportedOutlets, 2);
  assert.match(allowance.text, /up to 2 normal hot-water outlets/);
  assert(advisories.some(item => item.flagType === 'stored_to_combi_change'));
  assert(advisories.some(item => item.flagType === 'gas_supply_upgrade_required'));
  assert(advisories.some(item => item.flagType === 'cylinder_removed_space_gain'));
  assert(advisories.every(item => Object.values(item.support).flat().length > 0));
  assert(!advisories.some(item => item.text.includes(item.flagType)));
});

test('two-outlet customer use against one-outlet combi produces caution', () => {
  const survey = base();
  survey.measurements = [measurement('flow','flow',15,'L/min'), measurement('dynamic','dynamicPressure',2,'bar')];
  const option = proposal('combi', [component('boiler','boiler','replace','Combi'), component('hot','hotWater','remove')]);
  const advisories = buildCustomerAdvisories(survey, option);
  assert.equal(advisories.find(item => item.flagType === 'combi_hot_water_outlet_allowance').supportedOutlets, 1);
  assert.equal(advisories.find(item => item.flagType === 'combi_multi_outlet_mismatch').class, 'caution');
  assert.match(advisories.find(item => item.flagType === 'combi_bath_performance').text, /avoiding other hot-water use/);
});

test('single-outlet customer use does not create a false mismatch', () => {
  const survey = base();
  survey.customer = [{ id:'one', kind:'need', confirmed:true, text:'Reliable hot water for one shower.' }];
  survey.measurements = [measurement('flow','flow',10,'L/min'), measurement('dynamic','dynamicPressure',1,'bar')];
  const advisories = buildCustomerAdvisories(survey, proposal('combi', [component('b','boiler','replace','Combi')]));
  assert(!advisories.some(item => item.flagType === 'combi_multi_outlet_mismatch'));
});

test('static pressure is never substituted for missing dynamic pressure', () => {
  const survey = base();
  survey.measurements = [measurement('flow','flow',20,'L/min'), measurement('static','staticPressure',3,'bar')];
  const advisories = buildCustomerAdvisories(survey, proposal('combi', [component('b','boiler','replace','Combi')]));
  assert(advisories.some(item => item.flagType === 'insufficient_dynamic_pressure_evidence'));
  assert(!advisories.some(item => item.flagType === 'combi_hot_water_outlet_allowance'));
});

test('open vented to sealed creates pressure advice and screed wording only when grounded', () => {
  const survey = base();
  survey.existing.find(item => item.section === 'heating').specification = 'Heating pipes buried in screed';
  const sealed = proposal('sealed', [component('boiler','boiler','replace','System'), component('heating','heating','replace','Sealed')]);
  const advisories = buildCustomerAdvisories(survey, sealed);
  assert(advisories.some(item => item.flagType === 'open_vented_heating_to_sealed'));
  assert.match(advisories.find(item => item.flagType === 'sealed_heating_screed_pipework').text, /buried in the screed or floor/);
  const alreadySealed = structuredClone(survey); alreadySealed.existing.find(item => item.section === 'heating').type = 'Sealed';
  assert(!buildCustomerAdvisories(alreadySealed, sealed).some(item => item.flagType === 'open_vented_heating_to_sealed'));
});

test('unvented option requires a confirmed discharge route', () => {
  const survey = base();
  const without = proposal('unvented', [component('hot','hotWater','replace','Unvented cylinder')]);
  assert(buildCustomerAdvisories(survey, without).some(item => item.flagType === 'unvented_discharge_required'));
  const withRoute = proposal('unvented-route', [component('hot','hotWater','replace','Unvented cylinder'), component('d','discharge','new','','Route to outside')]);
  assert(!buildCustomerAdvisories(survey, withRoute).some(item => item.flagType === 'unvented_discharge_required'));
});

test('gas and customer-priority advisories remain isolated by option', () => {
  const survey = base();
  survey.proposals = [
    proposal('system', [component('b1','boiler','replace','System'), component('h1','hotWater','retain','Vented cylinder'), component('g1','gas','retain','','22 mm')]),
    proposal('combi', [component('b2','boiler','replace','Combi'), component('h2','hotWater','remove'), component('g2','gas','replace','','Upgrade')])
  ];
  const byOption = new Map(buildVisitCustomerAdvisories(survey).map(item => [item.proposalOptionId, item.advisories]));
  assert(byOption.get('system').some(item => item.flagType === 'gas_supply_retained'));
  assert(byOption.get('system').some(item => item.flagType === 'cylinder_retained_space_not_gained'));
  assert(!byOption.get('system').some(item => item.flagType === 'gas_supply_upgrade_required'));
  assert(byOption.get('combi').some(item => item.flagType === 'gas_supply_upgrade_required'));
  assert(byOption.get('combi').some(item => item.flagType === 'customer_priority_supported'));
});

test('known electric shower receives an evidence-backed information note, not a review warning', () => {
  const survey = base();
  survey.existing.push({ id:'shower', section:'water', type:'Electric shower supplied from mains' });
  const advisories = buildCustomerAdvisories(survey, proposal('combi', [component('b','boiler','replace','Combi')]));
  assert(!advisories.some(item => item.flagType === 'shower_compatibility_check'));
  assert.equal(advisories.find(item => item.flagType === 'shower_compatibility_information').class, 'information');
});

test('camel-case openVented native state is recognised and retained stored water explains the trade-off', () => {
  const survey = base();
  survey.existing.find(item => item.section === 'heating').type = 'openVented';
  survey.measurements = [measurement('flow','flow',15,'L/min'), measurement('dynamic','dynamicPressure',2,'bar')];
  const option = proposal('system', [component('b','boiler','replace','System'), component('h','hotWater','retain','Vented cylinder')]);
  const advisories = buildCustomerAdvisories(survey, option);
  assert(advisories.some(item => item.flagType === 'open_vented_heating_to_sealed'));
  assert(advisories.some(item => item.flagType === 'stored_hot_water_performance_alignment'));
});

test('unvented proposal never substitutes static pressure and explains confirmed mains performance', () => {
  const survey = base();
  const option = proposal('unvented', [component('h','hotWater','replace','Unvented cylinder'), component('d','discharge','new')]);
  survey.measurements = [measurement('flow','flow',20,'L/min'), measurement('static','staticPressure',3,'bar')];
  assert(buildCustomerAdvisories(survey, option).some(item => item.flagType === 'insufficient_dynamic_pressure_evidence'));
  survey.measurements = [measurement('flow','flow',20,'L/min'), measurement('dynamic','dynamicPressure',2,'bar')];
  const measured = buildCustomerAdvisories(survey, option).find(item => item.flagType === 'unvented_water_performance');
  assert.equal(measured.supportedOutlets, 2);
  assert.match(measured.text, /selected cylinder capacity/);
});

test('surveyor visual proposal correction changes advisory input without mutating captured proposal', () => {
  const original = proposal('option', [component('b','boiler','replace','System'), component('g','gas','retain','','22 mm')]);
  const corrected = proposalWithVisualSelections(original, { items:[
    { id:'visual-boiler-type', visualComponent:'boiler', visualField:'type', visualValue:'combi', removed:false },
    { id:'visual-gas-action', visualComponent:'gas', visualField:'action', visualValue:'Replace', removed:false }
  ] });
  assert.equal(original.components.find(item => item.section === 'boiler').type, 'System');
  assert.equal(corrected.components.find(item => item.section === 'boiler').type, 'combi');
  assert.equal(corrected.components.find(item => item.section === 'gas').action, 'replace');
  const flags = buildCustomerAdvisories(base(), corrected).map(item => item.flagType);
  assert(flags.includes('gas_supply_upgrade_required'));
  assert(flags.includes('combi_hot_water_outlet_allowance'));
});
