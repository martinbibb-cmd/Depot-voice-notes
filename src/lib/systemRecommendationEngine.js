/**
 * System Recommendation Engine
 *
 * Pure, side-effect-free module for heating system recommendations.
 * Extracted from https://github.com/martinbibb-cmd/System-recommendation
 *
 * Data flow:
 *   depot-voice-notes survey JSON
 *   → systemRecommendationService (adapter)
 *   → getSystemRecommendations() [this module]
 *   → SystemRecommendationResult
 *   → proposal UI
 */

// ============================================================================
// Type Definitions (JSDoc)
// ============================================================================

/**
 * @typedef {Object} SystemRecommendationInput
 * @property {string} houseType - 'flat/bungalow'|'terraced'|'semi'|'detached'
 * @property {number} occupants - Number of occupants
 * @property {number} bathrooms - Number of bathrooms
 * @property {number} drawsPerDay - Daily hot water draws (typically occupants * 3)
 * @property {string} currentBoiler - 'combi'|'regular'|'system'
 * @property {string} currentWater - 'on_demand'|'open_vented'|'unvented'|'mixergy_open'|'mixergy_unvented'
 * @property {number} mainsPressure - Mains water pressure in bar
 * @property {number} flowRate - Mains flow rate in L/min
 * @property {boolean} [wantsSmartTech] - Customer interested in smart controls/app
 * @property {boolean} [consideringRenewables] - Customer considering solar/heat pump/renewables
 */

/**
 * @typedef {Object} SystemOption
 * @property {string} id - Unique option ID (e.g., 'option-a')
 * @property {string} boiler - Boiler type: 'combi'|'regular'|'system'
 * @property {string} water - Water system: 'on_demand'|'open_vented'|'unvented'|'mixergy_open'|'mixergy_unvented'
 * @property {string} boilerLabel - Human-readable boiler label
 * @property {string} waterLabel - Human-readable water system label
 * @property {string} title - Option title
 * @property {number} score - Recommendation score
 * @property {number} dailyWasteL - Daily water waste in liters
 * @property {number} dailyOverheadKWh - Daily energy overhead in kWh
 * @property {number} dailyCylinderLoss - Daily cylinder standing loss in kWh
 * @property {string[]} pros - List of pros
 * @property {string[]} cons - List of cons
 * @property {Set<string>} relevant - Set of relevant pros/cons for this scenario
 * @property {SystemProfile} profile - Full system profile
 */

/**
 * @typedef {Object} SystemProfile
 * @property {string} label - Display name
 * @property {string} efficiency - Efficiency range (e.g., "88-91%")
 * @property {string} installCost - Installation cost description
 * @property {string} space - Space requirements
 * @property {string} lifespan - Expected lifespan
 * @property {number} maintenance - Maintenance score (1-5)
 * @property {string} hotWater - Hot water delivery description
 * @property {string} pressure - Pressure requirements
 * @property {string} renewables - Renewable integration capability
 * @property {string[]} strengths - List of strengths
 * @property {string[]} limitations - List of limitations
 * @property {string} bestFor - Best use case description
 */

/**
 * @typedef {Object} SystemRecommendationResult
 * @property {SystemOption[]} options - Array of evaluated options, sorted by score
 * @property {string} reasoningSummary - Summary of recommendation reasoning
 * @property {SystemRecommendationInput} inputs - Original input parameters
 */

// ============================================================================
// Core Data: System Profiles
// ============================================================================

/**
 * Comprehensive system profiles with technical characteristics.
 * Each profile represents a boiler + water system combination.
 */
