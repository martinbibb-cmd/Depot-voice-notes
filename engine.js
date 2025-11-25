(function () {
  const SYSTEM_PROFILES = {
    combi: {
      name: 'Combi Boiler',
      boilerType: 'Combi',
      waterSystem: 'On-demand',
      strengths: [
        'Space-saving (no cylinder or loft tanks)',
        'Instant hot water on demand',
        'Lower installation cost and simpler pipework',
        'Mains pressure hot water throughout the property'
      ],
      bestFor: '1-3 occupants, 1-2 bathrooms with good mains pressure'
    },
    'system-unvented': {
      name: 'System Boiler (Unvented Cylinder)',
      boilerType: 'System',
      waterSystem: 'Unvented',
      strengths: [
        'Excellent flow to multiple bathrooms at once',
        'Mains pressure hot water with fast recovery',
        'Compact compared to open vented (no loft tanks)',
        'Great for households with higher simultaneous demand'
      ],
      bestFor: '3-6 occupants, 2-4 bathrooms where mains pressure is good'
    },
    'regular-openvented': {
      name: 'Regular Boiler (Open Vented)',
      boilerType: 'Regular',
      waterSystem: 'Open vented',
      strengths: [
        'Works with low mains pressure systems',
        'Compatible with traditional gravity setups',
        'Often simpler and lower cost when replacing like-for-like',
        'Keeps existing stored hot water arrangement'
      ],
      bestFor: 'Properties with low pressure or existing open-vented layout'
    },
    'system-mixergy': {
      name: 'System Boiler (Mixergy Smart Cylinder)',
      boilerType: 'System',
      waterSystem: 'Mixergy',
      strengths: [
        'Smart stratified heating to warm only what you need',
        'App monitoring and control',
        'Great heat-up times with renewable integration',
        'Efficient stored hot water with future-ready controls'
      ],
      bestFor: 'Tech-friendly homes wanting smart, efficient hot water with storage'
    },
    'regular-thermal': {
      name: 'Regular Boiler (Thermal Store)',
      boilerType: 'Regular',
      waterSystem: 'Thermal store',
      strengths: [
        'Flexible for multi-fuel and renewable integration',
        'Mains pressure hot water without unvented certification',
        'Excellent when combining multiple heat sources'
      ],
      bestFor: 'Properties planning complex or renewable-ready systems'
    }
  };

  function parseTranscriptWithSpeakers(text) {
    if (!text) return [];
    const segments = [];
    const lines = text.split('\n').filter((l) => l.trim());

    lines.forEach((line, index) => {
      const timestampMatch = line.match(/^\[(\d+):(\d+)\]\s*/);
      const speakerMatch = line.match(/^(?:\[\d+:\d+\]\s*)?([^:]+):\s*(.+)/);

      let speaker = null;
      let content = line;

      if (timestampMatch) {
        content = line.slice(timestampMatch[0].length).trim();
      }

      if (speakerMatch) {
        speaker = speakerMatch[1].trim();
        content = speakerMatch[2].trim();
      }

      if (!speaker) {
        speaker = index % 2 === 0 ? 'Expert' : 'Customer';
      }

      if (content) segments.push({ speaker, text: content });
    });

    return segments;
  }

  function detectExpertRecommendations(segments) {
    const recommendations = [];
    const expertStatements = segments
      .filter((seg) => {
        const text = seg.text.toLowerCase();
        const speaker = (seg.speaker || '').toLowerCase();
        if (speaker.includes('expert')) return true;
        return text.includes('best advice') || text.includes('recommend') || text.includes('should replace with');
      })
      .map((seg) => seg.text.toLowerCase());

    const expertText = expertStatements.join(' ');

    if (/(?:system boiler|system).*?(?:with|and).*?mixergy/i.test(expertText) || /\bmixergy\b/i.test(expertText)) {
      recommendations.push('system-mixergy');
    }

    if (/thermal\s+store/i.test(expertText)) {
      recommendations.push('regular-thermal');
    }

    const recommendationPatterns = [
      /(?:best|recommend|suggest|advise|should).*?(combi|system boiler|regular boiler|unvented|open vented)/gi,
      /(?:replace with|upgrade to|install|fit).*?(combi|system boiler|regular boiler|unvented|open vented)/gi,
    ];

    for (const pattern of recommendationPatterns) {
      let match;
      while ((match = pattern.exec(expertText)) !== null) {
        const recommended = match[1].toLowerCase();
        if (recommended.includes('system') && recommended.includes('unvented')) {
          recommendations.push('system-unvented');
        } else if (recommended.includes('system')) {
          recommendations.push('system-unvented');
        } else if (recommended.includes('combi')) {
          recommendations.push('combi');
        } else if (recommended.includes('regular')) {
          recommendations.push('regular-openvented');
        }
      }
    }

    return [...new Set(recommendations)];
  }

  function deriveRequirements(notesJson, transcriptJson) {
    const transcriptText = transcriptJson?.text || transcriptJson?.transcript || '';
    const segments = parseTranscriptWithSpeakers(transcriptText);

    const requirements = {
      occupants: Number(notesJson?.occupants || notesJson?.householdSize || 0) || 0,
      bedrooms: Number(notesJson?.bedrooms || notesJson?.bedroomCount || 0) || 0,
      bathrooms: Number(notesJson?.bathrooms || notesJson?.bathroomCount || 0) || 0,
      houseType: notesJson?.propertyType || notesJson?.property || '',
      currentBoilerType: '',
      currentWaterSystem: '',
      mainsPressure: Number(notesJson?.mainsPressure || 0) || 0,
      flowRate: Number(notesJson?.flowRate || 0) || 0,
      wantsSmartTech: Boolean(notesJson?.wantsSmartTech || notesJson?.smartControls),
      consideringRenewables: Boolean(notesJson?.consideringRenewables || notesJson?.renewables),
      hasSpaceConstraints: Boolean(notesJson?.spaceConstraints),
      budget: (notesJson?.budget || 'medium').toLowerCase(),
      dailyDraws: Number(notesJson?.dailyDraws || 0) || 0,
      expertRecommendations: detectExpertRecommendations(segments),
    };

    const transcriptLower = transcriptText.toLowerCase();

    if (!requirements.currentBoilerType && notesJson?.currentSystem) {
      const current = String(notesJson.currentSystem).toLowerCase();
      if (current.includes('combi')) {
        requirements.currentBoilerType = 'Combi';
        requirements.currentWaterSystem = 'On-demand';
      } else if (current.includes('system')) {
        requirements.currentBoilerType = 'System';
        requirements.currentWaterSystem = 'Unvented';
      } else if (current.includes('regular') || current.includes('heat-only')) {
        requirements.currentBoilerType = 'Regular';
        requirements.currentWaterSystem = current.includes('open') ? 'Open vented' : '';
      }
    }

    if (!requirements.mainsPressure) {
      const pressureMatch = transcriptLower.match(/(\d+\.?\d*)\s*bar/);
      if (pressureMatch) requirements.mainsPressure = parseFloat(pressureMatch[1]);
    }

    if (!requirements.flowRate) {
      const flowMatch = transcriptLower.match(/(\d+\.?\d*)\s*(?:l\/min|litres? per min)/);
      if (flowMatch) requirements.flowRate = parseFloat(flowMatch[1]);
    }

    if (!requirements.wantsSmartTech) {
      requirements.wantsSmartTech = /\bsmart\b|app control|wifi/i.test(transcriptText);
    }

    if (!requirements.consideringRenewables) {
      requirements.consideringRenewables = /solar|heat pump|renewable/i.test(transcriptText);
    }

    if (!requirements.hasSpaceConstraints) {
      requirements.hasSpaceConstraints = /no loft|limited space|no room for cylinder/i.test(transcriptText);
    }

    if (!requirements.bedrooms) {
      const bedMatch = transcriptLower.match(/(\d+)\s*bed/);
      if (bedMatch) requirements.bedrooms = parseInt(bedMatch[1], 10);
    }

    if (!requirements.bathrooms) {
      const bathMatch = transcriptLower.match(/(\d+)\s*bath/);
      if (bathMatch) requirements.bathrooms = parseInt(bathMatch[1], 10);
    }

    if (!requirements.occupants && requirements.bedrooms) {
      requirements.occupants = Math.max(2, requirements.bedrooms);
    }

    if (!requirements.occupants) {
      requirements.occupants = 2;
    }

    if (!requirements.bathrooms) {
      requirements.bathrooms = requirements.bedrooms >= 4 ? 2 : 1;
    }

    if (!requirements.dailyDraws) {
      requirements.dailyDraws = requirements.occupants * 3;
    }

    return requirements;
  }

  function scoreSystem(systemKey, profile, requirements) {
    let score = 100;
    const reasons = [];

    if (requirements.expertRecommendations?.includes(systemKey)) {
      score += 50;
      reasons.push('Explicitly recommended by the heating expert.');
    }

    if (requirements.occupants > 0) {
      if (systemKey === 'combi' && requirements.occupants > 3) {
        score -= 30;
        reasons.push(`Combi not ideal for ${requirements.occupants} occupants.`);
      } else if (systemKey === 'combi') {
        reasons.push('Combi suits the household size.');
      }
    }

    const bathroomCaps = {
      combi: 2,
      'system-unvented': 4,
      'system-mixergy': 4,
      'regular-openvented': 3,
      'regular-thermal': 4,
    };

    const bathroomCap = bathroomCaps[systemKey] || 2;
    if (requirements.bathrooms > bathroomCap) {
      score -= 25;
      reasons.push(`May struggle with ${requirements.bathrooms} bathrooms (best up to ${bathroomCap}).`);
    }

    if (requirements.mainsPressure > 0) {
      if (systemKey === 'combi' && requirements.mainsPressure < 1.5) {
        score -= 20;
        reasons.push('Low mains pressure may limit combi performance.');
      }
      if (systemKey === 'system-unvented' && requirements.mainsPressure < 1.5) {
        score -= 20;
        reasons.push('Unvented cylinders need good mains pressure.');
      }
    }

    if (requirements.currentWaterSystem === 'Open vented') {
      if (systemKey === 'regular-openvented') {
        score += 15;
        reasons.push('Like-for-like replacement keeps conversion costs down.');
      } else if (systemKey === 'combi' || systemKey === 'system-unvented') {
        score -= 15;
        reasons.push('Converting from open vented adds work and cost.');
      }
    }

    if (requirements.hasSpaceConstraints) {
      if (systemKey === 'combi') {
        score += 20;
        reasons.push('Best option when space is tight.');
      } else if (systemKey.includes('regular')) {
        score -= 20;
        reasons.push('Requires loft tanks – may not fit the space.');
      }
    }

    if (requirements.wantsSmartTech && systemKey === 'system-mixergy') {
      score += 15;
      reasons.push('Smart stratified cylinder suits smart-tech preference.');
    }

    if (requirements.consideringRenewables) {
      if (systemKey === 'regular-thermal') {
        score += 15;
        reasons.push('Thermal stores excel when integrating renewables.');
      }
      if (systemKey === 'system-mixergy') {
        score += 10;
        reasons.push('Mixergy is renewable-ready and future-proof.');
      }
    }

    if (requirements.budget === 'low') {
      if (systemKey === 'combi') {
        score += 10;
        reasons.push('Combi keeps installation costs lower.');
      }
      if (systemKey === 'system-mixergy' || systemKey === 'regular-thermal') {
        score -= 15;
        reasons.push('Smart/thermal stores have higher upfront costs.');
      }
    }

    return { score: Math.max(0, Math.min(150, score)), reasons };
  }

  function generateRecommendations(requirements) {
    const scored = [];
    for (const [key, profile] of Object.entries(SYSTEM_PROFILES)) {
      const { score, reasons } = scoreSystem(key, profile, requirements);
      scored.push({ key, profile, score, reasons });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length) scored[0].isRecommended = true;
    return scored;
  }

  function mapCylinderTags(option) {
    const tags = new Set(option.visualTags || option.tags || []);
    if (option.isMixergy || tags.has('mixergy')) {
      tags.delete('thermal_store');
      tags.add('mixergy');
    }
    return Array.from(tags);
  }

  function normaliseOption(rawOption, index) {
    const tiers = ['gold', 'silver', 'bronze'];
    const tier = rawOption.tier || tiers[index] || 'bronze';
    const visualTags = mapCylinderTags(rawOption);

    return {
      tier,
      name: rawOption.name || rawOption.title || `Option ${index + 1}`,
      shortDescription:
        rawOption.shortDescription ||
        rawOption.description ||
        'System recommendation generated for your home.',
      benefits:
        Array.isArray(rawOption.benefits) && rawOption.benefits.length > 0
          ? rawOption.benefits
          : (rawOption.features || []).slice(0, 5),
      visualTags,
      raw: rawOption,
    };
  }

  function buildOptionFromRecommendation(rec, index, requirements) {
    const tagsBySystem = {
      combi: ['combi', 'hive', 'filter', 'flush'],
      'system-unvented': ['system', 'cylinder', 'hive', 'filter', 'flush'],
      'system-mixergy': ['system', 'mixergy', 'hive', 'filter', 'flush'],
      'regular-openvented': ['regular', 'cylinder', 'filter', 'flush'],
      'regular-thermal': ['regular', 'cylinder', 'filter', 'flush'],
    };

    const tierNames = ['Gold', 'Silver', 'Bronze'];
    const tierLabel = tierNames[index] || 'Option';

    const benefits = [...(rec.profile.strengths || [])];
    rec.reasons.slice(0, 3).forEach((reason) => benefits.push(reason));

    return {
      tier: tierLabel.toLowerCase(),
      name: `${tierLabel}: ${rec.profile.name}`,
      shortDescription:
        rec.reasons[0] || rec.profile.bestFor || 'Recommended based on your property needs.',
      benefits: benefits.slice(0, 6),
      visualTags: tagsBySystem[rec.key] || [],
      raw: { ...rec, requirements },
      isMixergy: rec.key === 'system-mixergy',
    };
  }

  function recommendForNotes(notesJson, transcriptJson) {
    const requirements = deriveRequirements(notesJson || {}, transcriptJson || {});
    const recommendations = generateRecommendations(requirements);
    const rawOptions = recommendations.slice(0, 3).map((rec, idx) => buildOptionFromRecommendation(rec, idx, requirements));
    const options = rawOptions.map((opt, index) => normaliseOption(opt, index));
    return { options };
  }

  window.SystemRecommendationEngine = {
    recommendForNotes,
  };
})();
