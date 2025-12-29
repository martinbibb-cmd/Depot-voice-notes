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

function applyGoldSafetyGate(ranked = [], features = {}) {
  const result = [...ranked];
  const {
    wantsSolarPv = false,
    futureHeatPump = false,
    needsMultipleTaps = false,
    existingRegularOrSystem = false,
    wantsSpaceSaving = false,
    lowHotWaterDemand = false,
  } = features || {};

  const goldId = result[0];

  const combiGoldIsAcceptable =
    goldId === 'combi' &&
    !wantsSolarPv &&
    !futureHeatPump &&
    !needsMultipleTaps &&
    !existingRegularOrSystem &&
    (lowHotWaterDemand || wantsSpaceSaving);

  if (goldId !== 'combi' || combiGoldIsAcceptable) {
    return result;
  }

  const storagePreferenceOrder = ['system_mixergy', 'system_unvented'];

  let idxStorage;
  for (const id of storagePreferenceOrder) {
    const idx = result.indexOf(id);
    if (idx > 0) {
      idxStorage = idx;
      break;
    }
  }

  if (typeof idxStorage === 'number' && idxStorage > 0) {
    const storageId = result[idxStorage];
    result[idxStorage] = result[0];
    result[0] = storageId;
  }

  return result;
}

function applyGoldSafetyGateToRecommendations(orderedRecs, features) {
  if (!features) return orderedRecs;

  const gatedOrder = applyGoldSafetyGate(
    orderedRecs.map((rec) => rec.optionKey),
    features
  );

  const reordered = [];
  gatedOrder.forEach((optionKey) => {
    const match = orderedRecs.find((rec) => rec.optionKey === optionKey);
    if (match && !reordered.includes(match)) {
      reordered.push(match);
    }
  });

  orderedRecs.forEach((rec) => {
    if (!reordered.includes(rec)) {
      reordered.push(rec);
    }
  });

  return reordered;
}

function isExplicitRecommendation(recommendationKey, requirements) {
  if (!Array.isArray(requirements?.expertRecommendations)) return false;

  const normalisedKey = recommendationKey?.replace(/_/g, '-');
  return requirements.expertRecommendations.some((key) => key === recommendationKey || key === normalisedKey);
}

function mapEngineResultToOption(recommendation, tierLabel, requirements) {
  const optionKey = ENGINE_TO_OPTION_KEY[recommendation.key];
  const base = BASE_OPTION_DEFS[optionKey];

  if (!base) return null;

  const benefits = [...base.baseBenefits];
  if (Array.isArray(recommendation.reasons)) {
    recommendation.reasons.slice(0, 3).forEach((reason) => benefits.push(reason));
  }

  return {
    id: optionKey,
    label: tierLabel || 'OPTION',
    title: base.title,
    subtitle: base.subtitle,
    benefits: benefits.slice(0, 6),
    miniSpec: base.miniSpec,
    visualTags: base.visualTags,
    engineScore: recommendation.score,
    optionKey,
    explicitlyRecommended: isExplicitRecommendation(recommendation.key, requirements),
  };
}

export function rankOptionsWithEngine(requirements = {}, allowedOptionKeys = Object.values(ENGINE_TO_OPTION_KEY)) {
  const { recommendations = [] } = generateRecommendations(requirements);
  return recommendations
    .filter((rec) => allowedOptionKeys.includes(ENGINE_TO_OPTION_KEY[rec.key]))
    .map((rec) => ({ ...rec, optionKey: ENGINE_TO_OPTION_KEY[rec.key] }))
    .sort((a, b) => b.score - a.score);
}

function orderRecommendations(ranked, optionOrder = []) {
  if (!Array.isArray(optionOrder) || optionOrder.length === 0) return ranked;

  const seen = new Set();
  const ordered = [];

  optionOrder.forEach((optionKey) => {
    const match = ranked.find((rec) => rec.optionKey === optionKey || rec.key === optionKey);
    if (match && !seen.has(match.optionKey)) {
      ordered.push(match);
      seen.add(match.optionKey);
    }
  });

  ranked.forEach((rec) => {
    if (!seen.has(rec.optionKey)) {
      ordered.push(rec);
      seen.add(rec.optionKey);
    }
  });

  return ordered;
}

export function getProposalOptions(requirements = {}, optionOrder, allowedOptionKeys, customerFeatures) {
  const ranked = rankOptionsWithEngine(
    requirements,
    allowedOptionKeys || Object.values(ENGINE_TO_OPTION_KEY)
  );

  const ordered = applyGoldSafetyGateToRecommendations(
    orderRecommendations(ranked, optionOrder),
    customerFeatures
  );
  const options = ordered
    .slice(0, 3)
    .map((rec, idx) => mapEngineResultToOption(rec, TIER_LABELS[idx], requirements))
    .filter(Boolean);

  return {
    options,
    ranked: ordered,
  };
}
