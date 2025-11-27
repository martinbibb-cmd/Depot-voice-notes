import { generateRecommendations } from './recommendationEngine.js';

const ENGINE_TO_OPTION_KEY = {
  combi: 'combi',
  'system-mixergy': 'system_mixergy',
  'system-unvented': 'system_unvented',
};

// Base descriptions used to turn an engine result into a customer-facing option.
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

/**
 * GOLD SAFETY GATE – COMBI
 *
 * Make sure a combi only sits as GOLD when it is genuinely appropriate.
 * Otherwise, if a storage option (Mixergy or unvented) is available,
 * promote that into GOLD and demote combi.
 */
function applyGoldSafetyGate(rankedIds = [], features = {}) {
  const result = [...rankedIds];

  if (result.length === 0) return result;

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

  // If GOLD is not a combi, or it is clearly acceptable, do nothing.
  if (goldId !== 'combi' || combiGoldIsAcceptable) {
    return result;
  }

  // Otherwise, try to promote a storage option into GOLD.
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
  if (!features || !Array.isArray(orderedRecs) || orderedRecs.length === 0) return orderedRecs;

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

  // Add any records not covered by the gate back on the end.
  orderedRecs.forEach((rec) => {
    if (!reordered.includes(rec)) {
      reordered.push(rec);
    }
  });

  return reordered;
}

/**
 * Helper to check when something has been explicitly recommended in the requirements.
 */
function isExplicitRecommendation(recommendationKey, requirements) {
  if (!Array.isArray(requirements?.expertRecommendations)) return false;

  const normalisedKey = recommendationKey?.replace(/_/g, '-');

  return requirements.expertRecommendations.some(
    (key) => key === recommendationKey || key === normalisedKey
  );
}

/**
 * MIXERGY SAFETY GATE
 *
 * Stop Mixergy from being "default GOLD" unless:
 *  - PV / EV / future HP is relevant, or
 *  - the expertRecommendations explicitly call out Mixergy.
 *
 * If Mixergy is GOLD and those conditions are NOT met,
 * try to swap GOLD with an unvented system instead.
 */
function applyMixergySafetyGateToRecommendations(orderedRecs, requirements = {}, features = {}) {
  if (!Array.isArray(orderedRecs) || orderedRecs.length === 0) return orderedRecs;

  const first = orderedRecs[0];
  if (!first || first.optionKey !== 'system_mixergy') return orderedRecs;

  const wantsSolarPv =
    features.wantsSolarPv ?? requirements.wantsSolarPv ?? false;
  const futureHeatPump =
    features.futureHeatPump ?? requirements.futureHeatPump ?? false;

  const explicitlyWantsMixergy =
    isExplicitRecommendation('system-mixergy', requirements) ||
    isExplicitRecommendation('system_mixergy', requirements);

  // If there is a clear reason to keep Mixergy as GOLD, leave it alone.
  if (explicitlyWantsMixergy || wantsSolarPv || futureHeatPump) {
    return orderedRecs;
  }

  // Otherwise, try to promote unvented storage to GOLD instead.
  const copy = [...orderedRecs];
  const idxUnvented = copy.findIndex((rec) => rec.optionKey === 'system_unvented');

  if (idxUnvented > 0) {
    const tmp = copy[0];
    copy[0] = copy[idxUnvented];
    copy[idxUnvented] = tmp;
    return copy;
  }

  // If there is no unvented candidate, we leave Mixergy as GOLD –
  // the engine simply hasn't offered a plain-unvented option.
  return orderedRecs;
}

/**
 * Turn a single engine recommendation into a customer-facing option object.
 */
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

/**
 * Get raw ranked engine results restricted to mapped option keys.
 */
export function rankOptionsWithEngine(
  requirements = {},
  allowedOptionKeys = Object.values(ENGINE_TO_OPTION_KEY)
) {
  const { recommendations = [] } = generateRecommendations(requirements);

  return recommendations
    .filter((rec) => allowedOptionKeys.includes(ENGINE_TO_OPTION_KEY[rec.key]))
    .map((rec) => ({ ...rec, optionKey: ENGINE_TO_OPTION_KEY[rec.key] }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Optional explicit ordering (e.g. force storage to appear above combi in the list).
 */
function orderRecommendations(ranked, optionOrder = []) {
  if (!Array.isArray(optionOrder) || optionOrder.length === 0) return ranked;

  const seen = new Set();
  const ordered = [];

  optionOrder.forEach((optionKey) => {
    const match = ranked.find(
      (rec) => rec.optionKey === optionKey || rec.key === optionKey
    );
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

/**
 * Main entry: build proposal options + keep the underlying ranked list.
 *
 * - requirements: full requirements object passed into the engine
 * - optionOrder: optional explicit ordering of option keys
 * - allowedOptionKeys: restrict which keys are even allowed (e.g. ban combis)
 * - customerFeatures: simple boolean flags used for the safety gates
 */
export function getProposalOptions(
  requirements = {},
  optionOrder,
  allowedOptionKeys,
  customerFeatures
) {
  const ranked = rankOptionsWithEngine(
    requirements,
    allowedOptionKeys || Object.values(ENGINE_TO_OPTION_KEY)
  );

  // Apply any explicit ordering first.
  const ordered = orderRecommendations(ranked, optionOrder);

  // 1) Make sure combi isn't GOLD when obviously wrong.
  const combiSafe = applyGoldSafetyGateToRecommendations(
    ordered,
    customerFeatures
  );

  // 2) Make sure Mixergy isn't default GOLD without PV / HP / explicit rec.
  const fullySafe = applyMixergySafetyGateToRecommendations(
    combiSafe,
    requirements,
    customerFeatures || {}
  );

  // Map top 3 to proposal options.
  const options = fullySafe
    .slice(0, 3)
    .map((rec, idx) => mapEngineResultToOption(rec, TIER_LABELS[idx], requirements))
    .filter(Boolean);

  return {
    options,
    ranked: fullySafe,
  };
}
