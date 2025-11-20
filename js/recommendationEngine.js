/**
 * Heating System Recommendation Engine
 * Analyzes transcript data to recommend optimal heating systems
 * Based on martinbibb-cmd/System-recommendation logic
 */

/**
 * System configurations with their characteristics
 */
const SYSTEM_PROFILES = {
  'combi': {
    name: 'Combi Boiler',
    boilerType: 'Combi',
    waterSystem: 'On-demand',
    image: 'Combination.png',
    strengths: [
      'Space-saving (no cylinder/tanks)',
      'Instant hot water on demand',
      'Lower installation cost',
      'Mains pressure throughout',
      'Simple system with fewer components'
    ],
    limitations: [
      'Flow rate limited by boiler capacity',
      'Simultaneous demand reduces performance',
      'Requires good mains pressure (≥1.5 bar)',
      'Per-draw energy waste (~5.5L per use)',
      'Not ideal for larger households (4+ people)'
    ],
    efficiency: '90-94%',
    installCost: 'Low-Medium',
    lifespan: '10-15 years',
    bestFor: '1-3 occupants, 1-2 bathrooms, good mains pressure',
    suitableFor: {
      maxOccupants: 3,
      maxBathrooms: 2,
      requiresPressure: 1.5,
      requiresFlowRate: 14
    }
  },
  'system-unvented': {
    name: 'System Boiler (Unvented Cylinder)',
    boilerType: 'System',
    waterSystem: 'Unvented',
    image: 'System-boiler.png',
    strengths: [
      'Excellent flow to multiple outlets',
      'Can serve larger households efficiently',
      'Mains pressure hot water',
      'Compact (no loft tanks)',
      'Simultaneous use capability'
    ],
    limitations: [
      'Requires space for cylinder',
      'Higher installation cost',
      'Standing heat loss (~1.5 kWh/day)',
      'Annual safety valve checks required',
      'Needs good mains pressure'
    ],
    efficiency: '88-92%',
    installCost: 'Medium-High',
    lifespan: '15-20 years',
    bestFor: '3-6 occupants, 2-4 bathrooms, multiple simultaneous users',
    suitableFor: {
      maxOccupants: 6,
      maxBathrooms: 4,
      requiresPressure: 1.5,
      requiresFlowRate: 12
    }
  },
  'regular-openvented': {
    name: 'Regular Boiler (Open Vented)',
    boilerType: 'Regular',
    waterSystem: 'Open vented',
    image: 'Open-vented-schematic.jpeg',
    strengths: [
      'Works with any water pressure',
      'Compatible with existing gravity systems',
      'Lower conversion cost if already open-vented',
      'Simultaneous use from stored water',
      'Proven traditional technology'
    ],
    limitations: [
      'Requires loft space for tanks',
      'Lower water pressure',
      'More complex pipework',
      'Slower hot water recovery',
      'Not suitable for mains pressure showers without pumps'
    ],
    efficiency: '85-90%',
    installCost: 'Medium (Low if converting from existing)',
    lifespan: '15-20 years',
    bestFor: 'Poor water pressure, existing open-vented systems, traditional setups',
    suitableFor: {
      maxOccupants: 8,
      maxBathrooms: 3,
      requiresPressure: 0,
      requiresFlowRate: 0
    }
  },
  'system-mixergy': {
    name: 'System Boiler (Mixergy Smart Cylinder)',
    boilerType: 'System',
    waterSystem: 'Mixergy',
    image: 'System-boiler.png',
    strengths: [
      'Smart stratified heating (heat only what you need)',
      'App control and monitoring',
      'Faster heat-up times',
      'Energy savings vs conventional cylinders',
      'Integration with renewables'
    ],
    limitations: [
      'Higher initial cost',
      'Requires WiFi/app for full benefits',
      'Still needs cylinder space',
      'Relatively new technology',
      'Standing losses (though reduced)'
    ],
    efficiency: '92-95%',
    installCost: 'High',
    lifespan: '15-20 years',
    bestFor: 'Tech-savvy households, future-proofing, renewable integration',
    suitableFor: {
      maxOccupants: 6,
      maxBathrooms: 4,
      requiresPressure: 1.5,
      requiresFlowRate: 12
    }
  },
  'regular-thermal': {
    name: 'Regular Boiler (Thermal Store)',
    boilerType: 'Regular',
    waterSystem: 'Thermal store',
    image: 'System-boiler.png',
    strengths: [
      'Excellent for multi-fuel systems',
      'Mains pressure hot water',
      'Works with renewables (solar, heat pumps)',
      'No annual safety checks required',
      'Flexible heating integration'
    ],
    limitations: [
      'Large cylinder required',
      'Higher heat losses than unvented',
      'More expensive installation',
      'Complex system design',
      'Limited installer familiarity'
    ],
    efficiency: '85-88%',
    installCost: 'High',
    lifespan: '20-25 years',
    bestFor: 'Renewable integration, multi-fuel systems, off-grid',
    suitableFor: {
      maxOccupants: 8,
      maxBathrooms: 4,
      requiresPressure: 0,
      requiresFlowRate: 0
    }
  }
};

