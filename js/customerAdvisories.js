export const CUSTOMER_ADVISORY_RULE_VERSION = '1.0.0';

export const CUSTOMER_ADVISORY_FLAGS = Object.freeze([
  'combi_hot_water_outlet_allowance', 'combi_bath_performance', 'combi_multi_outlet_mismatch',
  'shower_compatibility_check', 'stored_to_combi_change', 'stored_to_unvented_change',
  'open_vented_heating_to_sealed', 'sealed_heating_concealed_pipework', 'sealed_heating_screed_pipework',
  'unvented_discharge_required', 'gas_supply_retained', 'gas_supply_upgrade_required',
  'cylinder_removed_space_gain', 'cylinder_retained_space_not_gained', 'tank_removed_space_gain',
  'tank_retained', 'customer_priority_supported', 'customer_priority_tradeoff',
  'insufficient_dynamic_pressure_evidence', 'insufficient_water_performance_evidence',
  'stored_hot_water_performance_alignment', 'unvented_water_performance', 'shower_compatibility_information'
]);

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const words = (...items) => items.flat().filter(Boolean).map(item => typeof item === 'object'
  ? [item.section, item.type, item.action, item.specification, item.positionOrRoute, item.status, item.text].map(clean).join(' ')
  : clean(item)).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const isApproximate = measurement => Boolean(measurement?.uncertain || /approx|about|rough|circa/i.test(`${measurement?.qualifier || ''} ${measurement?.sourceText || ''}`));
const sectionItems = (items, section) => (items || []).filter(item => lower(item.section) === lower(section));
const component = (option, section) => sectionItems(option?.components, section)[0] || null;
const confirmedCustomer = survey => (survey.customer || []).filter(item => item.confirmed !== false && clean(item.text));
const supportId = (prefix, item, index = 0) => `${prefix}:${item?.id || index}`;

export function conservativeSupportedOutlets({ flowLitresPerMinute, dynamicPressureBar, flowApproximate = false, pressureApproximate = false, applianceOutletCap = null } = {}) {
  const flow = Number(flowLitresPerMinute);
  const pressure = Number(dynamicPressureBar);
  if (!(flow > 0) || !(pressure > 0)) return null;
  let limitingValue = Math.min(flow / 10, pressure);
  if (Number.isFinite(Number(applianceOutletCap)) && Number(applianceOutletCap) > 0) limitingValue = Math.min(limitingValue, Number(applianceOutletCap));
  let result = Math.floor(limitingValue);
  if ((flowApproximate || pressureApproximate) && Math.abs(limitingValue - Math.round(limitingValue)) < 1e-9) result -= 1;
  return Math.max(0, result);
}

function relevantMeasurement(survey, kindPattern) {
  return (survey.measurements || []).find(item => !item.proposalOptionID && lower(item.section) === 'water' && kindPattern.test(lower(item.kind)));
}

function evidenceReference(survey, option, items = {}) {
  return {
    existingFactIds: (items.existing || []).map((item, index) => supportId('existing', item, index)),
    customerFactIds: (items.customer || []).map((item, index) => supportId('customer', item, index)),
    measurementIds: (items.measurements || []).map((item, index) => supportId('measurement', item, index)),
    proposedComponentIds: (items.proposed || []).map((item, index) => supportId(`proposal:${option.id || 'option'}`, item, index))
  };
}

function advisory(option, flagType, advisoryClass, heading, text, support, limitedByUncertainty = false, detail = {}) {
  const sourceCount = Object.values(support).flat().length;
  if (!sourceCount) return null;
  return {
    id: `${option.id || 'option'}:${flagType}`, flagType, ruleId: flagType,
    ruleVersion: CUSTOMER_ADVISORY_RULE_VERSION, proposalOptionId: option.id || null,
    class: advisoryClass, heading, text, support, limitedByUncertainty, ...detail
  };
}