export const systemProfiles = {
  combi_on_demand: {
    label: "Combi Boiler",
    efficiency: "83–86%",
    installCost: "Relative install cost: Low (baseline for like-for-like swaps)",
    space: "No cylinder",
    lifespan: "10–12 years",
    maintenance: 4,
    hotWater: "Instantaneous, but one outlet ~6–10 L/min typical",
    pressure: "Needs good mains (>1.5 bar, >14 L/min)",
    renewables: "Poor – no store for solar / HP",
    strengths: [
      "Compact, no tanks or cylinder",
      "Low standing losses",
      "Good for flats/small 1-bath with strong mains"
    ],
    limitations: [
      "Designed for one tap/shower at a time",
      "High water waste and cycling losses vs stored",
      "Shorter life vs stored systems",
      "Needs bigger gas than a 15 kW regular"
    ],
    bestFor: "Flats, small 1-bath homes with strong mains"
  },
  system_unvented: {
    label: "System Boiler (Unvented)",
    efficiency: "88–91%",
    installCost: "Relative install cost: Medium-high (cylinder + safety kit)",
    space: "Needs cylinder / airing cupboard",
    lifespan: "15–20 years",
    maintenance: 3,
    hotWater: "Stored, mains pressure, good multi-outlet",
    pressure: "Needs good mains pressure",
    renewables: "Excellent – PV, Mixergy, heat pumps",
    strengths: [
      "High performance, balanced pressure",
      "Supports multiple outlets/bathrooms",
      "Future-proof: solar / PV / HP ready",
      "Holds real-world efficiency near ≈94%"
    ],
    limitations: [
      "Higher install cost",
      "Needs space for cylinder and discharge",
      "G3 service/annual maintenance"
    ],
    bestFor: "Modern 2–4 bed homes with 1–2 baths"
  },
  system_open: {
    label: "System Boiler (Open-Vented)",
    efficiency: "87–90%",
    installCost: "Relative install cost: Medium (system boiler + keep vented tanks)",
    space: "Vented cylinder + loft tank",
    lifespan: "15–20 years",
    maintenance: 3,
    hotWater: "Stored, gravity or pumped (low pressure)",
    pressure: "Works with poor mains when boosted",
    renewables: "Good with solar coil / vented Mixergy",
    strengths: [
      "Modern boiler internals while keeping vented pipework",
      "External pumps and controls allow easy zoning",
      "Tolerant of legacy systems and solid-fuel links"
    ],
    limitations: [
      "Still relies on loft tanks unless upgraded",
      "Lower pressure comfort without pumps",
      "Lower efficiency in practice vs sealed unvented"
    ],
    bestFor: "Homes keeping vented hot water but wanting a system boiler plant"
  },
  regular_open: {
    label: "Regular Boiler (Open-Vented)",
    efficiency: "86–89%",
    installCost: "Relative install cost: Low-medium (staying vented keeps costs down)",
    space: "Loft tank + airing cupboard",
    lifespan: "15–25 years",
    maintenance: 2,
    hotWater: "Stored, gravity or pumped (low pressure)",
    pressure: "Works with poor mains",
    renewables: "Good with solar coil / vented Mixergy",
    strengths: [
      "Simple, tolerant, long life",
      "Good for poor mains / rural",
      "Low maintenance"
    ],
    limitations: [
      "Low pressure unless pumped",
      "Tanks in loft",
      "Less efficient than unvented in practice"
    ],
    bestFor: "Older houses, rural or low-pressure areas"
  },
  mixergy_open: {
    label: "Mixergy – Open-Vented (Smart Cylinder + Regular)",
    efficiency: "87–90%",
    installCost: "Relative install cost: Medium-high (smart cylinder premium)",
    space: "Vented cylinder + loft tank",
    lifespan: "20–25 years",
    maintenance: 3,
    hotWater: "Stored, stratified, gravity or pumped",
    pressure: "Works with poor mains",
    renewables: "Excellent – PV / boiler / HP compatible",
    strengths: [
      "Smart control, partial heat saves energy",
      "Stays vented → gentle on old pipework",
      "PV and future HP friendly"
    ],
    limitations: [
      "Still vented – needs loft tank & pump for power showers",
      "Higher capital than plain vented",
      "Needs space"
    ],
    bestFor: "Upgraded vented systems, low-pressure areas wanting smart control"
  },
  system_mixergy_open: {
    label: "Mixergy – Open-Vented (Smart Cylinder + System)",
    efficiency: "88–91%",
    installCost: "Relative install cost: Medium-high (smart cylinder premium)",
    space: "Vented cylinder + loft tank",
    lifespan: "20–25 years",
    maintenance: 3,
    hotWater: "Stored, smart stratified, gravity or pumped",
    pressure: "Works with poor mains",
    renewables: "Excellent – PV / boiler / HP compatible",
    strengths: [
      "Smart control reduces reheat with system boilers",
      "Gentle on existing vented pipework",
      "Easy future upgrade path to renewables"
    ],
    limitations: [
      "Loft tanks remain in place",
      "Premium kit cost vs plain cylinder",
      "Needs space for cylinder and F&E tank"
    ],
    bestFor: "Vented homes wanting smart cylinder control with a system boiler"
  },
  regular_unvented: {
    label: "Regular Boiler (Unvented)",
    efficiency: "87–90%",
    installCost: "Relative install cost: Medium-high (conversion to sealed + safety kit)",
    space: "Unvented cylinder",
    lifespan: "15–20 years",
    maintenance: 3,
    hotWater: "Stored, mains pressure, multi-outlet",
    pressure: "Needs good mains pressure",
    renewables: "Good – works with solar coils and diverters",
    strengths: [
      "Keeps familiar regular boiler layout",
      "Delivers mains-pressure hot water across outlets",
      "Compatible with solar thermal and PV dump controls"
    ],
    limitations: [
      "Conversion work and discharge pipework add cost",
      "Requires G3 maintenance and safety checks",
      "Sealing old pipework needs careful system prep"
    ],
    bestFor: "Upgrading vented regular systems where mains can support sealed hot water"
  },
  mixergy_unvented: {
    label: "Mixergy – Unvented (Smart Cylinder + System)",
    efficiency: "89–92%",
    installCost: "Relative install cost: High (premium smart unvented setup)",
    space: "Unvented cylinder",
    lifespan: "20–25 years",
    maintenance: 3,
    hotWater: "Stored, mains pressure, multi-outlet",
    pressure: "Needs strong mains",
    renewables: "Excellent – PV, HP, dynamic tariffs",
    strengths: [
      "High performance, future-proof",
      "Smart energy savings",
      "Mains pressure hot water"
    ],
    limitations: [
      "High capital cost",
      "G3 requirements",
      "Needs good mains pressure"
    ],
    bestFor: "Modern medium-large homes, multi-bath setups"
  },
  regular_mixergy_unvented: {
    label: "Mixergy – Unvented (Smart Cylinder + Regular)",
    efficiency: "88–91%",
    installCost: "Relative install cost: High (smart unvented + system conversion)",
    space: "Unvented smart cylinder",
    lifespan: "20–25 years",
    maintenance: 3,
    hotWater: "Stored, mains pressure, smart stratification",
    pressure: "Needs good mains pressure",
    renewables: "Excellent – PV, heat pump, dynamic tariffs",
    strengths: [
      "Retains regular boiler hardware with mains-pressure hot water",
      "Smart control cuts reheat losses and works with PV",
      "Future-ready for hybrid heat sources"
    ],
    limitations: [
      "Requires sealed conversion and G3 servicing",
      "High capital cost vs plain vented regular",
      "Needs strong incoming mains pressure"
    ],
    bestFor: "Households wanting to keep a regular boiler but gain smart unvented performance"
  },
  thermal_store: {
    label: "Thermal Store Cylinder",
    efficiency: "85–90%",
    installCost: "Relative install cost: Medium-high (store + controls)",
    space: "Thermal store / airing cupboard",
    lifespan: "15–20 years",
    maintenance: 3,
    hotWater: "Stored, instantaneous via plate, mains pressure",
    pressure: "Needs good mains and careful design",
    renewables: "Excellent – supports multiple heat sources",
    strengths: [
      "Integrates boilers, solar, stoves and heat pumps",
      "Mains-pressure hot water without G3 discharge",
      "Enables load shifting with PV diverters"
    ],
    limitations: [
      "Higher standing losses than simple cylinders",
      "Complex controls need specialist commissioning",
      "Requires space and good insulation"
    ],
    bestFor: "Homes linking multiple heat sources or wanting thermal buffering"
  }
};

