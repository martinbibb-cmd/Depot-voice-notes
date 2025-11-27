/**
 * System Recommendation Service
 *
 * Bridge between depot-voice-notes survey data and the system-recommendation engine.
 *
 * DATA FLOW:
 * 1. depot-voice-notes survey JSON (sections, notes, requirements)
 *    ↓
 * 2. buildRecommendationsFromDepotSurvey() [this file]
 *    ↓
 * 3. SystemRecommendationInput (mapped/normalized)
 *    ↓
 * 4. getSystemRecommendations() [systemRecommendationEngine.js]
 *    ↓
 * 5. SystemRecommendationResult
 *    ↓
 * 6. Proposal UI (presentationAI.js, summaryController.js)
 *
 * This is the ONLY place that knows about both data shapes.
 */

import {
  getSystemRecommendations,
  systemProfiles,
  boilerLabels,
  waterLabels
} from '../lib/systemRecommendationEngine.js';

/**
 * @typedef {Object} DepotRequirements
 * @property {number} occupants
 * @property {number} bedrooms
 * @property {number} bathrooms
 * @property {string} houseType
 * @property {string} currentBoilerType - 'Combi'|'System'|'Regular'
 * @property {string} currentWaterSystem - 'On-demand'|'Unvented'|'Open vented'
 * @property {number} mainsPressure
 * @property {number} flowRate
 * @property {number} dailyDraws
 * @property {boolean} hasSpaceConstraints
 * @property {boolean} wantsSmartTech
 * @property {boolean} consideringRenewables
 * @property {string} budget - 'low'|'medium'|'high'
 * @property {string[]} expertRecommendations
 */

/**
 * Maps depot-voice-notes house type to system-recommendation format
 *
 * @param {string} depotHouseType - Depot house type
 * @returns {string} System-recommendation house type
 */
function mapHouseType(depotHouseType) {
  const type = (depotHouseType || '').toLowerCase();
  if (type === 'flat' || type === 'apartment' || type === 'bungalow') return 'flat/bungalow';
  if (type === 'terraced') return 'terraced';
  if (type === 'semi' || type === 'semi-detached') return 'semi';
  if (type === 'detached') return 'detached';

  // Default to terraced if unknown
  // TODO: Consider prompting user for house type if not detected
  return 'terraced';
}

/**
 * Maps depot-voice-notes boiler type to system-recommendation format
 *
 * @param {string} depotBoilerType - Depot boiler type ('Combi'|'System'|'Regular')
 * @returns {string} System-recommendation boiler type ('combi'|'system'|'regular')
 */
function mapBoilerType(depotBoilerType) {
  const type = (depotBoilerType || '').toLowerCase();
  if (type === 'combi') return 'combi';
  if (type === 'system') return 'system';
  if (type === 'regular') return 'regular';

  // Default to regular for unknown
  // TODO: Log warning when boiler type is unknown
  return 'regular';
}

/**
 * Maps depot-voice-notes water system to system-recommendation format
 *
 * @param {string} depotWaterSystem - Depot water system
 * @param {string} depotBoilerType - Depot boiler type (helps infer water system)
 * @returns {string} System-recommendation water type
 */
function mapWaterSystem(depotWaterSystem, depotBoilerType) {
  const system = (depotWaterSystem || '').toLowerCase();
  const boiler = (depotBoilerType || '').toLowerCase();

  // If boiler is combi, water must be on_demand
  if (boiler === 'combi') return 'on_demand';

  // Map based on water system description
  if (system.includes('on-demand') || system.includes('on demand')) return 'on_demand';
  if (system.includes('unvented') || system.includes('megaflo')) {
    if (system.includes('mixergy')) return 'mixergy_unvented';
    return 'unvented';
  }
  if (system.includes('open') || system.includes('vented') || system.includes('gravity')) {
    if (system.includes('mixergy')) return 'mixergy_open';
    return 'open_vented';
  }

  // Default to open_vented for regular boilers, unvented for system boilers
  // TODO: Consider improving detection logic with more context
  if (boiler === 'regular') return 'open_vented';
  if (boiler === 'system') return 'unvented';

  return 'open_vented';
}

/**
 * Estimates daily hot water draws based on occupants
 *
 * @param {number} occupants - Number of occupants
 * @param {number} dailyDraws - Existing daily draws (if specified)
 * @returns {number} Estimated daily draws
 */
function estimateDailyDraws(occupants, dailyDraws) {
  // If already specified, use it
  if (dailyDraws && dailyDraws > 0) return dailyDraws;

  // Standard estimation: 3 draws per person per day
  // (morning shower, evening hand wash, kitchen/utility)
  return Math.max(3, occupants * 3);
}

/**
 * Validates and normalizes pressure/flow data
 * Returns null if data is missing or invalid
 *
 * @param {number} pressure - Mains pressure in bar
 * @param {number} flow - Flow rate in L/min
 * @returns {{pressure: number, flow: number}|null} Normalized values or null if invalid
 */
