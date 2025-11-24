/**
 * Database Query Module
 * Queries Cloudflare D1 database for technical specs, T&Cs, and product information
 */

import { loadWorkerEndpoint } from '../src/app/worker-config.js';

/**
 * Timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} - Promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ]);
}

/**
 * Query the D1 database via the Worker
 * @param {string} query - SQL query to execute
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} - Query results
 */
async function queryDatabase(query, params = []) {
  const workerUrl = loadWorkerEndpoint();

  try {
    const response = await fetch(`${workerUrl}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        params
      })
    });

    if (!response.ok) {
      console.warn('Database query failed:', response.statusText);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Database query error:', error);
    return [];
  }
}

/**
 * Search for documents by keyword
 * @param {string} keyword - Search term
 * @returns {Promise<Array>} - Matching documents
 */
export async function searchDocuments(keyword) {
  // Try querying document_chunks table with full-text search
  try {
    const results = await queryDatabase(
      `SELECT * FROM document_chunks
       WHERE content MATCH ?
       LIMIT 10`,
      [keyword]
    );

    return results;
  } catch (error) {
    console.error('Document search error:', error);

    // Fallback: try simple LIKE query
    try {
      const results = await queryDatabase(
        `SELECT * FROM documents
         WHERE name LIKE ? OR description LIKE ?
         LIMIT 10`,
        [`%${keyword}%`, `%${keyword}%`]
      );
      return results;
    } catch (fallbackError) {
      console.error('Fallback search error:', fallbackError);
      return [];
    }
  }
}

/**
 * Get technical specifications for products
 * @param {Array<string>} productNames - List of product names to search for
 * @returns {Promise<Object>} - Technical specs object
 */
export async function getTechnicalSpecs(productNames) {
  const specs = {};

  if (!productNames || productNames.length === 0) {
    return getDefaultTechnicalSpecs();
  }

  for (const productName of productNames) {
    try {
      // Search for product in reference_materials or documents table
      const results = await queryDatabase(
        `SELECT * FROM reference_materials
         WHERE title LIKE ? OR content LIKE ?
         LIMIT 5`,
        [`%${productName}%`, `%${productName}%`]
      );

      if (results && results.length > 0) {
        // Extract specs from results
        results.forEach(result => {
          if (result.title) {
            specs[result.title] = result.content || 'See documentation for full specifications';
          }
        });
      } else {
        // Add placeholder
        specs[productName] = 'Technical specifications available on request';
      }
    } catch (error) {
      console.error(`Error fetching specs for ${productName}:`, error);
      specs[productName] = 'Technical specifications available on request';
    }
  }

  // If no specs found, return defaults
  if (Object.keys(specs).length === 0) {
    return getDefaultTechnicalSpecs();
  }

  return specs;
}

/**
 * Get default technical specifications
 */
function getDefaultTechnicalSpecs() {
  return {
    'Boiler Output': '24-35 kW (system dependent)',
    'Efficiency Rating': 'ErP A-rated (90%+)',
    'Fuel Type': 'Natural Gas / LPG',
    'Flue Type': 'Room sealed, balanced flue',
    'Dimensions': 'Approximately 700mm x 400mm x 300mm',
    'Weight': '30-40 kg',
    'Operating Pressure': '1.0-3.0 bar',
    'Max Flow Rate': '12-16 L/min',
    'Warranty': 'Manufacturer warranty included',
    'Controls': 'Compatible with smart thermostats',
    'Installation': 'Gas Safe registered installation required',
    'Certifications': 'CE marked, Gas Safe approved'
  };
}

/**
 * Get terms and conditions text
 * @returns {Promise<string>} - T&Cs text
 */
export async function getTermsAndConditions() {
  try {
    // Try to fetch from database
    const results = await queryDatabase(
      `SELECT content FROM reference_materials
       WHERE title LIKE '%terms%' OR title LIKE '%conditions%'
       LIMIT 1`,
      []
    );

    if (results && results.length > 0 && results[0].content) {
      return results[0].content;
    }
  } catch (error) {
    console.error('Error fetching T&Cs from database:', error);
  }

  // Return default T&Cs
  return getDefaultTermsAndConditions();
}

/**
 * Get default terms and conditions
 */
function getDefaultTermsAndConditions() {
  return `INFORMATION SUMMARY DISCLAIMER: This document is provided for informational purposes only and does not constitute a formal quotation, contract, offer, or guarantee of service. All information contained herein is subject to verification, site survey, and final confirmation.

PRICING: All prices shown are estimates based on initial assessment and are subject to change. Final pricing will be confirmed following detailed site survey. Prices include VAT at the current rate unless otherwise stated. Additional costs may apply for unforeseen works, structural modifications, or complications discovered during installation.

TECHNICAL SPECIFICATIONS: Product specifications and technical details are provided as general guidance only. Actual specifications may vary based on manufacturer availability, site requirements, and current regulations. All installations will comply with current Building Regulations, Gas Safe requirements, and manufacturer guidelines.

FINANCE OPTIONS: Finance options shown are for illustration purposes only and are subject to credit approval and status. APR rates and terms are indicative and may vary. Finance is provided by authorized credit brokers. Terms and conditions apply.

WARRANTY COVERAGE: Warranty levels and HomeCare cover options are subject to terms and conditions of the relevant warranty provider. Annual service visits and ongoing maintenance requirements must be met to maintain warranty validity. Exclusions and limitations apply.

SITE SURVEY: A detailed site survey will be required before any work commences. The survey may identify additional works required, access limitations, or other factors that may affect final pricing and installation timeline.

ACCEPTANCE: No contract exists until a formal written quotation has been provided, accepted in writing by the customer, and a deposit has been paid. This information summary does not bind either party to any agreement or obligation.`;
}

/**
 * Get product information with images
 * @param {Array<string>} productNames - Product names from materials/notes
 * @returns {Promise<Array>} - Product information array
 */
export async function getProductInformation(productNames) {
  const products = [];

  if (!productNames || productNames.length === 0) {
    return products;
  }

  for (const productName of productNames) {
    try {
      // Search for product information
      const results = await queryDatabase(
        `SELECT * FROM reference_materials
         WHERE title LIKE ?
         LIMIT 1`,
        [`%${productName}%`]
      );

      if (results && results.length > 0) {
        const result = results[0];
        products.push({
          name: result.title || productName,
          description: result.content || 'High-quality heating system component',
          imageUrl: result.image_url || null,
          suitabilityReason: extractSuitabilityReason(result.content, productName)
        });
      } else {
        // Create placeholder product
        products.push({
          name: productName,
          description: 'Professional-grade heating component designed for reliability and efficiency.',
          imageUrl: null,
          suitabilityReason: 'Recommended based on system requirements and compatibility'
        });
      }
    } catch (error) {
      console.error(`Error fetching product info for ${productName}:`, error);
      // Add placeholder even on error
      products.push({
        name: productName,
        description: 'Professional heating component',
        imageUrl: null,
        suitabilityReason: 'Suitable for your heating system requirements'
      });
    }
  }

  return products;
}

/**
 * Extract suitability reason from product content
 */
function extractSuitabilityReason(content, productName) {
  if (!content) {
    return `${productName} is specifically selected to meet your system requirements and ensure optimal performance.`;
  }

  // Try to extract a meaningful sentence about benefits or suitability
  const sentences = content.split(/[.!?]+/);

  // Look for sentences containing keywords
  const keywords = ['benefit', 'suitable', 'ideal', 'perfect', 'efficient', 'reliable', 'save', 'comfort'];

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    if (keywords.some(keyword => lowerSentence.includes(keyword))) {
      return sentence.trim();
    }
  }

  // Fallback to first sentence or default
  if (sentences.length > 0 && sentences[0].length > 10) {
    return sentences[0].trim();
  }

  return `${productName} provides excellent reliability and performance for your heating system.`;
}

/**
 * Extract product names from AI notes and materials
 * @param {string} aiNotes - AI-generated notes
 * @param {Array} materials - Materials array from session
 * @returns {Array<string>} - Unique product names
 */
export function extractProductNames(aiNotes, materials) {
  const productNames = new Set();

  // Extract from materials array
  if (materials && Array.isArray(materials)) {
    materials.forEach(material => {
      if (material.item || material.description) {
        const name = material.item || material.description;
        if (name && name.length > 2) {
          productNames.add(name);
        }
      }
    });
  }

  // Extract from AI notes using common product keywords
  if (aiNotes && typeof aiNotes === 'string') {
    const productKeywords = [
      'boiler',
      'radiator',
      'thermostat',
      'valve',
      'pump',
      'cylinder',
      'controls',
      'filter',
      'inhibitor',
      'flush',
      'powerflush',
      'magna',
      'cleanse',
      'nest',
      'hive',
      'tado',
      'worcester',
      'vaillant',
      'ideal',
      'baxi',
      'viessmann'
    ];

    const words = aiNotes.toLowerCase().split(/\s+/);
    words.forEach((word, index) => {
      if (productKeywords.some(keyword => word.includes(keyword))) {
        // Get surrounding words for context (2 words before and after)
        const start = Math.max(0, index - 2);
        const end = Math.min(words.length, index + 3);
        const phrase = words.slice(start, end).join(' ');

        // Clean up the phrase
        const cleaned = phrase.replace(/[^a-zA-Z0-9\s]/g, '').trim();
        if (cleaned.length > 3) {
          productNames.add(cleaned);
        }
      }
    });
  }

  return Array.from(productNames).slice(0, 10); // Limit to 10 products
}

/**
 * Fetch all data needed for PDF generation
 * @param {Object} sessionData - Current session data
 * @returns {Promise<Object>} - Complete data package for PDF
 */
export async function fetchPDFData(sessionData) {
  const { aiNotes, materials, sections } = sessionData;

  // Extract product names
  const productNames = extractProductNames(aiNotes, materials);

  try {
    // Fetch data in parallel with 10 second timeout
    const [technicalSpecs, termsAndConditions, products] = await withTimeout(
      Promise.all([
        getTechnicalSpecs(productNames),
        getTermsAndConditions(),
        getProductInformation(productNames)
      ]),
      10000 // 10 second timeout
    );

    return {
      technicalSpecs,
      termsAndConditions,
      products,
      productNames
    };
  } catch (error) {
    console.warn('Database query timeout or error:', error);
    // Return empty data on timeout/error so PDF generation can continue
    return {
      technicalSpecs: [],
      termsAndConditions: [],
      products: [],
      productNames
    };
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} - True if connection successful
 */
export async function testDatabaseConnection() {
  try {
    const results = await queryDatabase('SELECT 1 as test', []);
    return results && results.length > 0;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
