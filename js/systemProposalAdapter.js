import { extractHeatingRequirements } from './recommendationEngine.js';
import { buildRecommendationsFromDepotSurvey } from '../src/services/systemRecommendationService.js';

const DEFAULT_OPTION_TEXT = 'Details not specified';

function normaliseSections(rawSections = []) {
  if (!Array.isArray(rawSections)) return [];
  return rawSections.map((section) => ({
    section: section.section || section.name || '',
    plainText: section.plain || section.plainText || '',
    naturalLanguage: section.nl || section.naturalLanguage || ''
  }));
}

function collectNotes(sections = [], customerSummary = '') {
  const notes = [];
  sections.forEach((s) => {
    if (s.plainText) notes.push(s.plainText);
    if (s.naturalLanguage) notes.push(s.naturalLanguage);
  });
  if (customerSummary) notes.push(customerSummary);
  return notes;
}

function describeControls(option) {
  if (option.water.includes('mixergy')) {
    return 'Smart controls with app monitoring for the smart hot water cylinder';
  }
  if (option.boiler === 'combi') return 'Wireless programmable smart thermostat for on-demand hot water';
  return 'Smart programmer and room thermostat with load-compensation';
}

function describeExtras(option) {
  const extras = [];
  extras.push('System filter and chemical clean');
  if (option.boiler !== 'combi') {
    extras.push('Cylinder safety set and insulation');
  }
  if (option.water.includes('mixergy')) {
    extras.push('Smart hot water cylinder with built-in monitoring and optimisation');
  }
  return extras.join('; ');
}

function pickBenefits(profile, option) {
  const benefits = [];
  benefits.push(`High efficiency (${profile.efficiency}) for lower bills`);
  benefits.push(profile.hotWater || 'Reliable hot water delivery');
  benefits.push(profile.space || 'Sized for your home');
  if (profile.renewables) benefits.push(profile.renewables);
  if (option.water.includes('mixergy')) {
    benefits.push('Smart hot water cylinder with in-built monitoring and optimisation');
  }
  return benefits.slice(0, 5);
}

export async function buildSystemInputFromNotes(notesJson = {}) {
  const sections = normaliseSections(notesJson.sections || notesJson.notes || []);
  const notes = collectNotes(sections, notesJson.customerSummary || '');
  const requirements = extractHeatingRequirements(sections, notes);

  // Fill a few extras if present in the JSON
  if (typeof notesJson.occupants === 'number' && notesJson.occupants > 0) {
    requirements.occupants = notesJson.occupants;
  }
  if (typeof notesJson.bathrooms === 'number' && notesJson.bathrooms > 0) {
    requirements.bathrooms = notesJson.bathrooms;
  }
  if (typeof notesJson.bedrooms === 'number' && notesJson.bedrooms > 0) {
    requirements.bedrooms = notesJson.bedrooms;
  }

  return requirements;
}

export function getProposalOptionsFromSystemRec(result = {}) {
  const options = Array.isArray(result.options) ? result.options : [];

  const goldOption = options[0] || null;
  const silverOption = options[1] || options[0] || null;
  const bronzeOption = options[2] || options[1] || options[0] || null;

  const formatOption = (option, tier = 'Gold') => {
    if (!option) {
      return {
        title: `${tier} option` || 'Option',
        subtitle: DEFAULT_OPTION_TEXT,
        benefits: [DEFAULT_OPTION_TEXT],
        miniSpec: DEFAULT_OPTION_TEXT,
        option
      };
    }

    const profile = option.profile || {};
    const baseTitle = tier === 'Bronze'
      ? 'Bronze – budget-conscious option'
      : tier === 'Silver'
        ? `Silver – ${profile.label || option.title || 'system'} with simple controls`
        : `Gold – ${profile.label || option.title || 'system'} with smart controls`;

    const subtitle = tier === 'Gold'
      ? 'Our top recommendation based on your home and how you use hot water.'
      : tier === 'Silver'
        ? 'Great performance with simpler controls and fewer extras.'
        : 'Least disruptive, safe and reliable upgrade.';

    const benefits = pickBenefits(profile, option);
    const controls = describeControls(option);
    const extras = describeExtras(option);
    const miniSpecParts = [controls, extras, profile.bestFor || profile.space].filter(Boolean);

    return {
      title: baseTitle,
      subtitle,
      benefits,
      miniSpec: miniSpecParts.join('. '),
      option
    };
  };

  return {
    gold: formatOption(goldOption, 'Gold'),
    silver: formatOption(silverOption, 'Silver'),
    bronze: formatOption(bronzeOption, 'Bronze'),
    reasoningSummary: result.reasoningSummary
  };
}

export async function getRecommendationsForNotes(notesJson = {}) {
  const input = await buildSystemInputFromNotes(notesJson);
  return buildRecommendationsFromDepotSurvey(input);
}
