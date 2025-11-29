import test from 'node:test';
import assert from 'node:assert/strict';

// Helper functions extracted from js/main.js for testing

function normalizeTextForComparison(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTextTokens(text) {
  const normalized = normalizeTextForComparison(text);
  if (!normalized) return new Set();

  const stopWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
    "to", "was", "will", "with", "have", "this", "but", "they", "been"
  ]);

  return new Set(
    normalized.split(/\s+/).filter(token => token.length > 2 && !stopWords.has(token))
  );
}

function calculateSimilarity(text1, text2) {
  const tokens1 = getTextTokens(text1);
  const tokens2 = getTextTokens(text2);

  if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
  if (tokens1.size === 0 || tokens2.size === 0) return 0.0;

  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

function areLinesSemanticallySimilar(line1, line2, threshold = 0.6) {
  if (normalizeTextForComparison(line1) === normalizeTextForComparison(line2)) {
    return true;
  }

  const norm1 = normalizeTextForComparison(line1);
  const norm2 = normalizeTextForComparison(line2);
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true;
  }

  const similarity = calculateSimilarity(line1, line2);
  return similarity >= threshold;
}

function deduplicateLines(lines, similarityThreshold = 0.6) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const uniqueLines = [];
  const processed = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (processed.has(i)) continue;

    const currentLine = lines[i];
    let bestLine = currentLine;
    let bestLength = currentLine.length;
    processed.add(i);

    for (let j = i + 1; j < lines.length; j++) {
      if (processed.has(j)) continue;

      if (areLinesSemanticallySimilar(currentLine, lines[j], similarityThreshold)) {
        processed.add(j);
        if (lines[j].length > bestLength) {
          bestLine = lines[j];
          bestLength = lines[j].length;
        }
      }
    }

    uniqueLines.push(bestLine);
  }

  return uniqueLines;
}

function cleanSectionContent(section) {
  if (!section || typeof section !== "object") return section;

  const cleaned = { ...section };

  if (typeof cleaned.plainText === "string") {
    const rawLines = cleaned.plainText
      .split(/;\s*\n|\n+|;/)
      .map((line) => line.trim())
      .filter(Boolean);

    let uniqueLines = deduplicateLines(rawLines, 0.6);

    const hasDetail = uniqueLines.some((line) => !/^no\b/i.test(line));
    if (hasDetail) {
      uniqueLines = uniqueLines.filter((line) => !/^no\b/i.test(line));
    }

    cleaned.plainText = uniqueLines.length ? `${uniqueLines.join("; ")};` : "";
  }

  if (typeof cleaned.naturalLanguage === "string") {
    // Split natural language text into sentences for deduplication
    const rawSentences = cleaned.naturalLanguage
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Apply semantic deduplication to sentences (same as plainText lines)
    let uniqueSentences = deduplicateLines(rawSentences, 0.6);

    // Remove generic "No additional notes" sentences if real content exists
    const hasDetail = uniqueSentences.some((s) => !/^no\s+additional/i.test(s));
    if (hasDetail) {
      uniqueSentences = uniqueSentences.filter((s) => !/^no\s+additional/i.test(s));
    }

    cleaned.naturalLanguage = uniqueSentences.join(" ").trim();
  }

  return cleaned;
}

// Tests

test('cleanSectionContent removes exact duplicate sentences from naturalLanguage', () => {
  const section = {
    section: 'New boiler and controls',
    plainText: 'Install Worcester boiler;',
    naturalLanguage: 'We will install a Worcester boiler. We will install a Worcester boiler. The system will include smart controls.'
  };

  const cleaned = cleanSectionContent(section);

  // Should deduplicate the exact duplicate sentences about Worcester boiler
  const worcesterCount = (cleaned.naturalLanguage.match(/Worcester boiler/gi) || []).length;
  assert.ok(worcesterCount <= 1,
    'Should reduce exact duplicate Worcester boiler sentences');
  assert.ok(cleaned.naturalLanguage.includes('smart controls'),
    'Should keep the unique sentence about smart controls');
});