/**
 * Extract heating system requirements from transcript data
 */
export function extractHeatingRequirements(sections, notes) {
  const requirements = {
    occupants: 0,
    bedrooms: 0,
    bathrooms: 0,
    houseType: '',
    currentBoilerType: '',
    currentWaterSystem: '',
    mainsPressure: 0,
    flowRate: 0,
    dailyDraws: 0,
    hasSpaceConstraints: false,
    wantsSmartTech: false,
    consideringRenewables: false,
    budget: ''
  };

  // Combine all text from sections and notes
  const allText = [
    ...sections.map(s => `${s.plainText || ''} ${s.naturalLanguage || ''}`),
    ...notes
  ].join(' ').toLowerCase();

  // Extract occupants
  const occupantMatch = allText.match(/(\d+)\s*(?:people|persons|occupants|family members)/i);
  if (occupantMatch) requirements.occupants = parseInt(occupantMatch[1]);

  // Extract bedrooms
  const bedroomMatch = allText.match(/(\d+)\s*bed(?:room)?s?/i);
  if (bedroomMatch) requirements.bedrooms = parseInt(bedroomMatch[1]);

  // Extract bathrooms
  const bathroomMatch = allText.match(/(\d+)\s*bath(?:room)?s?/i);
  if (bathroomMatch) requirements.bathrooms = parseInt(bathroomMatch[1]);

  // House type
  if (allText.includes('flat') || allText.includes('apartment')) requirements.houseType = 'flat';
  else if (allText.includes('terraced')) requirements.houseType = 'terraced';
  else if (allText.includes('semi-detached') || allText.includes('semi detached')) requirements.houseType = 'semi';
  else if (allText.includes('detached')) requirements.houseType = 'detached';

  // Current boiler type
  if (allText.includes('combi')) requirements.currentBoilerType = 'Combi';
  else if (allText.includes('system boiler')) requirements.currentBoilerType = 'System';
  else if (allText.includes('regular boiler') || allText.includes('conventional boiler')) requirements.currentBoilerType = 'Regular';

  // Current water system
  if (allText.includes('open vented') || allText.includes('gravity') || allText.includes('tank in loft')) {
    requirements.currentWaterSystem = 'Open vented';
  } else if (allText.includes('unvented') || allText.includes('megaflo') || allText.includes('pressurised cylinder')) {
    requirements.currentWaterSystem = 'Unvented';
  } else if (allText.includes('combi')) {
    requirements.currentWaterSystem = 'On-demand';
  }

  // Mains pressure (bar)
  const pressureMatch = allText.match(/(\d+\.?\d*)\s*bar/i);
  if (pressureMatch) requirements.mainsPressure = parseFloat(pressureMatch[1]);

  // Flow rate (L/min)
  const flowMatch = allText.match(/(\d+\.?\d*)\s*(?:l\/min|litres? per min)/i);
  if (flowMatch) requirements.flowRate = parseFloat(flowMatch[1]);

  // Estimate values if not found
  if (!requirements.occupants && requirements.bedrooms) {
    requirements.occupants = Math.max(2, requirements.bedrooms);
  }
  if (!requirements.bathrooms) {
    requirements.bathrooms = requirements.bedrooms >= 4 ? 2 : 1;
  }
  if (!requirements.dailyDraws) {
    requirements.dailyDraws = requirements.occupants * 3; // Estimate 3 draws per person
  }

  // Space constraints
  requirements.hasSpaceConstraints = allText.includes('no loft') ||
                                     allText.includes('limited space') ||
                                     allText.includes('small property') ||
                                     allText.includes('no room for cylinder');

  // Smart tech interest
  requirements.wantsSmartTech = allText.includes('smart') ||
                               allText.includes('app control') ||
                               allText.includes('wifi');

  // Renewables
  requirements.consideringRenewables = allText.includes('solar') ||
                                       allText.includes('heat pump') ||
                                       allText.includes('renewable');

  // Budget
  if (allText.includes('budget') || allText.includes('cheap') || allText.includes('cost-effective')) {
    requirements.budget = 'low';
  } else if (allText.includes('premium') || allText.includes('high-end')) {
    requirements.budget = 'high';
  } else {
    requirements.budget = 'medium';
  }

  return requirements;
}

