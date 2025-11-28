/**
 * AI-Powered Presentation Generator
 * Generates customer-specific presentation content using GenAI
 * based on actual conversation and recommendations
 */

import { loadWorkerEndpoint } from '../src/app/worker-config.js';
import { generateRecommendations } from './recommendationEngine.js';

// Cache for AI-generated presentations
let cachedPresentation = null;
let lastGeneratedTimestamp = null;

/**
 * Generate AI-powered presentation content
 * @param {Object} sessionData - Session data with transcript, sections, materials
 * @param {Array} recommendations - Array of system recommendations
 * @returns {Promise<Object>} AI-generated presentation content
 */
export async function generateAIPresentationContent(sessionData, recommendations = null) {
  const {
    fullTranscript,
    sections,
    materials,
    customerSummary
  } = sessionData;

  if (!fullTranscript || !fullTranscript.trim()) {
    throw new Error('No transcript available for presentation generation');
  }

  // If recommendations not provided, generate them
  if (!recommendations || recommendations.length === 0) {
    console.log('No recommendations provided, generating from transcript...');
    const notes = sections.map(s => s.naturalLanguage || s.plainText).filter(Boolean);
    recommendations = await generateRecommendations(sections, notes);
  }

  // Format recommendations for API
  const formattedRecommendations = recommendations.map(rec => ({
    systemKey: rec.systemKey,
    systemName: rec.systemName,
    score: rec.score,
    reasons: rec.reasons || []
  }));

  console.log('🤖 Calling AI to generate personalized presentation content...');

  try {
    const workerUrl = loadWorkerEndpoint();
    const response = await fetch(`${workerUrl}/generate-presentation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transcript: fullTranscript,
        sections,
        materials,
        customerSummary,
        recommendations: formattedRecommendations
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`AI presentation generation failed: ${errorData.message || response.statusText}`);
    }

    const aiContent = await response.json();

    // Cache the result
    cachedPresentation = {
      aiContent,
      recommendations,
      sessionData
    };
    lastGeneratedTimestamp = Date.now();

    console.log('✅ AI presentation content generated successfully');
    return aiContent;

  } catch (error) {
    console.error('Failed to generate AI presentation:', error);
    throw error;
  }
}

/**
 * Get AI presentation content for a specific system
 * @param {string} systemKey - The system key (e.g., 'system-unvented')
 * @param {Object} aiContent - AI-generated content from generateAIPresentationContent
 * @returns {Object|null} System-specific presentation data
 */
export function getSystemPresentation(systemKey, aiContent) {
  if (!aiContent || !aiContent.systemPresentations) {
    return null;
  }

  return aiContent.systemPresentations.find(
    sp => sp.systemKey === systemKey
  ) || null;
}

/**
 * Get cached presentation if available and recent (within 5 minutes)
 * @returns {Object|null} Cached presentation or null
 */
export function getCachedPresentation() {
  if (!cachedPresentation) {
    return null;
  }

  // Cache expires after 5 minutes
  const cacheAge = Date.now() - lastGeneratedTimestamp;
  if (cacheAge > 5 * 60 * 1000) {
    cachedPresentation = null;
    lastGeneratedTimestamp = null;
    return null;
  }

  return cachedPresentation;
}

/**
 * Clear cached presentation
 */
export function clearPresentationCache() {
  cachedPresentation = null;
  lastGeneratedTimestamp = null;
}

/**
 * Format AI-generated content for display
 * Converts the AI content into HTML-ready format
 */
export function formatAIContentForDisplay(systemPresentation) {
  if (!systemPresentation) {
    return null;
  }

  return {
    // Main explanation
    explanation: formatParagraphs(systemPresentation.customerSpecificExplanation),

    // Benefits as HTML list
    benefits: systemPresentation.benefitsForThem || [],

    // Concerns with responses
    concerns: systemPresentation.concernsAddressed || [],

    // Installation details
    installation: {
      process: formatParagraphs(systemPresentation.installationDetails?.whatHappens || ''),
      timeline: systemPresentation.installationDetails?.timeline || '',
      disruption: systemPresentation.installationDetails?.disruption || ''
    },

    // Why not others
    whyNotOthers: formatParagraphs(systemPresentation.whyNotOthers || '')
  };
}

/**
 * Format paragraphs with proper line breaks
 * Converts newlines to <br> or <p> tags
 */
function formatParagraphs(text) {
  if (!text) return '';

  // Split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);

  if (paragraphs.length > 1) {
    return paragraphs
      .map(p => `<p>${p.trim()}</p>`)
      .join('');
  }

  // Single paragraph - just replace single newlines with <br>
  return text.replace(/\n/g, '<br>');
}

/**
 * Generate property profile summary from AI content
 */
export function getPropertyProfile(aiContent) {
  if (!aiContent || !aiContent.propertyProfile) {
    return {
      summary: '',
      keyDetails: []
    };
  }

  return aiContent.propertyProfile;
}

/**
 * Get conversation highlights from AI content
 */
export function getConversationHighlights(aiContent) {
  if (!aiContent || !Array.isArray(aiContent.conversationHighlights)) {
    return [];
  }

  return aiContent.conversationHighlights;
}

/**
 * Enhanced recommendation generation that includes AI content
 * This replaces the standard generateRecommendations for presentations
 */
export async function generateEnhancedRecommendations(sessionData) {
  const { sections, fullTranscript } = sessionData;

  // Get base recommendations from recommendation engine
  const notes = sections.map(s => s.naturalLanguage || s.plainText).filter(Boolean);
  const baseRecommendations = await generateRecommendations(sections, notes);

  // Generate AI content for these recommendations
  const aiContent = await generateAIPresentationContent(sessionData, baseRecommendations);

  // Enhance recommendations with AI content
  const enhancedRecommendations = baseRecommendations.map(rec => {
    const aiPresentation = getSystemPresentation(rec.systemKey, aiContent);

    return {
      ...rec,
      aiContent: aiPresentation,
      formattedContent: aiPresentation ? formatAIContentForDisplay(aiPresentation) : null
    };
  });

  return {
    recommendations: enhancedRecommendations,
    aiContent,
    propertyProfile: getPropertyProfile(aiContent),
    conversationHighlights: getConversationHighlights(aiContent)
  };
}

/**
 * Check if AI presentation generation is available
 */
export function isAIPresentationAvailable() {
  try {
    const workerUrl = getWorkerUrl();
    return !!workerUrl;
  } catch {
    return false;
  }
}
