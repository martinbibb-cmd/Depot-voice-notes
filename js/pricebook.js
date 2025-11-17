/**
 * Pricebook Loader and Price Matcher
 * Loads CSV pricebook files and matches materials to prices
 */

// CSV file paths
const PRICEBOOK_FILES = [
  'pricebook_csvs/core_packs.csv',
  'pricebook_csvs/boilers_combi_ng.csv',
  'pricebook_csvs/boilers_combi_lpg.csv',
  'pricebook_csvs/boilers_other.csv',
  'pricebook_csvs/radiators_and_valves.csv',
  'pricebook_csvs/flues_worcester.csv',
  'pricebook_csvs/heat_pumps_and_ashp_labour.csv',
  'pricebook_csvs/controls_and_stats.csv',
  'pricebook_csvs/smart_hive.csv',
  'pricebook_csvs/electrics_and_waste.csv',
  'pricebook_csvs/heat_pump_accessories.csv',
  'pricebook_csvs/extras_and_charges.csv',
  'pricebook_csvs/price_alignment.csv'
];

// In-memory pricebook cache
let pricebookCache = null;
let lastLoadTime = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parse CSV text to array of objects
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const items = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');
    const item = {};

    headers.forEach((header, idx) => {
      let value = values[idx] ? values[idx].trim() : '';

      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      // Convert numeric fields
      if (header === 'selling_price_gbp' || header === 'lead_time_days') {
        value = parseFloat(value) || 0;
      }

      item[header] = value;
    });

    items.push(item);
  }

  return items;
}

/**
 * Load a single CSV file
 */
async function loadCSVFile(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      console.warn(`Failed to load ${path}: ${response.status}`);
      return [];
    }
    const text = await response.text();
    return parseCSV(text);
  } catch (error) {
    console.error(`Error loading ${path}:`, error);
    return [];
  }
}

/**
 * Load all pricebook CSV files
 */
export async function loadPricebook(forceRefresh = false) {
  // Return cached version if available and fresh
  if (!forceRefresh && pricebookCache && lastLoadTime) {
    const age = Date.now() - lastLoadTime;
    if (age < CACHE_DURATION_MS) {
      return pricebookCache;
    }
  }

  console.log('Loading pricebook from CSV files...');

  const allItems = [];
  const loadPromises = PRICEBOOK_FILES.map(async (path) => {
    const items = await loadCSVFile(path);
    allItems.push(...items);
  });

  await Promise.all(loadPromises);

  // Build indexed structures for fast lookup
  const pricebook = {
    items: allItems,
    byComponentId: {},
    byCategory: {},
    corePacks: [],
    searchIndex: []
  };

  // Index by component ID and category
  allItems.forEach(item => {
    // Index by component_id
    if (item.component_id) {
      pricebook.byComponentId[item.component_id] = item;
    }

    // Index by category
    const category = item.section || 'Other';
    if (!pricebook.byCategory[category]) {
      pricebook.byCategory[category] = [];
    }
    pricebook.byCategory[category].push(item);

    // Collect core packs
    if (category === 'Core Packs') {
      pricebook.corePacks.push(item);
    }

    // Build search index (description + component_id + subsection)
    const searchText = [
      item.description,
      item.component_id,
      item.subsection,
      item.section
    ].filter(Boolean).join(' ').toLowerCase();

    pricebook.searchIndex.push({
      item,
      searchText
    });
  });

  // Cache the result
  pricebookCache = pricebook;
  lastLoadTime = Date.now();

  console.log(`Pricebook loaded: ${allItems.length} items`);
  return pricebook;
}

/**
 * Search pricebook by text query
 * Returns matching items sorted by relevance
 */
export function searchPricebook(pricebook, query, maxResults = 10) {
  if (!query || query.trim().length < 2) return [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

  const results = [];

  pricebook.searchIndex.forEach(({ item, searchText }) => {
    let score = 0;

    // Exact match bonus
    if (searchText.includes(queryLower)) {
      score += 100;
    }

    // Word matches
    queryWords.forEach(word => {
      if (searchText.includes(word)) {
        score += 10;
      }
    });

    // Component ID exact match (highest priority)
    if (item.component_id && item.component_id.toLowerCase() === queryLower) {
      score += 1000;
    }

    if (score > 0) {
      results.push({ item, score });
    }
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, maxResults).map(r => r.item);
}

/**
 * Match materials list to pricebook items
 * Returns array of matched items with quantities
 */
export function matchMaterialsToPricebook(pricebook, materials) {
  const matches = [];

  materials.forEach(material => {
    const query = material.item || material.description || '';
    const searchResults = searchPricebook(pricebook, query, 5);

    if (searchResults.length > 0) {
      matches.push({
        material,
        pricebookMatches: searchResults,
        selectedMatch: searchResults[0], // Auto-select best match
        quantity: material.qty || 1,
        notes: material.notes || ''
      });
    } else {
      // No match found - add as unmatched item
      matches.push({
        material,
        pricebookMatches: [],
        selectedMatch: null,
        quantity: material.qty || 1,
        notes: material.notes || '',
        isUnmatched: true
      });
    }
  });

  return matches;
}

/**
 * Find best matching core pack based on system details
 */
export function findCorePack(pricebook, systemDetails = {}) {
  const {
    systemType = 'Full System', // 'Full System' or 'Part System'
    boilerKw = 18,
    isWarmairOrCombisave = false,
    isCombiToCombi = false,
    isConventionalToCombi = false
  } = systemDetails;

  const corePacks = pricebook.corePacks;

  // Filter by system type
  let filtered = corePacks.filter(pack => {
    const subsection = pack.subsection || '';
    if (systemType === 'Full System') {
      return subsection === 'Full System';
    } else {
      return subsection.includes('Part System');
    }
  });

  // Handle specific replacement types for Part System
  if (systemType === 'Part System') {
    if (isCombiToCombi) {
      const match = filtered.find(p => p.description.toLowerCase().includes('combi to combi'));
      if (match) return match;
    }
    if (isConventionalToCombi) {
      const match = filtered.find(p => p.description.toLowerCase().includes('conventional to combi'));
      if (match) return match;
    }
  }

  // Match by kW rating
  const kwRanges = [
    { max: 18, keywords: ['18kW', 'up to 18'] },
    { max: 35, keywords: ['35kW', 'up to 35'] },
    { max: 44, keywords: ['44kW', 'up to 44'] },
    { max: 100, keywords: ['70/120'] }
  ];

  const kwRange = kwRanges.find(range => boilerKw <= range.max);
  if (kwRange) {
    const match = filtered.find(pack => {
      const desc = pack.description.toLowerCase();
      return kwRange.keywords.some(kw => desc.includes(kw.toLowerCase()));
    });
    if (match) return match;
  }

  // Default to first match or null
  return filtered[0] || null;
}

/**
 * Calculate totals for a quote
 */
export function calculateQuoteTotals(matchedItems, vatRate = 0.20) {
  let subtotal = 0;

  matchedItems.forEach(match => {
    if (match.selectedMatch && match.selectedMatch.selling_price_gbp) {
      const price = parseFloat(match.selectedMatch.selling_price_gbp) || 0;
      const qty = parseInt(match.quantity) || 1;
      subtotal += price * qty;
    }
  });

  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  return {
    subtotal: subtotal.toFixed(2),
    vat: vat.toFixed(2),
    vatRate: (vatRate * 100).toFixed(0) + '%',
    total: total.toFixed(2)
  };
}