/**
 * Score each system configuration based on requirements
 */
export function scoreSystem(systemKey, profile, requirements) {
  let score = 100; // Start with perfect score
  const reasons = [];

  // Household size matching
  if (requirements.occupants > 0) {
    if (systemKey === 'combi' && requirements.occupants > 3) {
      score -= 30;
      reasons.push(`Combi not ideal for ${requirements.occupants} occupants (designed for 1-3)`);
    } else if (systemKey === 'combi' && requirements.occupants <= 3) {
      score += 10;
      reasons.push('Combi well-suited to household size');
    }
  }

  // Bathroom count
  if (requirements.bathrooms > profile.suitableFor.maxBathrooms) {
    score -= 25;
    reasons.push(`May struggle with ${requirements.bathrooms} bathrooms (max recommended: ${profile.suitableFor.maxBathrooms})`);
  }

  // Water pressure requirements
  if (profile.suitableFor.requiresPressure > 0) {
    if (requirements.mainsPressure > 0 && requirements.mainsPressure < profile.suitableFor.requiresPressure) {
      score -= 40;
      reasons.push(`Insufficient mains pressure (${requirements.mainsPressure} bar, needs ${profile.suitableFor.requiresPressure} bar)`);
    } else if (requirements.mainsPressure >= profile.suitableFor.requiresPressure) {
      score += 10;
      reasons.push('Good mains pressure for this system');
    }
  } else if (systemKey === 'regular-openvented' && requirements.mainsPressure < 1.0) {
    score += 15;
    reasons.push('Open vented ideal for low pressure');
  }

  // Flow rate requirements
  if (profile.suitableFor.requiresFlowRate > 0 && requirements.flowRate > 0) {
    if (requirements.flowRate < profile.suitableFor.requiresFlowRate) {
      score -= 35;
      reasons.push(`Flow rate too low (${requirements.flowRate} L/min, needs ${profile.suitableFor.requiresFlowRate} L/min)`);
    }
  }

  // Conversion costs
  if (requirements.currentBoilerType && requirements.currentWaterSystem) {
    // Converting from open-vented to sealed is expensive
    if (requirements.currentWaterSystem === 'Open vented' &&
        (systemKey === 'combi' || systemKey === 'system-unvented')) {
      score -= 15;
      reasons.push('Conversion from open-vented adds cost and may expose existing leaks');
    } else if (requirements.currentWaterSystem === 'Open vented' && systemKey === 'regular-openvented') {
      score += 15;
      reasons.push('Like-for-like replacement keeps costs down');
    }

    // Converting from combi to stored hot water
    if (requirements.currentBoilerType === 'Combi' &&
        (systemKey === 'system-unvented' || systemKey === 'regular-openvented')) {
      score -= 10;
      reasons.push('Adding cylinder requires additional pipework and space');
    }
  }

  // Space constraints
  if (requirements.hasSpaceConstraints) {
    if (systemKey === 'combi') {
      score += 20;
      reasons.push('Combi ideal for limited space');
    } else if (systemKey.includes('regular')) {
      score -= 25;
      reasons.push('Requires loft tanks - may not fit');
    }
  }

  // Smart tech preference
  if (requirements.wantsSmartTech && systemKey === 'system-mixergy') {
    score += 15;
    reasons.push('Mixergy provides smart controls and app integration');
  }

  // Renewables integration
  if (requirements.consideringRenewables) {
    if (systemKey === 'regular-thermal') {
      score += 20;
      reasons.push('Thermal store excellent for renewable integration');
    } else if (systemKey === 'system-mixergy') {
      score += 10;
      reasons.push('Compatible with solar and heat pumps');
    }
  }

  // Budget considerations
  if (requirements.budget === 'low') {
    if (systemKey === 'combi') {
      score += 15;
      reasons.push('Lower installation cost');
    } else if (systemKey === 'system-mixergy' || systemKey === 'regular-thermal') {
      score -= 20;
      reasons.push('Higher initial investment required');
    }
  }

  // Energy efficiency scoring
  const efficiencyScore = parseFloat(profile.efficiency.split('-')[0]);
  score += (efficiencyScore - 85) / 2; // Bonus for higher efficiency

  return {
    score: Math.max(0, Math.min(100, score)), // Clamp between 0-100
    reasons
  };
}

