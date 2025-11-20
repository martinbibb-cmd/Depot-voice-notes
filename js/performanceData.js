/**
 * Performance Matrix Data
 * Source: System-recommendation repository (Performance.csv)
 * Research-backed data for heating system recommendations
 */

export const PERFORMANCE_DATA = {
  // Daily water consumption by household size
  waterConsumption: {
    1: 149, // L/day for single occupant
    2: 250, // L/day for 2 people
    3: 350, // L/day for 3 people
    4: 450  // L/day for 4+ people
  },

  // Typical UK hot water requirement
  baselineHotWater: {
    volume: 80, // L at 55°C
    energy: 4   // kWh/day
  },

  // System efficiency ratings (DHW)
  systemEfficiency: {
    combi: { min: 75, max: 82, typical: 78 },
    unvented: { min: 60, max: 70, typical: 65 },
    vented: { min: 45, max: 65, typical: 55 }
  },

  // Distribution waste by system type
  distributionWaste: {
    combi: {
      wastePerDraw: { min: 1, max: 8 }, // L
      waitTime: { min: 30, max: 90 }    // seconds
    },
    cylinder: {
      wastePerDraw: { min: 1, max: 2 }, // L
      waitTime: { min: 10, max: 20 }    // seconds
    }
  },

  // Annual losses
  annualLosses: {
    combiStartup: 0.025, // kWh per draw
    distribution: { min: 350, max: 750 }, // kWh/year
    cylinderStanding: {
      modern: 1.5,  // kWh/day
      older: 3.5    // kWh/day
    }
  },

  // Pressure requirements
  pressureRequirements: {
    combi: {
      minBar: 1.5,
      minFlowRate: 14 // L/min
    },
    typical: {
      urban: { bar: 2.5, flowRate: 18 },
      rural: { bar: 1.2, flowRate: 10 }
    }
  },

  // Component lifespan
  componentLife: {
    combiDiverterValve: 7,  // years
    regularThreePort: 10    // years
  },

  // Maintenance costs
  maintenanceCosts: {
    standard: 20,  // £/year
    combi: 50      // £/year
  }
};

/**
 * Critical questions matrix
 * These questions are essential for making accurate system recommendations
 */
export const CRITICAL_QUESTIONS = {
  // Priority: CRITICAL (🔴)
  critical: [
    {
      id: 'occupants',
      question: 'How many people live in the property?',
      dataKey: 'occupants',
      why: 'Determines daily hot water demand (149L-450L/day)',
      extractFrom: ['needs', 'system characteristics'],
      keywords: ['people', 'occupants', 'family', 'household', 'residents']
    },
    {
      id: 'bathrooms',
      question: 'How many bathrooms do they have?',
      dataKey: 'bathrooms',
      why: 'Affects simultaneous demand and system sizing',
      extractFrom: ['needs', 'system characteristics'],
      keywords: ['bathroom', 'toilet', 'shower', 'ensuite']
    },
    {
      id: 'pressure',
      question: "What's the mains water pressure?",
      dataKey: 'pressure',
      why: 'Combi requires ≥1.5 bar / 14 L/min minimum',
      extractFrom: ['system characteristics', 'restrictions to work'],
      keywords: ['pressure', 'bar', 'mains', 'flow rate', 'water pressure']
    },
    {
      id: 'currentSystem',
      question: 'What heating system do they currently have?',
      dataKey: 'currentSystem',
      why: 'Impacts conversion cost and complexity',
      extractFrom: ['system characteristics', 'new boiler and controls'],
      keywords: ['current', 'existing', 'old', 'boiler', 'system', 'combi', 'regular']
    }
  ],

  // Priority: IMPORTANT (🟡)
  important: [
    {
      id: 'space',
      question: 'Do they have space constraints (loft, airing cupboard)?',
      dataKey: 'space',
      why: 'Determines viable system configurations',
      extractFrom: ['restrictions to work', 'system characteristics'],
      keywords: ['space', 'loft', 'cupboard', 'room', 'cylinder', 'tank']
    },
    {
      id: 'simultaneousUse',
      question: 'Will multiple outlets be used at the same time?',
      dataKey: 'simultaneousUse',
      why: 'Combis struggle with simultaneous demand',
      extractFrom: ['needs', 'system characteristics'],
      keywords: ['simultaneous', 'same time', 'multiple', 'shower', 'bath']
    },
    {
      id: 'budget',
      question: 'What is their budget range?',
      dataKey: 'budget',
      why: 'System boilers cost 20-40% more than combis',
      extractFrom: ['needs', 'office notes'],
      keywords: ['budget', 'price', 'cost', 'afford', 'money', '£']
    }
  ],

  // Priority: NICE-TO-HAVE (🟢)
  optional: [
    {
      id: 'renewables',
      question: 'Any interest in renewable integration (solar/heat pump)?',
      dataKey: 'renewables',
      why: 'Cylinders work better with renewables',
      extractFrom: ['future plans', 'needs'],
      keywords: ['solar', 'renewable', 'heat pump', 'green', 'eco', 'future']
    },
    {
      id: 'futurePlans',
      question: 'Any plans to extend the property?',
      dataKey: 'futurePlans',
      why: 'May need oversized system for future capacity',
      extractFrom: ['future plans'],
      keywords: ['extension', 'extend', 'future', 'plans', 'expand']
    },
    {
      id: 'waterUsage',
      question: 'High water usage (long showers/baths)?',
      dataKey: 'waterUsage',
      why: 'Affects system sizing and efficiency',
      extractFrom: ['needs', 'system characteristics'],
      keywords: ['shower', 'bath', 'water', 'usage', 'long', 'frequent']
    }
  ]
};

/**
 * Research sources for reference
 */
export const RESEARCH_SOURCES = [
  'UK household water use figures (2023)',
  'Energy Saving Trust - typical UK hot water requirements (2022)',
  'Practical field observations - tap wait times (2020-2025)',
  'SAP methodology - DHW losses for combis (~600 kWh/yr, 2019)',
  'Sealed systems efficiency gains (2019)',
  'Field monitoring - combi vs cylinder efficiency (2018)',
  'Modern unvented cylinder improvements (2021)',
  'Combi maintenance costs analysis (2020-2025)',
  'UK mains pressure requirements (2020-2025)'
];