// ============================================================================
// Core Data: System Performance Data
// ============================================================================

/**
 * Hard data for system performance calculations
 */
export const systemData = {
  combi: {
    baseWaste: {
      "flat/bungalow": 1,
      "terraced": 5.5,
      "semi": 5.5,
      "detached": 8
    },
    baseWait: {
      "flat/bungalow": 20,
      "terraced": 45,
      "semi": 45,
      "detached": 90
    },
    startupKWh: 0.025,
    postPurgeKWh: 0.015
  },
  stored: {
    wastePerDraw: 1.5,
    wait: 10,
    cylLoss: 1.5
  },
  pressureRequirements: {
    combi: {
      minPressure: 1.5,
      minFlowRate: 14,
      goodPressure: 2.0,
      goodFlowRate: 18
    },
    unvented: {
      minPressure: 1.5,
      minFlowRate: 12,
      goodPressure: 2.0,
      goodFlowRate: 16
    },
    openVented: {
      minPressure: 0.5,
      minFlowRate: 6,
      goodPressure: 1.0,
      goodFlowRate: 10
    }
  }
};

/**
 * Mapping from boiler|water combination to profile key
 */
export const profileKeyByCombo = {
  "combi|on_demand": "combi_on_demand",
  "regular|open_vented": "regular_open",
  "regular|mixergy_open": "mixergy_open",
  "regular|unvented": "regular_unvented",
  "regular|mixergy_unvented": "regular_mixergy_unvented",
  "system|unvented": "system_unvented",
  "system|mixergy_unvented": "mixergy_unvented",
  "system|open_vented": "system_open",
  "system|mixergy_open": "system_mixergy_open",
  "system|thermal_store": "thermal_store",
  "regular|thermal_store": "thermal_store"
};

