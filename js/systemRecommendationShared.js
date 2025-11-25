const SYSTEM_PROFILES = {
  combi: {
    key: 'combi',
    title: 'High-efficiency combi with smart controls',
    subtitle: 'Space-saving and efficient for smaller homes with good pressure.',
    strengths: [
      'Instant hot water on demand with no separate cylinder.',
      'Saves space and simplifies pipework.',
      'Lower install cost compared to stored hot water systems.',
    ],
    miniSpec:
      'Condensing combi boiler, smart controls, magnetic filter, limescale protection, full system cleanse.',
    visualTags: ['combi', 'hive', 'filter', 'flush'],
  },
  'system-unvented': {
    key: 'system-unvented',
    title: 'System boiler with unvented cylinder and smart controls',
    subtitle: 'Strong hot water performance for multiple bathrooms.',
    strengths: [
      'Great flow rates to multiple outlets at once.',
      'Mains-pressure showers with fast cylinder recovery.',
      'No loft tanks required, tidy installation.',
    ],
    miniSpec:
      'High-efficiency system boiler, unvented cylinder, smart controls, magnetic filter and full system cleanse.',
    visualTags: ['system', 'cylinder', 'hive', 'filter', 'flush'],
  },
  'regular-openvented': {
    key: 'regular-openvented',
    title: 'Regular boiler with vented cylinder',
    subtitle: 'Best when retaining existing open-vented layout.',
    strengths: [
      'Works with low mains pressure and existing tanks.',
      'Keeps traditional stored hot water arrangement.',
      'Often simplest swap when replacing like-for-like.',
    ],
    miniSpec:
      'Condensing regular boiler, vented cylinder retained, modern controls, magnetic filter and cleanse.',
    visualTags: ['regular', 'cylinder', 'filter', 'flush'],
  },
  'system-mixergy': {
    key: 'system-mixergy',
    title: 'System boiler with Mixergy smart cylinder',
    subtitle: 'Future-ready hot water with smart, stratified storage.',
    strengths: [
      'Heats only what you need for faster recovery and lower bills.',
      'App monitoring and control with renewable-ready connections.',
      'Great comfort and visibility of stored hot water.',
    ],
    miniSpec:
      'System boiler, Mixergy smart cylinder, smart controls, magnetic filter and full system cleanse.',
    visualTags: ['system', 'mixergy', 'hive', 'filter', 'flush'],
  },
};

function baseScore() {
  return 50;
}

function isHighDemand(input) {
  const bathrooms = Number(input.bathrooms || 0);
  const bedrooms = Number(input.bedrooms || 0);
  return bathrooms >= 2 || bedrooms >= 4 || input.hotWaterDemand === 'high';
}

function hasSpaceConstraint(input) {
  const property = (input.propertyType || '').toLowerCase();
  return property.includes('flat') || property.includes('apartment') || input.spaceConstraints;
}

function scoreProfile(profileKey, input) {
  let score = baseScore();
  const reasons = [];
  const highDemand = isHighDemand(input);
  const tightSpace = hasSpaceConstraint(input);
  const prefersSmart = !!input.wantsSmartControls;
  const renewableInterest = !!input.consideringRenewables;
  const currentSystem = (input.currentSystemType || '').toLowerCase();

  if (profileKey === 'combi') {
    if (highDemand) {
      score -= 20;
      reasons.push('Large hot water demand – combi may struggle when several outlets run together.');
    } else {
      score += 10;
      reasons.push('Good fit for light to moderate hot water use.');
    }
    if (tightSpace) {
      score += 20;
      reasons.push('Saves space by removing the cylinder.');
    }
  }

  if (profileKey === 'system-unvented') {
    if (highDemand) {
      score += 20;
      reasons.push('Stored hot water suits multiple bathrooms.');
    }
    if (tightSpace) {
      score -= 10;
      reasons.push('Needs space for a cylinder.');
    }
  }

  if (profileKey === 'regular-openvented') {
    if (currentSystem.includes('regular') || currentSystem.includes('open vent')) {
      score += 10;
      reasons.push('Matches the existing open-vented layout.');
    }
    if (tightSpace) {
      score -= 15;
      reasons.push('Loft tanks and cylinder take up space.');
    }
  }

  if (profileKey === 'system-mixergy') {
    if (prefersSmart) {
      score += 12;
      reasons.push('Smart cylinder pairs well with smart controls.');
    }
    if (renewableInterest) {
      score += 10;
      reasons.push('Mixergy is ready for future solar or heat pump links.');
    }
    if (tightSpace) {
      score -= 8;
      reasons.push('Cylinder still required, so allow space.');
    }
  }

  if (profileKey !== 'combi' && !highDemand && currentSystem.includes('combi')) {
    score -= 5;
    reasons.push('Would introduce stored hot water where demand may not need it.');
  }

  return { score, reasons };
}

function rankOptions(input) {
  const scored = Object.values(SYSTEM_PROFILES).map((profile) => {
    const { score, reasons } = scoreProfile(profile.key, input);
    return { profile, score, reasons };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

function buildOption(profile, reasons, tierLabel) {
  const benefits = [...profile.strengths];
  reasons.slice(0, 3).forEach((r) => benefits.push(r));

  return {
    title: `${tierLabel}: ${profile.title}`,
    subtitle: profile.subtitle,
    benefits: benefits.slice(0, 6),
    miniSpec: profile.miniSpec,
    visualTags: profile.visualTags,
  };
}

export function getProposalOptions(input = {}) {
  const shortlist = rankOptions(input);
  const tiers = ['Gold', 'Silver', 'Bronze'];

  const [gold, silver, bronze] = shortlist.map((item, idx) =>
    buildOption(item.profile, item.reasons, tiers[idx] || 'Option')
  );

  return {
    gold,
    silver,
    bronze,
  };
}
