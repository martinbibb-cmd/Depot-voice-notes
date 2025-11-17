/**
 * Quote PDF Generator
 * Generates printable PDF quotations using jsPDF
 */

import { calculateQuoteTotals } from './pricebook.js';

/**
 * Generate PDF for a single quote
 * Uses jsPDF library (loaded from CDN)
 */
export async function generateQuotePDF(quoteData) {
  const {
    items,
    customerName = 'Customer',
    jobReference = '',
    quoteName = 'Quote',
    quoteDate = new Date().toLocaleDateString('en-GB'),
    companyName = 'Depot Heating Solutions',
    companyAddress = '',
    companyPhone = '',
    companyEmail = '',
    notes = '',
    termsAndConditions = getDefaultTerms()
  } = quoteData;

  // Wait for jsPDF to load
  if (typeof window.jspdf === 'undefined') {
    throw new Error('jsPDF library not loaded');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  let yPos = margin;

  // Header
  doc.setFillColor(15, 118, 110); // Teal
  doc.rect(0, 0, pageWidth, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  doc.text(companyName, margin, 20);

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  if (companyAddress) doc.text(companyAddress, margin, 28);
  if (companyPhone) doc.text(companyPhone, margin, 33);

  yPos = 50;

  // Quote title
  doc.setTextColor(15, 118, 110);
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text('QUOTATION', margin, yPos);

  yPos += 15;

  // Customer and quote details
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text('Customer:', margin, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(customerName, margin + 25, yPos);

  if (jobReference) {
    doc.setFont(undefined, 'bold');
    doc.text('Job Ref:', pageWidth - margin - 60, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(jobReference, pageWidth - margin - 35, yPos);
  }

  yPos += 7;

  doc.setFont(undefined, 'bold');
  doc.text('Date:', margin, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(quoteDate, margin + 25, yPos);

  doc.setFont(undefined, 'bold');
  doc.text('Quote:', pageWidth - margin - 60, yPos);
  doc.setFont(undefined, 'normal');
  doc.text(quoteName, pageWidth - margin - 35, yPos);

  yPos += 15;

  // Items table header
  const tableStartY = yPos;
  const colWidths = {
    description: contentWidth * 0.45,
    componentId: contentWidth * 0.20,
    qty: contentWidth * 0.10,
    unitPrice: contentWidth * 0.12,
    total: contentWidth * 0.13
  };

  // Table header background
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPos, contentWidth, 10, 'F');

  // Table header text
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(71, 85, 105);

  let xPos = margin + 2;
  doc.text('Description', xPos, yPos + 7);
  xPos += colWidths.description;
  doc.text('Component ID', xPos, yPos + 7);
  xPos += colWidths.componentId;
  doc.text('Qty', xPos, yPos + 7);
  xPos += colWidths.qty;
  doc.text('Unit Price', xPos, yPos + 7);
  xPos += colWidths.unitPrice;
  doc.text('Total', xPos, yPos + 7);

  yPos += 12;

  // Table rows
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);

  items.forEach((match, idx) => {
    const selected = match.selectedMatch;
    if (!selected) return;

    const description = selected.description || 'Unknown item';
    const componentId = selected.component_id || 'N/A';
    const qty = parseInt(match.quantity) || 1;
    const unitPrice = parseFloat(selected.selling_price_gbp) || 0;
    const total = unitPrice * qty;

    // Check if we need a new page
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = margin;
    }

    // Zebra striping
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, yPos - 5, contentWidth, 8, 'F');
    }

    xPos = margin + 2;

    // Description (wrap if too long)
    const descLines = doc.splitTextToSize(description, colWidths.description - 4);
    doc.text(descLines[0], xPos, yPos);
    if (descLines.length > 1) {
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(descLines[1], xPos, yPos + 3);
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
    }

    xPos += colWidths.description;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(componentId, xPos, yPos);
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    xPos += colWidths.componentId;
    doc.text(qty.toString(), xPos, yPos);

    xPos += colWidths.qty;
    doc.text('£' + unitPrice.toFixed(2), xPos, yPos);

    xPos += colWidths.unitPrice;
    doc.setFont(undefined, 'bold');
    doc.text('£' + total.toFixed(2), xPos, yPos);
    doc.setFont(undefined, 'normal');

    yPos += descLines.length > 1 ? 10 : 8;

    // Add notes if present
    if (match.notes) {
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.setFont(undefined, 'italic');
      const noteLines = doc.splitTextToSize('Note: ' + match.notes, colWidths.description - 4);
      doc.text(noteLines, margin + 4, yPos);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      yPos += noteLines.length * 3;
    }
  });

  yPos += 5;

  // Totals section
  const totals = calculateQuoteTotals(items);
  const totalsX = pageWidth - margin - 50;

  // Check if we need a new page for totals
  if (yPos > pageHeight - 50) {
    doc.addPage();
    yPos = margin;
  }

  // Totals box
  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.5);
  doc.rect(totalsX - 5, yPos - 5, 55, 35);

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Subtotal:', totalsX, yPos);
  doc.setFont(undefined, 'bold');
  doc.text('£' + totals.subtotal, totalsX + 30, yPos, { align: 'right' });

  yPos += 7;
  doc.setFont(undefined, 'normal');
  doc.text('VAT (' + totals.vatRate + '):', totalsX, yPos);
  doc.setFont(undefined, 'bold');
  doc.text('£' + totals.vat, totalsX + 30, yPos, { align: 'right' });

  yPos += 10;
  doc.setFillColor(15, 118, 110);
  doc.rect(totalsX - 5, yPos - 7, 55, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('Total:', totalsX, yPos);
  doc.text('£' + totals.total, totalsX + 30, yPos, { align: 'right' });

  yPos += 15;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  // Notes section
  if (notes) {
    yPos += 5;
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFont(undefined, 'bold');
    doc.text('Notes:', margin, yPos);
    yPos += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(notes, contentWidth);
    doc.text(noteLines, margin, yPos);
    yPos += noteLines.length * 5;
  }

  // Terms and conditions
  if (termsAndConditions) {
    yPos += 10;
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Terms and Conditions:', margin, yPos);
    yPos += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    const termsLines = doc.splitTextToSize(termsAndConditions, contentWidth);
    doc.text(termsLines, margin, yPos);
    yPos += termsLines.length * 3;
  }

  // Footer
  const footerY = pageHeight - 10;
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Generated by Survey Brain - ' + new Date().toLocaleString('en-GB'), pageWidth / 2, footerY, { align: 'center' });

  return doc;
}