/**
 * Human-readable labels for boiler types
 */
export const boilerLabels = {
  combi: "Combi",
  regular: "Regular",
  system: "System"
};

/**
 * Human-readable labels for water systems
 */
export const waterLabels = {
  on_demand: "On-demand (Combi)",
  open_vented: "Open-Vented",
  unvented: "Unvented (Megaflo-style)",
  mixergy_open: "Mixergy (Open-Vented)",
  mixergy_unvented: "Mixergy (Unvented)",
  thermal_store: "Thermal Store"
};

// ============================================================================
// Core Logic: System Evaluation
// ============================================================================

/**
 * Evaluates a single system option against the input requirements.
 * Returns a score, pros, cons, and performance metrics.
 *
 * @param {string} boiler - Boiler type
 * @param {string} water - Water system type
 * @param {SystemRecommendationInput} input - Input requirements
 * @returns {Object} Evaluation result with score, pros, cons, metrics
 */
function evaluateOption(boiler, water, input) {
  const {
    houseType,
    occupants,
    bathrooms,
    drawsPerDay,
    currentBoiler,
    currentWater,
    mainsPressure,
    flowRate,
    wantsSmartTech,
    consideringRenewables
  } = input;

  const isCombi = boiler === "combi";
  const isStored = water === "unvented" || water === "mixergy_unvented" ||
                   water === "open_vented" || water === "mixergy_open" ||
                   water === "on_demand";
  const isCurrentOpen = currentWater === "open_vented" || currentWater === "mixergy_open";
  const isUnvented = water === "unvented" || water === "mixergy_unvented";
  const isOpenVented = water === "open_vented" || water === "mixergy_open";
  const isMixergy = water === "mixergy_unvented" || water === "mixergy_open";
  const isThermalStore = water === "thermal_store";

  let score = 0;
  let dailyWasteL = 0;
  let dailyOverheadKWh = 0;
  let dailyCylinderLoss = 0;
  const pros = [];
  const cons = [];
  const relevant = new Set();

  // Performance evaluation
  if (isCombi) {
    const wastePerDraw = systemData.combi.baseWaste[houseType] ?? 5.5;
    const wait = systemData.combi.baseWait[houseType] ?? 45;
    dailyWasteL = wastePerDraw * drawsPerDay;
    dailyOverheadKWh = (systemData.combi.startupKWh + systemData.combi.postPurgeKWh) * drawsPerDay;
    pros.push("Single appliance, frees space");
    cons.push(`Hot water lag ${wait}s to tap`);
    cons.push(`Wastes about ${wastePerDraw.toFixed(1)} L per draw (${dailyWasteL.toFixed(1)} L/day)`);
    cons.push(`Per-draw energy overhead ≈ ${dailyOverheadKWh.toFixed(2)} kWh/day`);

    // Suitability
    if (occupants <= 3 && bathrooms <= 2) {
      score += 3;
      relevant.add("pros:Single appliance, frees space");
    } else {
      score -= 2;
      relevant.add(`cons:Hot water lag ${wait}s to tap`);
    }
  } else {
    // Stored / cylinder
    dailyWasteL = systemData.stored.wastePerDraw * drawsPerDay;
    dailyCylinderLoss = systemData.stored.cylLoss;
    pros.push("Shorter tap-to-hot, better comfort");
    pros.push("Longer boiler burns → better modulation");
    cons.push(`Cylinder standing loss ≈ ${dailyCylinderLoss.toFixed(1)} kWh/day`);
    score += 3;
    if (occupants >= 4 || bathrooms >= 2) {
      pros.push("Better for multiple/simultaneous draws");
      score += 2;
      relevant.add("pros:Better for multiple/simultaneous draws");
    }
  }

  // Water pressure evaluation
  if (isCombi) {
    const reqs = systemData.pressureRequirements.combi;
    if (mainsPressure < reqs.minPressure || flowRate < reqs.minFlowRate) {
      cons.push(`⚠ Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – below combi minimum (${reqs.minPressure} bar / ${reqs.minFlowRate} L/min)`);
      score -= 5;
      relevant.add(`cons:⚠ Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – below combi minimum (${reqs.minPressure} bar / ${reqs.minFlowRate} L/min)`);
    } else if (mainsPressure < reqs.goodPressure || flowRate < reqs.goodFlowRate) {
      cons.push(`Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – marginal for combi (best: >${reqs.goodPressure} bar / ${reqs.goodFlowRate} L/min)`);
      score -= 2;
      relevant.add(`cons:Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – marginal for combi (best: >${reqs.goodPressure} bar / ${reqs.goodFlowRate} L/min)`);
    } else {
      pros.push(`✓ Water pressure test confirms good supply for combi (${mainsPressure} bar / ${flowRate} L/min)`);
      score += 2;
      relevant.add(`pros:✓ Water pressure test confirms good supply for combi (${mainsPressure} bar / ${flowRate} L/min)`);
    }
  } else if (isUnvented) {
    const reqs = systemData.pressureRequirements.unvented;
    if (mainsPressure < reqs.minPressure || flowRate < reqs.minFlowRate) {
      cons.push(`⚠ Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – below unvented minimum (${reqs.minPressure} bar / ${reqs.minFlowRate} L/min)`);
      score -= 4;
      relevant.add(`cons:⚠ Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – below unvented minimum (${reqs.minPressure} bar / ${reqs.minFlowRate} L/min)`);
    } else if (mainsPressure < reqs.goodPressure || flowRate < reqs.goodFlowRate) {
      cons.push(`Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – adequate for unvented (best: >${reqs.goodPressure} bar / ${reqs.goodFlowRate} L/min)`);
      score -= 1;
      relevant.add(`cons:Water pressure test shows ${mainsPressure} bar / ${flowRate} L/min – adequate for unvented (best: >${reqs.goodPressure} bar / ${reqs.goodFlowRate} L/min)`);
    } else {
      pros.push(`✓ Water pressure test confirms good supply for unvented (${mainsPressure} bar / ${flowRate} L/min)`);
      score += 2;
      relevant.add(`pros:✓ Water pressure test confirms good supply for unvented (${mainsPressure} bar / ${flowRate} L/min)`);
    }
  } else if (isOpenVented) {
    const reqs = systemData.pressureRequirements.openVented;
    if (mainsPressure < reqs.minPressure || flowRate < reqs.minFlowRate) {
      pros.push(`✓ Open vented system works with your low pressure (${mainsPressure} bar / ${flowRate} L/min)`);
      score += 3;
      relevant.add(`pros:✓ Open vented system works with your low pressure (${mainsPressure} bar / ${flowRate} L/min)`);
    } else if (mainsPressure >= reqs.goodPressure && flowRate >= reqs.goodFlowRate) {
      cons.push(`Your good water pressure test (${mainsPressure} bar / ${flowRate} L/min) is under-utilized by open vented – consider sealed systems`);
      score -= 1;
      relevant.add(`cons:Your good water pressure test (${mainsPressure} bar / ${flowRate} L/min) is under-utilized by open vented – consider sealed systems`);
    } else {
      pros.push(`✓ Open vented system works with your pressure (${mainsPressure} bar / ${flowRate} L/min)`);
      score += 1;
      relevant.add(`pros:✓ Open vented system works with your pressure (${mainsPressure} bar / ${flowRate} L/min)`);
    }
  }

  // Cost / disruption factors
  // 1) Open vented → unvented
  if (isCurrentOpen && (water === "unvented" || water === "mixergy_unvented")) {
    cons.push("Open-vented → unvented typically adds a notable premium for upgrade work");
    score -= 1;
    relevant.add("cons:Open-vented → unvented typically adds a notable premium for upgrade work");
  }
  // 2) Stored → combi (common UK reality: noticeable extra labour/material)
  if (boiler === "combi" && currentBoiler !== "combi") {
    cons.push("Converting to a combi from stored often adds a noticeable premium for pipework and cylinder removal");
    score -= 1;
    relevant.add("cons:Converting to a combi from stored often adds a noticeable premium for pipework and cylinder removal");
  }
  // 3) Like-for-like
  if (boiler === currentBoiler && water === currentWater) {
    pros.push("Like-for-like keeps cost and disruption low");
    score += 2;
    relevant.add("pros:Like-for-like keeps cost and disruption low");
  }

  // 4) Smart tech preference
  if (wantsSmartTech && isMixergy) {
    pros.push("✓ Mixergy smart cylinder with app control and intelligent heating");
    score += 4; // Strong bonus for matching smart tech preference
    relevant.add("pros:✓ Mixergy smart cylinder with app control and intelligent heating");
  } else if (wantsSmartTech && !isMixergy && !isCombi) {
    cons.push("Standard cylinder lacks smart features and app control");
    score -= 1;
  }

  // 5) Renewable energy readiness
  if (consideringRenewables) {
    if (isMixergy || isThermalStore) {
      pros.push("✓ Excellent for solar PV, heat pumps, and dynamic tariffs");
      score += 3;
      relevant.add("pros:✓ Excellent for solar PV, heat pumps, and dynamic tariffs");
    } else if (isUnvented && !isMixergy) {
      pros.push("✓ Compatible with solar thermal and PV diverters");
      score += 2;
      relevant.add("pros:✓ Compatible with solar thermal and PV diverters");
    } else if (isOpenVented && !isMixergy) {
      pros.push("Works with solar coil but limited smart control");
      score += 1;
    } else if (isCombi) {
      cons.push("Poor renewable integration – no thermal store");
      score -= 2;
      relevant.add("cons:Poor renewable integration – no thermal store");
    }
  }

  // 6) Pressure utilization bonus (reward systems that make good use of available pressure)
  if (mainsPressure >= 1.5 && flowRate >= 12) {
    // Good pressure available
    if (isUnvented) {
      // Unvented systems make best use of good pressure
      pros.push("✓ Unvented system maximizes your good mains pressure");
      score += 2;
      relevant.add("pros:✓ Unvented system maximizes your good mains pressure");
    } else if (isOpenVented) {
      // Open vented wastes good pressure (already penalized above, but reinforce)
      score -= 1; // Additional penalty for wasting good pressure
    }
  }

  return {
    score,
    dailyWasteL,
    dailyOverheadKWh,
    dailyCylinderLoss,
    pros,
    cons,
    relevant
  };
}

