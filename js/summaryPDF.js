/**
 * Summary PDF Generator
 * Creates presentation-style PDFs with heating system recommendations
 */

import { explainRecommendation } from './recommendationEngine.js';

/**
 * Load image as base64 for embedding in PDF
 */
async function loadImageAsBase64(imagePath) {
  try {
    const response = await fetch(imagePath);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Failed to load image: ${imagePath}`, error);
    return null;
  }
}

/**
 * Add text with word wrap
 */
function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 6) {
  const lines = doc.splitTextToSize(text, maxWidth);
  let currentY = y;

  lines.forEach(line => {
    doc.text(line, x, currentY);
    currentY += lineHeight;
  });

  return currentY;
}

/**
 * Add a page header with gradient
 */
function addPageHeader(doc, title, pageNum, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Gradient background
  doc.setFillColor(102, 126, 234); // #667eea
  doc.rect(0, 0, pageWidth, 30, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(title, 15, 20);

  // Page number
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 35, 20);

  doc.setTextColor(0, 0, 0); // Reset to black
}

/**
 * Generate cover page
 */
async function generateCoverPage(doc, recommendationData) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Full page gradient background
  doc.setFillColor(102, 126, 234); // #667eea
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont(undefined, 'bold');
  doc.text('Heating System', pageWidth / 2, 80, { align: 'center' });
  doc.text('Recommendation Report', pageWidth / 2, 100, { align: 'center' });

  // Subtitle
  doc.setFontSize(14);
  doc.setFont(undefined, 'normal');
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  doc.text(`Generated: ${date}`, pageWidth / 2, 120, { align: 'center' });

  // Property details box
  const boxY = 140;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(40, boxY, pageWidth - 80, 60, 5, 5, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Property Profile', pageWidth / 2, boxY + 15, { align: 'center' });

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  const { requirements } = recommendationData;
  let infoY = boxY + 28;

  if (requirements.occupants) {
    doc.text(`Occupants: ${requirements.occupants}`, 50, infoY);
    infoY += 7;
  }
  if (requirements.bedrooms) {
    doc.text(`Bedrooms: ${requirements.bedrooms}`, 50, infoY);
    infoY += 7;
  }
  if (requirements.bathrooms) {
    doc.text(`Bathrooms: ${requirements.bathrooms}`, 50, infoY);
    infoY += 7;
  }
  if (requirements.houseType) {
    doc.text(`Property Type: ${requirements.houseType}`, 50, infoY);
  }

  if (requirements.mainsPressure) {
    doc.text(`Mains Pressure: ${requirements.mainsPressure} bar`, pageWidth / 2 + 10, boxY + 28);
  }
  if (requirements.flowRate) {
    doc.text(`Flow Rate: ${requirements.flowRate} L/min`, pageWidth / 2 + 10, boxY + 35);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Powered by Depot Voice Notes & System Recommendation Engine',
           pageWidth / 2, pageHeight - 20, { align: 'center' });
}

/**
 * Generate recommendation page
 */
async function generateRecommendationPage(doc, recommendation, pageNum, totalPages, isMainRecommendation = false) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  // Header
  const title = isMainRecommendation ? '✓ Recommended System' : 'Alternative Option';
  addPageHeader(doc, title, pageNum, totalPages);

  let yPos = 40;

  // System name and score
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text(recommendation.profile.name, margin, yPos);

  // Score badge
  const score = Math.round(recommendation.score);
  const scoreColor = score >= 80 ? [16, 185, 129] : score >= 60 ? [245, 158, 11] : [239, 68, 68];
  doc.setFillColor(...scoreColor);
  doc.roundedRect(pageWidth - margin - 35, yPos - 8, 35, 12, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`Score: ${score}`, pageWidth - margin - 32, yPos);

  yPos += 10;

  // Load and add system image
  const imagePath = `/assets/system-graphics/${recommendation.profile.image}`;
  try {
    const imageData = await loadImageAsBase64(imagePath);
    if (imageData) {
      const imgWidth = 80;
      const imgHeight = 60;
      doc.addImage(imageData, 'PNG', margin, yPos, imgWidth, imgHeight);

      // Technical specs next to image
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      const specX = margin + imgWidth + 10;
      let specY = yPos + 5;

      doc.text('Technical Specifications:', specX, specY);
      doc.setFont(undefined, 'normal');
      specY += 7;
      doc.text(`Efficiency: ${recommendation.profile.efficiency}`, specX, specY);
      specY += 6;
      doc.text(`Installation Cost: ${recommendation.profile.installCost}`, specX, specY);
      specY += 6;
      doc.text(`Lifespan: ${recommendation.profile.lifespan}`, specX, specY);
      specY += 6;
      doc.setFontSize(8);
      const bestForLines = doc.splitTextToSize(`Best for: ${recommendation.profile.bestFor}`, contentWidth - imgWidth - 15);
      bestForLines.forEach(line => {
        doc.text(line, specX, specY);
        specY += 5;
      });

      yPos += imgHeight + 10;
    }
  } catch (error) {
    console.error('Failed to load system image:', error);
    yPos += 5;
  }

  // Summary explanation
  const explanation = explainRecommendation(recommendation, recommendation.requirements || {});
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  yPos = addWrappedText(doc, explanation.summary, margin, yPos, contentWidth, 5);
  yPos += 8;

  // Strengths section
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(16, 185, 129); // Green
  doc.text('✓ Strengths', margin, yPos);
  yPos += 7;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  recommendation.profile.strengths.slice(0, 5).forEach(strength => {
    const lines = doc.splitTextToSize(`• ${strength}`, contentWidth);
    lines.forEach(line => {
      doc.text(line, margin + 3, yPos);
      yPos += 5;
    });
  });

  yPos += 5;

  // Limitations section
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(239, 68, 68); // Red
  doc.text('⚠ Limitations', margin, yPos);
  yPos += 7;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  recommendation.profile.limitations.slice(0, 5).forEach(limitation => {
    const lines = doc.splitTextToSize(`• ${limitation}`, contentWidth);
    lines.forEach(line => {
      doc.text(line, margin + 3, yPos);
      yPos += 5;
    });
  });

  yPos += 5;

  // Specific reasons for this property
  if (recommendation.reasons && recommendation.reasons.length > 0) {
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(102, 126, 234); // Blue
    doc.text('Why for your property:', margin, yPos);
    yPos += 7;

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    recommendation.reasons.forEach(reason => {
      const lines = doc.splitTextToSize(`• ${reason}`, contentWidth);
      lines.forEach(line => {
        doc.text(line, margin + 3, yPos);
        yPos += 5;
      });
    });
  }
}

/**
 * Generate works involved page
 */
async function generateWorksPage(doc, explanation, pageNum, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  addPageHeader(doc, 'Works Involved', pageNum, totalPages);

  let yPos = 45;

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text(`Installation: ${explanation.systemName}`, margin, yPos);
  yPos += 12;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.text('The following works will be required for this installation:', margin, yPos);
  yPos += 10;

  explanation.worksInvolved.forEach(category => {
    // Category heading
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text(category.category, margin, yPos);
    yPos += 6;

    // Category items
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);

    category.items.forEach(item => {
      const lines = doc.splitTextToSize(`  ✓ ${item}`, contentWidth - 5);
      lines.forEach(line => {
        if (yPos > 270) {
          doc.addPage();
          addPageHeader(doc, 'Works Involved (continued)', pageNum, totalPages);
          yPos = 45;
        }
        doc.text(line, margin + 3, yPos);
        yPos += 5;
      });
    });

    yPos += 5;
  });
}

/**
 * Generate benefits page
 */
async function generateBenefitsPage(doc, explanation, pageNum, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  addPageHeader(doc, 'Individual Feature Benefits', pageNum, totalPages);

  let yPos = 45;

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('What you gain from each feature', margin, yPos);
  yPos += 12;

  explanation.actionBenefits.forEach((benefit, index) => {
    if (yPos > 250) {
      doc.addPage();
      addPageHeader(doc, 'Individual Feature Benefits (continued)', pageNum, totalPages);
      yPos = 45;
    }

    // Action heading
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(16, 185, 129); // Green
    doc.text(`${index + 1}. ${benefit.action}`, margin, yPos);
    yPos += 6;

    // Benefit description
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    yPos = addWrappedText(doc, benefit.benefit, margin + 5, yPos, contentWidth - 5, 5);
    yPos += 2;

    // Annual saving
    if (benefit.annualSaving && benefit.annualSaving !== 'N/A') {
      doc.setFont(undefined, 'italic');
      doc.setTextColor(102, 126, 234);
      doc.text(`💰 Potential saving: ${benefit.annualSaving}`, margin + 5, yPos);
      yPos += 5;
    }

    yPos += 5;
  });

  // Add total potential savings summary
  yPos += 5;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setFillColor(209, 250, 229); // Light green
  doc.roundedRect(margin, yPos - 5, contentWidth, 25, 3, 3, 'F');
  doc.setTextColor(16, 185, 129);
  doc.text('💡 Key Takeaway', margin + 5, yPos + 5);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  yPos = addWrappedText(
    doc,
    'These individual benefits combine to create a more efficient, cost-effective, and comfortable heating system tailored to your specific needs.',
    margin + 5,
    yPos + 12,
    contentWidth - 10,
    5
  );
}

/**
 * Generate comparison page for alternative choice
 */
async function generateComparisonPage(doc, recommendedSystem, chosenSystem, pageNum, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const colWidth = (pageWidth - (margin * 3)) / 2;

  addPageHeader(doc, 'System Comparison', pageNum, totalPages);

  let yPos = 45;

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(239, 68, 68); // Red
  doc.text('⚠ You chose a different system', margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('Here\'s how your choice compares to our recommendation:', margin, yPos);
  yPos += 15;

  // Column headers
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setFillColor(16, 185, 129); // Green
  doc.roundedRect(margin, yPos - 8, colWidth, 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('✓ Recommended', margin + 5, yPos);

  doc.setFillColor(102, 126, 234); // Blue
  doc.roundedRect(margin + colWidth + 15, yPos - 8, colWidth, 12, 3, 3, 'F');
  doc.text('Your Choice', margin + colWidth + 20, yPos);

  yPos += 12;

  // System names
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text(recommendedSystem.profile.name, margin, yPos);
  doc.text(chosenSystem.profile.name, margin + colWidth + 15, yPos);
  yPos += 10;

  // Scores
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(`Suitability Score: ${Math.round(recommendedSystem.score)}/100`, margin, yPos);
  doc.text(`Suitability Score: ${Math.round(chosenSystem.score)}/100`, margin + colWidth + 15, yPos);
  yPos += 15;

  // Side by side comparison
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text('Strengths:', margin, yPos);
  doc.text('Strengths:', margin + colWidth + 15, yPos);
  yPos += 6;

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const maxStrengths = Math.max(recommendedSystem.profile.strengths.length, chosenSystem.profile.strengths.length);
  for (let i = 0; i < Math.min(maxStrengths, 5); i++) {
    const recStr = recommendedSystem.profile.strengths[i] || '';
    const choStr = chosenSystem.profile.strengths[i] || '';

    if (recStr) {
      const lines = doc.splitTextToSize(`• ${recStr}`, colWidth - 5);
      lines.forEach(line => {
        doc.text(line, margin + 2, yPos);
        yPos += 4;
      });
    }

    let choYPos = yPos - (recStr ? 4 * doc.splitTextToSize(`• ${recStr}`, colWidth - 5).length : 0);
    if (choStr) {
      const lines = doc.splitTextToSize(`• ${choStr}`, colWidth - 5);
      lines.forEach(line => {
        doc.text(line, margin + colWidth + 17, choYPos);
        choYPos += 4;
      });
    }

    yPos = Math.max(yPos, choYPos);
  }

  yPos += 10;

  // Limitations
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(239, 68, 68);
  doc.text('Limitations:', margin, yPos);
  doc.text('Limitations:', margin + colWidth + 15, yPos);
  yPos += 6;

  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const maxLimitations = Math.max(recommendedSystem.profile.limitations.length, chosenSystem.profile.limitations.length);
  for (let i = 0; i < Math.min(maxLimitations, 5); i++) {
    const recLim = recommendedSystem.profile.limitations[i] || '';
    const choLim = chosenSystem.profile.limitations[i] || '';

    if (recLim) {
      const lines = doc.splitTextToSize(`• ${recLim}`, colWidth - 5);
      lines.forEach(line => {
        doc.text(line, margin + 2, yPos);
        yPos += 4;
      });
    }

    let choYPos = yPos - (recLim ? 4 * doc.splitTextToSize(`• ${recLim}`, colWidth - 5).length : 0);
    if (choLim) {
      const lines = doc.splitTextToSize(`• ${choLim}`, colWidth - 5);
      lines.forEach(line => {
        doc.text(line, margin + colWidth + 17, choYPos);
        choYPos += 4;
      });
    }

    yPos = Math.max(yPos, choYPos);
  }

  yPos += 10;

  // Recommendation note
  doc.setFillColor(254, 243, 199); // Light yellow
  doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, 'F');
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(146, 64, 14); // Dark yellow
  doc.text('💡 Our Recommendation', margin + 5, yPos + 8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  const recText = `We recommended ${recommendedSystem.profile.name} because it scored ${Math.round(recommendedSystem.score - chosenSystem.score)} points higher for your specific requirements. However, ${chosenSystem.profile.name} may better suit your personal preferences.`;
  addWrappedText(doc, recText, margin + 5, yPos + 15, contentWidth - 10, 4);
}

/**
 * Main PDF generation function
 */
export async function generateSummaryPDF(recommendationData, chosenSystemKey = null) {
  // Wait for jsPDF to load
  if (typeof window.jspdf === 'undefined') {
    throw new Error('jsPDF library not loaded');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const { recommendations, bestOption, requirements } = recommendationData;

  // Add requirements to each recommendation for explanation generation
  recommendations.forEach(rec => {
    rec.requirements = requirements;
  });

  // Determine which system to detail
  const mainSystem = chosenSystemKey
    ? recommendations.find(r => r.key === chosenSystemKey) || bestOption
    : bestOption;

  const showComparison = chosenSystemKey && chosenSystemKey !== bestOption.key;

  // Calculate total pages (rough estimate)
  const totalPages = showComparison ? 7 : 5;

  // Page 1: Cover
  await generateCoverPage(doc, recommendationData);

  // Page 2: Main recommendation
  doc.addPage();
  await generateRecommendationPage(doc, mainSystem, 2, totalPages, !showComparison);

  // Page 3: Works involved
  const mainExplanation = explainRecommendation(mainSystem, requirements);
  doc.addPage();
  await generateWorksPage(doc, mainExplanation, 3, totalPages);

  // Page 4: Benefits
  doc.addPage();
  await generateBenefitsPage(doc, mainExplanation, 4, totalPages);

  // Page 5: Alternative option (if not chosen) or first alternative
  const alternativeSystem = showComparison ? bestOption : recommendations[1];
  if (alternativeSystem) {
    doc.addPage();
    await generateRecommendationPage(doc, alternativeSystem, 5, totalPages, showComparison);
  }

  // Page 6-7: Comparison (if user chose different system)
  if (showComparison) {
    doc.addPage();
    await generateComparisonPage(doc, bestOption, mainSystem, 6, totalPages);
  }

  // Save the PDF
  const filename = `heating-system-recommendation-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);

  return filename;
}