function normalizeWaterSupply(pressure, flow) {
  // Don't apply defaults - return null if data is missing
  // This prevents generating recommendations for fictional customers
  if (!pressure || pressure <= 0 || !flow || flow <= 0) {
    return null;
  }

  return {
    pressure,
    flow
  };
}

/**
 * Validates that we have sufficient real customer data
 *
 * @param {DepotRequirements} requirements - Depot survey requirements
 * @returns {boolean} True if we have enough real data to generate recommendations
 */
function hasSufficientData(requirements) {
  // Check for critical customer data
  const hasOccupants = requirements.occupants && requirements.occupants > 0;
  const hasBathrooms = requirements.bathrooms && requirements.bathrooms > 0;
  const hasPressure = requirements.mainsPressure && requirements.mainsPressure > 0;
  const hasFlow = requirements.flowRate && requirements.flowRate > 0;

  // We need at least occupants/bathrooms AND water supply data
  return hasOccupants && hasBathrooms && hasPressure && hasFlow;
}

/**
 * Main service function: Converts depot survey data into system recommendations
 *
 * @param {DepotRequirements} requirements - Depot survey requirements
 * @returns {Promise<SystemRecommendationResult>} Recommendation result
 */
export async function buildRecommendationsFromDepotSurvey(requirements) {
  try {
    // CRITICAL: Check if we have sufficient real customer data
    // Do NOT generate recommendations for missing/fictional data
    if (!hasSufficientData(requirements)) {
      console.warn('⚠️ Insufficient survey data for recommendations:', {
        occupants: requirements.occupants,
        bathrooms: requirements.bathrooms,
        mainsPressure: requirements.mainsPressure,
        flowRate: requirements.flowRate
      });

      return {
        options: [],
        reasoningSummary: 'Insufficient survey data. Please complete the property survey first.',
        inputs: {},
        error: 'Missing required customer data (occupants, bathrooms, water pressure/flow)'
      };
    }

    // Validate and normalize water supply data
    const waterSupply = normalizeWaterSupply(requirements.mainsPressure, requirements.flowRate);

    if (!waterSupply) {
      console.warn('⚠️ Invalid water supply data');
      return {
        options: [],
        reasoningSummary: 'Invalid water supply data. Please complete the water pressure test.',
        inputs: {},
        error: 'Invalid water pressure or flow rate data'
      };
    }

    const input = {
      houseType: mapHouseType(requirements.houseType),
      occupants: requirements.occupants,  // No defaults - use real data only
      bathrooms: requirements.bathrooms,  // No defaults - use real data only
      drawsPerDay: estimateDailyDraws(requirements.occupants, requirements.dailyDraws),
      currentBoiler: mapBoilerType(requirements.currentBoilerType),
      currentWater: mapWaterSystem(requirements.currentWaterSystem, requirements.currentBoilerType),
      mainsPressure: waterSupply.pressure,
      flowRate: waterSupply.flow,
      hasSpaceConstraints: Boolean(requirements.hasSpaceConstraints),
      wantsSmartTech: Boolean(requirements.wantsSmartTech),
      consideringRenewables: Boolean(requirements.consideringRenewables)
    };

    // Call the recommendation engine
    const result = getSystemRecommendations(input);

    // Optionally enhance with depot-specific context
    // TODO: Could add cost estimates from depot pricebook here
    // TODO: Could incorporate expert recommendations from transcript

    return result;

  } catch (error) {
    console.error('❌ System recommendation engine failed:', error);

    // Return a safe fallback result
    // This ensures the UI doesn't break if the engine fails
    return {
      options: [],
      reasoningSummary: 'Unable to generate recommendations. Please check survey data.',
      inputs: {},
      error: error.message
    };
  }
}

/**
 * Convenience function: Get just the top 3 options for Gold/Silver/Bronze display
 *
 * @param {DepotRequirements} requirements - Depot survey requirements
 * @returns {Promise<{gold: SystemOption, silver: SystemOption, bronze: SystemOption}>}
 */
export async function getTopThreeRecommendations(requirements) {
  const result = await buildRecommendationsFromDepotSurvey(requirements);

  if (!result.options || result.options.length === 0) {
    return { gold: null, silver: null, bronze: null, error: result.error };
  }

  return {
    gold: result.options[0] || null,
    silver: result.options[1] || null,
    bronze: result.options[2] || null,
    reasoningSummary: result.reasoningSummary
  };
}

/**
 * Utility: Get a specific system profile by key
 *
 * @param {string} profileKey - Profile key (e.g., 'combi_on_demand')
 * @returns {SystemProfile|null} System profile
 */
export function getSystemProfile(profileKey) {
  return systemProfiles[profileKey] || null;
}

/**
 * Utility: Get all system profiles
 *
 * @returns {Object} All system profiles
 */
export function getAllSystemProfiles() {
  return systemProfiles;
}

// Re-export labels for convenience
export { boilerLabels, waterLabels };