/**
 * Picks the correct system profile key based on boiler and water combination
 *
 * @param {string} boiler - Boiler type
 * @param {string} water - Water system type
 * @returns {string} Profile key
 */
function pickSystemProfile(boiler, water) {
  const key = `${boiler}|${water}`;
  return profileKeyByCombo[key] || "combi_on_demand";
}

// ============================================================================
// Main Export: Get System Recommendations
// ============================================================================

/**
 * Main recommendation function. Evaluates all viable system options and returns
 * them ranked by score.
 *
 * This is the ONLY function that depot-voice-notes should call.
 *
 * @param {SystemRecommendationInput} input - Property and system requirements
 * @returns {SystemRecommendationResult} Ranked options with reasoning
 */
export function getSystemRecommendations(input) {
  // Define all system options to evaluate
  const systemOptions = [
    { id: "combi", boiler: "combi", water: "on_demand" },
    { id: "system-unvented", boiler: "system", water: "unvented" },
    { id: "system-mixergy-unvented", boiler: "system", water: "mixergy_unvented" },
    { id: "system-open", boiler: "system", water: "open_vented" },
    { id: "system-mixergy-open", boiler: "system", water: "mixergy_open" },
    { id: "regular-open", boiler: "regular", water: "open_vented" },
    { id: "regular-mixergy-open", boiler: "regular", water: "mixergy_open" },
    { id: "regular-unvented", boiler: "regular", water: "unvented" },
    { id: "regular-mixergy-unvented", boiler: "regular", water: "mixergy_unvented" }
  ];

  // Evaluate each option
  const evaluatedOptions = systemOptions.map(opt => {
    const evaluation = evaluateOption(opt.boiler, opt.water, input);
    const profileKey = pickSystemProfile(opt.boiler, opt.water);
    const profile = systemProfiles[profileKey];

    return {
      ...opt,
      ...evaluation,
      boilerLabel: boilerLabels[opt.boiler],
      waterLabel: waterLabels[opt.water],
      title: profile.label,
      profile
    };
  });

  // Sort by score descending
  evaluatedOptions.sort((a, b) => b.score - a.score);

  // Generate reasoning summary
  const best = evaluatedOptions[0];
  const reasoningSummary = generateReasoningSummary(best, input);

  return {
    options: evaluatedOptions,
    reasoningSummary,
    inputs: input
  };
}

/**
 * Generates a human-readable summary of why the top option was recommended
 *
 * @param {SystemOption} option - Top-ranked option
 * @param {SystemRecommendationInput} input - Original inputs
 * @returns {string} Reasoning summary
 */
function generateReasoningSummary(option, input) {
  const parts = [];

  parts.push(`Based on your property (${input.houseType}, ${input.occupants} occupants, ${input.bathrooms} bathrooms), `);
  parts.push(`mains supply (${input.mainsPressure} bar, ${input.flowRate} L/min), `);
  parts.push(`and current system (${input.currentBoiler} boiler with ${input.currentWater} hot water), `);
  parts.push(`we recommend: **${option.title}** (score: ${option.score}).`);

  if (option.relevant.size > 0) {
    parts.push("\n\nKey factors:");
    const relevantList = Array.from(option.relevant).slice(0, 3);
    relevantList.forEach(r => {
      const [type, text] = r.split(":");
      parts.push(`\n- ${text}`);
    });
  }

  return parts.join("");
}