test('cleanSectionContent handles multiple paragraphs in naturalLanguage', () => {
  const section = {
    section: 'Pipe work',
    plainText: 'Upgrade gas supply;',
    naturalLanguage: 'The gas supply needs upgrading.\n\nWe will upgrade the gas supply from meter. The gas supply requires upgrading.'
  };

  const cleaned = cleanSectionContent(section);

  // Should deduplicate semantically similar sentences across paragraphs
  const gasSupplyCount = (cleaned.naturalLanguage.match(/gas supply/gi) || []).length;
  assert.ok(gasSupplyCount <= 2, 'Should reduce duplicate gas supply mentions');
});

test('cleanSectionContent removes "No additional notes" when real content exists', () => {
  const section = {
    section: 'Flue',
    plainText: 'Horizontal flue required;',
    naturalLanguage: 'No additional notes. A horizontal flue is required through the external wall.'
  };

  const cleaned = cleanSectionContent(section);

  assert.ok(!cleaned.naturalLanguage.toLowerCase().includes('no additional'),
    'Should remove "No additional notes" when real content exists');
  assert.ok(cleaned.naturalLanguage.includes('horizontal flue'),
    'Should keep the real content about horizontal flue');
});

test('cleanSectionContent keeps "No additional notes" when no real content exists', () => {
  const section = {
    section: 'Future plans',
    plainText: '',
    naturalLanguage: 'No additional notes for this section.'
  };

  const cleaned = cleanSectionContent(section);

  assert.ok(cleaned.naturalLanguage.toLowerCase().includes('no additional'),
    'Should keep "No additional notes" when it is the only content');
});

test('cleanSectionContent handles empty naturalLanguage', () => {
  const section = {
    section: 'Test',
    plainText: 'Test content;',
    naturalLanguage: ''
  };

  const cleaned = cleanSectionContent(section);

  assert.equal(cleaned.naturalLanguage, '',
    'Should handle empty naturalLanguage gracefully');
});

test('cleanSectionContent handles undefined naturalLanguage', () => {
  const section = {
    section: 'Test',
    plainText: 'Test content;'
  };

  const cleaned = cleanSectionContent(section);

  assert.equal(cleaned.naturalLanguage, undefined,
    'Should handle undefined naturalLanguage gracefully');
});

test('cleanSectionContent preserves unique sentences in naturalLanguage', () => {
  const section = {
    section: 'New boiler and controls',
    plainText: 'Install boiler; Install controls;',
    naturalLanguage: 'The customer requires a new boiler. Smart controls will be fitted. The condensate will run internally.'
  };

  const cleaned = cleanSectionContent(section);

  assert.ok(cleaned.naturalLanguage.includes('new boiler'),
    'Should keep unique sentence about boiler');
  assert.ok(cleaned.naturalLanguage.includes('Smart controls'),
    'Should keep unique sentence about controls');
  assert.ok(cleaned.naturalLanguage.includes('condensate'),
    'Should keep unique sentence about condensate');
});

test('cleanSectionContent deduplicates similar sentences with different word order', () => {
  const section = {
    section: 'Test',
    plainText: 'Test;',
    naturalLanguage: 'Worcester Bosch 35kW boiler will be installed. A 35kW Worcester Bosch boiler is recommended.'
  };

  const cleaned = cleanSectionContent(section);

  // Should recognize these as duplicates and keep only one (the longer/more detailed one)
  const worcesterCount = (cleaned.naturalLanguage.match(/Worcester/gi) || []).length;
  assert.ok(worcesterCount <= 1,
    'Should deduplicate sentences with different word order but same meaning');
});

test('plainText deduplication still works correctly', () => {
  const section = {
    section: 'Pipe work',
    plainText: 'Install gas supply; Install gas supply; Upgrade primaries;',
    naturalLanguage: 'Notes here.'
  };

  const cleaned = cleanSectionContent(section);

  // Should keep only unique items after deduplication
  const items = cleaned.plainText.split(';').filter(Boolean);
  assert.ok(items.length <= 2, 'Should deduplicate exact duplicate plainText lines');
});
