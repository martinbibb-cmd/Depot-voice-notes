import { generateRecommendations } from './recommendationEngine.js';

const ENGINE_TO_OPTION_KEY = {
  combi: 'combi',
  'system-mixergy': 'system_mixergy',
  'system-unvented': 'system_unvented',
};

const BASE_OPTION_DEFS = {
  combi: {
    title: 'High-efficiency combi with smart controls',
    subtitle: 'Space-saving and efficient for smaller homes with good pressure.',
    baseBenefits: [
      'Instant hot water on demand with no separate cylinder.',
      'Saves space and simplifies pipework.',
      'Lower install cost compared to stored hot water systems.',
    ],
    miniSpec:
      'Condensing combi boiler, smart controls, magnetic filter, limescale protection, full system cleanse.',
    visualTags: ['combi', 'hive', 'filter', 'flush'],
  },
  system_mixergy: {
    title: 'System boiler with Mixergy smart cylinder',
    subtitle: 'Future-ready hot water with smart, stratified storage.',
    baseBenefits: [
      'Heats only what you need for faster recovery and lower bills.',
      'App monitoring and control with renewable-ready connections.',
      'Great comfort and visibility of stored hot water.',
    ],
    miniSpec:
      'System boiler, Mixergy smart cylinder, smart controls, magnetic filter and full system cleanse.',
    visualTags: ['system', 'mixergy', 'hive', 'filter', 'flush'],
  },
  system_unvented: {
    title: 'System boiler with unvented cylinder and smart controls',
    subtitle: 'Strong hot water performance for multiple bathrooms.',
    baseBenefits: [
      'Great flow rates to multiple outlets at once.',
      'Mains-pressure showers with fast cylinder recovery.',
      'No loft tanks required, tidy installation.',
    ],
    miniSpec:
      'High-efficiency system boiler, unvented cylinder, smart controls, magnetic filter and full system cleanse.',
    visualTags: ['system', 'cylinder', 'hive', 'filter', 'flush'],
  },
};

const TIER_LABELS = ['GOLD – RECOMMENDED', 'SILVER', 'BRONZE'];

function mapEngineResultToOption(recommendation, tierIdx) {
  const optionKey = ENGINE_TO_OPTION_KEY[recommendation.key];
  const base = BASE_OPTION_DEFS[optionKey];

  if (!base) return null;

  const benefits = [...base.baseBenefits];
  if (Array.isArray(recommendation.reasons)) {
    recommendation.reasons.slice(0, 3).forEach((reason) => benefits.push(reason));
  }

  return {
    title: `${TIER_LABELS[tierIdx] || 'OPTION'}: ${base.title}`,
    subtitle: base.subtitle,
    benefits: benefits.slice(0, 6),
    miniSpec: base.miniSpec,
    visualTags: base.visualTags,
    engineScore: recommendation.score,
    optionKey,
  };
}

export function rankOptionsWithEngine(requirements = {}, allowedOptionKeys = Object.values(ENGINE_TO_OPTION_KEY)) {
  const { recommendations = [] } = generateRecommendations(requirements);
  return recommendations
    .filter((rec) => allowedOptionKeys.includes(ENGINE_TO_OPTION_KEY[rec.key]))
    .map((rec) => ({ ...rec, optionKey: ENGINE_TO_OPTION_KEY[rec.key] }))
    .sort((a, b) => b.score - a.score);
}

export function getProposalOptions(requirements = {}, allowedOptionKeys) {
  const ranked = rankOptionsWithEngine(
    requirements,
    allowedOptionKeys || Object.values(ENGINE_TO_OPTION_KEY)
  );

  const tiered = ranked.slice(0, 3).map((rec, idx) => mapEngineResultToOption(rec, idx)).filter(Boolean);

  const [gold, silver, bronze] = tiered;

  return {
    gold,
    silver,
    bronze,
    ranked,
  };
}