function customerUse(survey) {
  const customer = confirmedCustomer(survey);
  const corpus = words(customer);
  const simultaneous = /(?:two|2|multiple|several).{0,35}(?:outlets|showers|bathrooms|hot[- ]water)|bath.{0,25}(?:and|while).{0,25}shower|same time|simultaneous/.test(corpus) ? 2 : 1;
  return {
    customer, corpus, bath: customer.filter(item => /\bbath\b/i.test(item.text)),
    shower: customer.filter(item => /\bshower\b/i.test(item.text)), simultaneous,
    simultaneousEvidence: customer.filter(item => /(?:two|2|multiple|several).{0,35}(?:outlets|showers|bathrooms|hot[- ]water)|bath.{0,25}(?:and|while).{0,25}shower|same time|simultaneous/i.test(item.text)),
    space: customer.filter(item => /cupboard|loft|storage|space|remove.{0,25}(?:cylinder|tank)|(?:cylinder|tank).{0,25}remove/i.test(item.text))
  };
}

export function buildCustomerAdvisories(structuredVisit, option) {
  const survey = structuredVisit || {};
  const result = [];
  const add = value => { if (value && !result.some(item => item.flagType === value.flagType)) result.push(value); };
  const existingHot = sectionItems(survey.existing, 'hotWater');
  const existingHeating = sectionItems(survey.existing, 'heating');
  const existingWater = sectionItems(survey.existing, 'water');
  const existingAccess = sectionItems(survey.existing, 'access');
  const existingBoiler = sectionItems(survey.existing, 'boiler');
  const proposedBoiler = component(option, 'boiler');
  const proposedHot = component(option, 'hotWater');
  const proposedGas = component(option, 'gas');
  const proposedHeating = component(option, 'heating');
  const proposedDischarge = component(option, 'discharge');
  const user = customerUse(survey);
  const existingHotText = words(existingHot, existingBoiler);
  const proposedHotText = words(proposedHot, proposedBoiler);
  const storedExisting = /cylinder|stored|vented|thermal store|regular|system/.test(existingHotText) && !/combi|combination/.test(existingHotText);
  const combi = /combi|combination/.test(proposedHotText);
  const unvented = /unvented/.test(proposedHotText);
  const cylinderRemoved = proposedHot && /remove/.test(lower(proposedHot.action));
  const cylinderRetained = proposedHot && /retain/.test(lower(proposedHot.action));
  const flow = relevantMeasurement(survey, /^flow$|water.?flow|flow.?rate/);
  const dynamic = relevantMeasurement(survey, /dynamic/);
  const applianceCapability = (survey.measurements || []).find(item => item.proposalOptionID === option.id &&
    /supported.?outlets|dhw.?outlet.?cap/i.test(lower(item.kind)));
  const explicitApplianceCap = Number(proposedBoiler?.dhwOutletCapacity || proposedBoiler?.supportedOutlets || applianceCapability?.value);
  const measurements = [flow, dynamic, applianceCapability].filter(Boolean);
  const outletCount = conservativeSupportedOutlets({
    flowLitresPerMinute: flow?.value, dynamicPressureBar: dynamic?.value,
    flowApproximate: isApproximate(flow), pressureApproximate: isApproximate(dynamic),
    applianceOutletCap: Number.isFinite(explicitApplianceCap) && explicitApplianceCap > 0 ? explicitApplianceCap : null
  });

  if (combi) {
    const proposalSupport = [proposedBoiler, proposedHot].filter(Boolean);
    if (!flow) add(advisory(option, 'insufficient_water_performance_evidence', 'needsConfirmation', 'Your measured water performance',
      'Incoming water flow has not been confirmed, so hot-water performance for this option cannot yet be stated reliably.',
      evidenceReference(survey, option, { proposed:proposalSupport })));
    else if (!dynamic) add(advisory(option, 'insufficient_dynamic_pressure_evidence', 'needsConfirmation', 'Your measured water performance',
      'Hot-water flow has been measured, but dynamic pressure has not been confirmed. Reliable simultaneous-outlet performance cannot be promised from flow alone.',
      evidenceReference(survey, option, { measurements:[flow], proposed:proposalSupport }), true));
    else if (outletCount < 1) add(advisory(option, 'insufficient_water_performance_evidence', 'needsConfirmation', 'Your measured water performance',
      'The recorded water performance is close to the minimum calculation boundary. A reliable simultaneous-outlet allowance cannot be promised from these approximate measurements.',
      evidenceReference(survey, option, { measurements, proposed:proposalSupport }), true));
    else {
      const count = outletCount;
      const wording = count === 1
        ? 'Based on the water flow and pressure recorded during the survey, we recommend allowing for one hot-water outlet at a time. Opening another hot tap or shower may noticeably reduce performance.'
        : `Based on the recorded water performance, the supply should be suitable for up to ${count} normal hot-water outlets at the same time. The available flow is still shared between outlets, so performance will reduce when they are used together.`;
      add(advisory(option, 'combi_hot_water_outlet_allowance', count === 1 ? 'advisory' : 'information', 'What this means for your hot water', wording,
        evidenceReference(survey, option, { measurements, proposed:proposalSupport }), isApproximate(flow) || isApproximate(dynamic), { supportedOutlets:count }));
      if (user.simultaneous > count && user.simultaneousEvidence.length) add(advisory(option, 'combi_multi_outlet_mismatch', 'caution', 'Things to be aware of',
        `Your household use suggests that ${user.simultaneous} hot-water outlets may sometimes be required together. Based on the recorded water performance, this combi option should be treated as a ${count === 1 ? 'one-outlet-at-a-time' : `${count}-outlet`} system, so simultaneous use may not meet your expectations.`,
        evidenceReference(survey, option, { customer:user.simultaneousEvidence, measurements, proposed:proposalSupport }), isApproximate(flow) || isApproximate(dynamic)));
      if (user.bath.length) add(advisory(option, 'combi_bath_performance', count === 1 ? 'advisory' : 'information', 'What this means for your hot water',
        `${count === 1 ? 'While filling the bath, we recommend avoiding other hot-water use if consistent performance is important. ' : ''}A combi provides hot water continuously, but bath filling remains limited by the incoming mains flow recorded during the survey.`,
        evidenceReference(survey, option, { customer:user.bath, measurements, proposed:proposalSupport })));
    }
    if (storedExisting) add(advisory(option, 'stored_to_combi_change', 'information', 'What changes with this option',
      'This option changes the home from stored hot water to hot water produced by the combi as it is used.',
      evidenceReference(survey, option, { existing:[...existingHot, ...existingBoiler], proposed:proposalSupport })));
  }

  if ((combi || unvented) && storedExisting) {
    const showerEvidence = [...existingWater, ...existingHot, ...user.shower];
    const showerText = words(showerEvidence);
    if (/pumped|gravity|stored/.test(showerText)) add(advisory(option, 'shower_compatibility_check', 'advisory', 'Things to be aware of',
      'The existing shower relies on the stored-water arrangement. Changing the hot-water source may require the shower or its pump arrangement to be altered.',
      evidenceReference(survey, option, { existing:[...existingWater, ...existingHot], customer:user.shower, proposed:[proposedBoiler, proposedHot].filter(Boolean) })));
    else if (/electric shower/.test(showerText)) add(advisory(option, 'shower_compatibility_information', 'information', 'Things to be aware of',
      'The recorded electric shower heats its own water and is not dependent on the proposed domestic hot-water source.',
      evidenceReference(survey, option, { existing:existingWater, customer:user.shower, proposed:[proposedBoiler, proposedHot].filter(Boolean) })));
    else if (!/mains[- ]fed/.test(showerText)) add(advisory(option, 'shower_compatibility_check', 'needsConfirmation', 'Things to be aware of',
      'The existing shower arrangement needs to be checked against the proposed hot-water system before the final specification is confirmed.',
      evidenceReference(survey, option, { existing:[...existingWater, ...existingHot], customer:user.shower, proposed:[proposedBoiler, proposedHot].filter(Boolean) }), true));
  }

  if (unvented && storedExisting) add(advisory(option, 'stored_to_unvented_change', 'information', 'What changes with this option',
    'This option changes the stored hot-water arrangement to a mains-pressure unvented cylinder. Its performance still depends on the incoming mains supply.',
    evidenceReference(survey, option, { existing:existingHot, proposed:[proposedHot] })));
  if (unvented && !flow) add(advisory(option, 'insufficient_water_performance_evidence', 'needsConfirmation', 'Your measured water performance',
    'Incoming water flow has not been confirmed, so the expected mains-pressure hot-water performance for this option cannot yet be stated reliably.',
    evidenceReference(survey, option, { proposed:[proposedHot] })));
  else if (unvented && !dynamic) add(advisory(option, 'insufficient_dynamic_pressure_evidence', 'needsConfirmation', 'Your measured water performance',
    'Hot-water flow has been measured, but dynamic pressure has not been confirmed. The expected mains-pressure performance cannot be promised from flow alone.',
    evidenceReference(survey, option, { measurements:[flow], proposed:[proposedHot] }), true));
  else if (unvented && outletCount >= 1) add(advisory(option, 'unvented_water_performance', 'information', 'Your measured water performance',
    `The recorded incoming flow and dynamic pressure give a conservative incoming-supply allowance of up to ${outletCount} normal hot-water outlet${outletCount === 1 ? '' : 's'} at the same time. Final performance also depends on the selected cylinder capacity and outlet demand.`,
    evidenceReference(survey, option, { measurements, proposed:[proposedHot] }), isApproximate(flow) || isApproximate(dynamic), { supportedOutlets:outletCount }));
  if (unvented && !(proposedDischarge && !/unresolved|unknown/.test(words(proposedDischarge)) && /retain|replace|new|alter/.test(lower(proposedDischarge.action)))) add(advisory(option,
    'unvented_discharge_required', 'needsConfirmation', 'Things to be aware of',
    'This type of cylinder requires a suitable safety discharge route. The route has not yet been confirmed, so this part of the proposal remains subject to survey confirmation.',
    evidenceReference(survey, option, { proposed:[proposedHot] }), true));

  const openVented = /open[- ]vented/.test(words(existingHeating, existingHot));
  const sealed = /sealed/.test(words(proposedHeating, proposedBoiler)) || /system|combi|combination/.test(lower(proposedBoiler?.type));
  if (openVented && sealed) {
    const baseSupport = { existing:[...existingHeating, ...existingHot], proposed:[proposedHeating, proposedBoiler].filter(Boolean) };
    add(advisory(option, 'open_vented_heating_to_sealed', 'advisory', 'What changes with this option',
      'Your existing heating system is open vented. The proposed system would operate as a sealed, pressurised system. This places the existing heating pipework, radiators and joints under greater standing pressure than they experience now.', evidenceReference(survey, option, baseSupport)));
    const accessText = words(existingHeating, existingAccess);
    if (/screed/.test(accessText)) add(advisory(option, 'sealed_heating_screed_pipework', 'caution', 'Things to be aware of',
      'Some heating pipework is buried in the screed or floor. If an existing weakness shows after conversion to sealed pressure, access and repair may be more disruptive.', evidenceReference(survey, option, baseSupport)));
    else if (/concealed|buried|under.?floor/.test(accessText)) add(advisory(option, 'sealed_heating_concealed_pipework', 'advisory', 'Things to be aware of',
      'Some existing heating pipework is concealed or buried, so any weakness that becomes apparent after pressurisation may be harder to locate or access.', evidenceReference(survey, option, baseSupport)));
  }

  if (proposedGas && /retain/.test(lower(proposedGas.action))) add(advisory(option, 'gas_supply_retained', 'information', 'What changes with this option',
    'The existing gas supply can be retained for this option.', evidenceReference(survey, option, { proposed:[proposedGas] })));
  if (proposedGas && (/replace|upgrade/.test(lower(proposedGas.action)) || /upgrade|increase|unsuitable/.test(words(proposedGas)))) add(advisory(option,
    'gas_supply_upgrade_required', 'advisory', 'What changes with this option',
    'This option requires the gas supply to be upgraded to suit the proposed appliance.', evidenceReference(survey, option, { proposed:[proposedGas] })));

  if (user.space.length && cylinderRemoved) {
    add(advisory(option, 'cylinder_removed_space_gain', 'information', 'How this option matches your priorities',
      'This option removes the hot-water cylinder and releases the associated cupboard or storage space.', evidenceReference(survey, option, { customer:user.space, proposed:[proposedHot] })));
    add(advisory(option, 'customer_priority_supported', 'information', 'How this option matches your priorities',
      'This option supports your stated aim of gaining storage space by removing the stored-hot-water equipment.', evidenceReference(survey, option, { customer:user.space, proposed:[proposedHot] })));
  } else if (user.space.length && cylinderRetained) {
    add(advisory(option, 'cylinder_retained_space_not_gained', 'advisory', 'How this option matches your priorities',
      'This option retains the hot-water cylinder, so the cupboard or storage space it occupies will remain in use.', evidenceReference(survey, option, { customer:user.space, proposed:[proposedHot] })));
    add(advisory(option, 'customer_priority_tradeoff', 'advisory', 'How this option matches your priorities',
      'This option does not fully achieve the stated space-saving aim because the stored-hot-water equipment is retained.', evidenceReference(survey, option, { customer:user.space, proposed:[proposedHot] })));
  }
  if (cylinderRetained && flow && (Number(flow.value) < 20 || (dynamic && Number(dynamic.value) < 2))) add(advisory(option,
    'stored_hot_water_performance_alignment', 'information', 'What this means for your hot water',
    'Retaining stored hot water avoids relying entirely on the incoming mains flow for instantaneous hot-water delivery and is better aligned with the water performance recorded during the survey.',
    evidenceReference(survey, option, { measurements, proposed:[proposedHot] }), isApproximate(flow) || isApproximate(dynamic)));

  const tankText = words(proposedHot);
  if (user.space.length && /remove/.test(tankText) && /tank|cold-water storage|feed and expansion/.test(tankText)) add(advisory(option,
    'tank_removed_space_gain', 'information', 'How this option matches your priorities',
    'This option removes the confirmed redundant water-storage tank equipment and releases the associated space.', evidenceReference(survey, option, { customer:user.space, proposed:[proposedHot] })));
  if (/retain/.test(tankText) && /tank|cold-water storage|feed and expansion/.test(tankText)) add(advisory(option,
    'tank_retained', 'information', 'What changes with this option',
    'This option retains the existing water-storage tank arrangement.', evidenceReference(survey, option, { proposed:[proposedHot] })));

  return result;
}