/**
 * Generate multiple PDFs (one per quote) and combine or download separately
 */
export async function generateMultipleQuotePDFs(quotesData) {
  const { quotes, customerName, jobReference } = quotesData;

  const pdfs = [];

  for (let i = 0; i < quotes.length; i++) {
    const quote = quotes[i];
    const doc = await generateQuotePDF({
      items: quote.items,
      customerName,
      jobReference,
      quoteName: quote.name || `Quote ${i + 1}`
    });

    pdfs.push({
      doc,
      name: quote.name || `Quote ${i + 1}`,
      filename: generateFilename(customerName, jobReference, quote.name || `Quote ${i + 1}`)
    });
  }

  return pdfs;
}

/**
 * Download PDF to user's device
 */
export function downloadPDF(doc, filename) {
  doc.save(filename);
}

/**
 * Generate filename for PDF
 */
function generateFilename(customerName, jobReference, quoteName) {
  const date = new Date().toISOString().split('T')[0];
  const safeName = (customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
  const safeRef = (jobReference || '').replace(/[^a-zA-Z0-9]/g, '_');
  const safeQuote = (quoteName || 'Quote').replace(/[^a-zA-Z0-9]/g, '_');

  return `Quote_${safeName}_${safeRef || date}_${safeQuote}.pdf`;
}

/**
 * Default terms and conditions
 */
function getDefaultTerms() {
  return `This quotation is valid for 30 days from the date of issue. All prices are in GBP and include VAT at the current rate. Payment terms: 50% deposit required before work commences, remaining balance due upon completion. We reserve the right to vary the price if the scope of work changes. Lead times are approximate and subject to supplier availability. All work will be carried out in accordance with current building regulations and manufacturer guidelines. Any necessary building control notifications and certifications will be arranged. The customer is responsible for ensuring access to all work areas and for protecting furnishings and belongings. This quote does not include any costs for unforeseen works or complications that may arise during installation.`;
}