/**
 * Generate recommendations based on requirements
 */
export function generateRecommendations(requirements) {
  const scored = [];

  // Score each system
  for (const [key, profile] of Object.entries(SYSTEM_PROFILES)) {
    const { score, reasons } = scoreSystem(key, profile, requirements);
    scored.push({
      key,
      profile,
      score,
      reasons
    });
  }

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Mark the top recommendation
  if (scored.length > 0) {
    scored[0].isRecommended = true;
  }

  return {
    requirements,
    recommendations: scored,
    bestOption: scored[0],
    alternatives: scored.slice(1, 3) // Top 2 alternatives
  };
}

/**
 * Get detailed explanation for a recommendation
 */
export function explainRecommendation(recommendation, requirements) {
  const { profile, score, reasons, isRecommended } = recommendation;

  const explanation = {
    title: isRecommended ? '✓ Recommended System' : 'Alternative Option',
    systemName: profile.name,
    score: Math.round(score),
    summary: generateSummary(profile, requirements, isRecommended),
    strengths: profile.strengths,
    limitations: profile.limitations,
    technicalDetails: {
      efficiency: profile.efficiency,
      installCost: profile.installCost,
      lifespan: profile.lifespan,
      bestFor: profile.bestFor
    },
    specificReasons: reasons,
    worksInvolved: generateWorksInvolved(profile, requirements),
    actionBenefits: generateActionBenefits(profile, requirements)
  };

  return explanation;
}

/**
 * Generate summary explanation
 */
function generateSummary(profile, requirements, isRecommended) {
  const parts = [];

  if (isRecommended) {
    parts.push(`Based on your ${requirements.occupants} occupant household with ${requirements.bathrooms} bathroom(s), `);
    parts.push(`the ${profile.name} is the optimal choice. `);
  } else {
    parts.push(`The ${profile.name} is a viable alternative. `);
  }

  if (profile.suitableFor.requiresPressure > 0 && requirements.mainsPressure >= profile.suitableFor.requiresPressure) {
    parts.push(`Your mains pressure (${requirements.mainsPressure} bar) is suitable for this system. `);
  } else if (profile.suitableFor.requiresPressure === 0) {
    parts.push(`This system works with any water pressure, making it reliable. `);
  }

  return parts.join('');
}

/**
 * Generate detailed works involved
 */