export function buildVisitCustomerAdvisories(structuredVisit) {
  return (structuredVisit?.proposals || []).map(option => ({
    proposalOptionId: option.id || null,
    proposalName: option.name || 'Proposal',
    advisories: buildCustomerAdvisories(structuredVisit, option)
  }));
}

const visualSection = { boiler:'boiler', cylinder:'hotWater', flue:'flue', control:'controls', gas:'gas', filter:'systemTreatment',
  powerflush:'systemTreatment', condensate:'condensate', discharge:'discharge', radiator:'emitters', pump:'heating', valve:'heating', pipe:'heating', electrical:'electrical', scaffold:'access' };

export function proposalWithVisualSelections(option, checklistState) {
  const copy = typeof structuredClone === 'function' ? structuredClone(option) : JSON.parse(JSON.stringify(option));
  copy.components ||= [];
  for (const selection of checklistState?.items || []) {
    if (selection.removed || !selection.visualComponent || !selection.visualField) continue;
    const section = visualSection[selection.visualComponent];
    if (!section) continue;
    let target = copy.components.find(item => lower(item.section) === lower(section));
    if (!target) { target = { id:`visual-${selection.visualComponent}`, section, selectedNotes:[] }; copy.components.push(target); }
    if (selection.visualField === 'type') {
      if (selection.visualComponent === 'gas') target.specification = selection.visualValue;
      else target.type = selection.visualValue;
    } else if (selection.visualComponent === 'flue') target.positionOrRoute = selection.visualValue;
    else {
      const value = lower(selection.visualValue);
      target.action = /retain/.test(value) ? 'retain' : /replace|upgrade/.test(value) ? 'replace' : /remove/.test(value) ? 'remove' : /new|include|required/.test(value) ? 'new' : value;
    }
  }
  return copy;
}