function generateWorksInvolved(profile, requirements) {
  const works = [];

  // Boiler installation
  works.push({
    category: 'Boiler Installation',
    items: [
      `Install new ${profile.boilerType} boiler`,
      'Connect to gas supply and flue',
      'Install condensate drain',
      'Fit controls and thermostat'
    ]
  });

  // Water system specific
  if (profile.waterSystem === 'Unvented' || profile.waterSystem === 'Mixergy') {
    works.push({
      category: 'Cylinder Installation',
      items: [
        `Install ${profile.waterSystem} cylinder (typically 150-300L)`,
        'Fit pressure relief and expansion valve',
        'Install tundish and discharge pipe',
        'Connect to mains cold water supply',
        profile.waterSystem === 'Mixergy' ? 'Configure smart controls and WiFi' : 'Insulate cylinder'
      ]
    });
  } else if (profile.waterSystem === 'Open vented') {
    works.push({
      category: 'Tank and Cylinder',
      items: [
        'Install cold water storage tank in loft',
        'Install feed and expansion tank',
        'Install vented hot water cylinder',
        'Run gravity feed pipework',
        'Insulate tanks and pipework'
      ]
    });
  }

  // Conversion works
  if (requirements.currentWaterSystem === 'Open vented' &&
      (profile.waterSystem === 'Unvented' || profile.waterSystem === 'On-demand')) {
    works.push({
      category: 'System Conversion',
      items: [
        'Remove existing tanks from loft',
        'Convert to sealed system',
        'Add system pressure vessel',
        'Install filling loop',
        'Pressure test system (may reveal existing leaks that need repair)'
      ]
    });
  }

  // Pipework
  works.push({
    category: 'Pipework',
    items: [
      'Run heating flow and return pipes',
      'Connect to existing radiators',
      'Install isolation valves',
      'Flush and clean system',
      'Add inhibitor and treat water'
    ]
  });

  // Commissioning
  works.push({
    category: 'Commissioning & Certification',
    items: [
      'Test all safety devices',
      'Balance radiator system',
      'Commission controls',
      'Issue Gas Safe certificate',
      'Provide Building Control notification',
      'Demonstrate operation to customer'
    ]
  });

  return works;
}

/**
 * Generate individual feature action benefits
 */
function generateActionBenefits(profile, requirements) {
  const benefits = [];

  // System-specific benefits
  if (profile.boilerType === 'Combi') {
    benefits.push({
      action: 'Removing tanks and cylinder',
      benefit: 'Frees up valuable storage space in loft and airing cupboard',
      annualSaving: '£50-100 (reduced standing losses)'
    });
    benefits.push({
      action: 'Direct mains connection',
      benefit: 'Instant hot water without waiting for cylinder to heat',
      annualSaving: 'N/A'
    });
  }

  if (profile.waterSystem === 'Unvented') {
    benefits.push({
      action: 'Installing pressurised cylinder',
      benefit: 'Powerful showers without pumps, simultaneous use capability',
      annualSaving: '£30-50 (pump electricity saved)'
    });
    benefits.push({
      action: 'Removing loft tanks',
      benefit: 'No freeze risk, reduced maintenance',
      annualSaving: '£20-40 (insurance and maintenance)'
    });
  }

  if (profile.waterSystem === 'Mixergy') {
    benefits.push({
      action: 'Smart stratified heating',
      benefit: 'Heat only the water you need, faster recovery times',
      annualSaving: '£100-200 vs conventional cylinder'
    });
    benefits.push({
      action: 'App control and monitoring',
      benefit: 'Track usage, schedule heating, boost when needed',
      annualSaving: '£50-100 (optimized usage)'
    });
  }

  if (profile.waterSystem === 'Open vented') {
    benefits.push({
      action: 'Gravity-fed system',
      benefit: 'Works with any water pressure, proven reliability',
      annualSaving: 'N/A'
    });
    benefits.push({
      action: 'Simple maintenance',
      benefit: 'No annual safety checks required (unlike unvented)',
      annualSaving: '£80-120 (safety check costs)'
    });
  }

  // Efficiency benefits
  const avgEfficiency = parseFloat(profile.efficiency.split('-')[0]);
  if (avgEfficiency >= 90) {
    benefits.push({
      action: 'High-efficiency condensing boiler',
      benefit: 'Recover heat from flue gases, lower running costs',
      annualSaving: `£200-400 vs old boiler (${requirements.occupants} occupants)`
    });
  }

  // Control benefits
  benefits.push({
    action: 'Modern controls installation',
    benefit: 'Room thermostat, programmer, TRVs for zone control',
    annualSaving: '£75-150 (optimized heating patterns)'
  });

  // System flush benefit
  benefits.push({
    action: 'Power flush and system treatment',
    benefit: 'Removes sludge, improves efficiency, extends component life',
    annualSaving: '£50-100 (improved efficiency and reduced breakdowns)'
  });

  return benefits;
}

/**
 * Get system profile by key
 */
export function getSystemProfile(systemKey) {
  return SYSTEM_PROFILES[systemKey];
}

/**
 * Get all system profiles
 */
export function getAllSystemProfiles() {
  return SYSTEM_PROFILES;
}
