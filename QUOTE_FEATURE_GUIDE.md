# Quote Creation Feature - User Guide

## Overview

The quote creation feature allows you to automatically generate professional PDF quotations from survey transcripts. The system intelligently matches materials from your transcripts to the pricebook and presents them for review before generating a printable PDF.

## How to Use

### 1. Complete a Survey

First, process a survey transcript using the Survey Brain interface:

1. Enter or record a transcript with customer details and materials needed
2. Click **"Send text"** to process the transcript
3. Wait for the system to extract materials and sections
4. Verify the **"Suggested parts list"** shows materials

### 2. Create a Quote

1. Click the **"Create quote"** button in the header toolbar
2. The system will:
   - Load the pricebook from CSV files
   - Automatically detect system type (Full System or Part System)
   - Select an appropriate **core pack** based on the boiler kW rating
   - Match all materials to pricebook items
   - Open the Quote Builder modal

### 3. Review and Confirm Items

The Quote Builder modal displays:

**Customer Details Section:**
- Customer Name (auto-extracted from transcript or editable)
- Job Reference (auto-generated or editable)

**Items Table:**
- Each material with matched pricebook item
- Component ID
- Quantity (adjustable)
- Unit price and total
- Actions: Change or Remove

**Features:**
- ✅ **Green items**: Successfully matched to pricebook
- ⚠️ **Red items**: No match found (requires manual search)
- **Change button**: Search pricebook to select different item
- **Remove button**: Remove item from quote
- **Add Manual Item**: Search pricebook to add additional items

### 4. Multiple Quotes (Optional)

If your transcript mentions multiple options:
- Keywords detected: "two quotes", "option 1", "option 2", "alternative"
- The **"Add Quote Option"** button appears
- Click to create alternative quotes (e.g., basic vs premium)
- Each quote can have different items/quantities
- All quotes will be generated as separate PDFs

### 5. Generate PDF

1. Review all items and totals
2. Click **"Generate PDF Quote"** (or "Generate PDF Quotes" if multiple)
3. PDFs will download automatically
4. Each PDF includes:
   - Professional header with company details
   - Customer and job reference
   - Itemized parts list with prices
   - Subtotal, VAT, and total
   - Terms and conditions
   - Footer with generation timestamp

## Features in Detail

### Automatic Core Pack Selection

The system analyzes your transcript to determine:

**System Type:**
- **Full System** (FCH): Complete heating system installation
- **Part System** (PCH): Partial/replacement installation

**Boiler Rating:**
- Detects kW from transcript (e.g., "30kW combi")
- Matches to appropriate core pack ranges: up to 18kW, 35kW, 44kW, etc.

**Special Cases:**
- Combi to combi replacement
- Conventional to combi conversion

### Intelligent Material Matching

For each material in your parts list, the system:

1. **Searches pricebook** using description and keywords
2. **Ranks matches** by relevance (exact matches score highest)
3. **Auto-selects** the best match
4. **Presents alternatives** (up to 5 suggestions when you click "Change")

### Search Functionality

When clicking **"Change"** or **"Add Manual Item"**:

1. Search dialog opens
2. Type keywords or component ID (e.g., "Worcester 30kW", "CBLR1366")
3. Results show in real-time
4. Click any result to select it
5. Item updates in the quote immediately

### Pricing and Totals

- All prices from `pricebook_csvs/*.csv` files
- Subtotal calculated from (unit price × quantity)
- VAT automatically calculated at 20%
- Total = Subtotal + VAT
- All amounts displayed in GBP (£)

## File Structure

The quote feature uses these pricebook CSV files:

```
pricebook_csvs/
├── core_packs.csv              # Full/Part system core packs
├── boilers_combi_ng.csv        # Natural gas combi boilers
├── boilers_combi_lpg.csv       # LPG combi boilers
├── boilers_other.csv           # System/regular boilers
├── radiators_and_valves.csv    # Radiators and TRVs
├── flues_worcester.csv         # Flue components
├── controls_and_stats.csv      # Controls and thermostats
├── smart_hive.csv              # Hive smart controls
├── heat_pumps_and_ashp_labour.csv
├── heat_pump_accessories.csv
├── electrics_and_waste.csv
├── extras_and_charges.csv
└── price_alignment.csv
```

**CSV Format:**
```
section,subsection,component_id,description,selling_price_gbp,lead_time_days
```

## Customization

### Company Details (Optional)

To add your company details to PDFs, edit `js/quotePDF.js`:

```javascript
const {
  companyName = 'YOUR COMPANY NAME',
  companyAddress = 'YOUR ADDRESS',
  companyPhone = 'YOUR PHONE',
  companyEmail = 'YOUR EMAIL',
  ...
} = quoteData;
```

### Terms and Conditions

Default terms are included. To customize, edit the `getDefaultTerms()` function in `js/quotePDF.js`.

### VAT Rate

Default is 20%. To change, modify `vatRate` parameter in `js/quotePDF.js`:

```javascript
export function calculateQuoteTotals(matchedItems, vatRate = 0.20) {
```

## Troubleshooting

### "No materials found to create a quote"

**Solution:** Process a transcript first by clicking "Send text" and wait for materials to appear in the "Suggested parts list".

### Items showing as "⚠ No match found"

**Solution:** Click the "Search" button to manually find the correct item in the pricebook.

### Core pack not automatically selected

**Possible reasons:**
- System type unclear in transcript
- kW rating not mentioned
- Add phrases like "18kW combi" or "Full central heating system"

### PDF not downloading

**Check:**
- Browser popup blocker settings
- jsPDF library loaded (check browser console for errors)
- File download permissions

## Tips for Best Results

1. **Clear transcripts**: Mention system type, boiler kW, and specific product names
2. **Review matches**: Always check auto-matched items before generating PDF
3. **Use search**: If material doesn't match well, use "Change" to search manually
4. **Multiple quotes**: Mention "option 1" and "option 2" in transcript to trigger multi-quote mode
5. **Edit quantities**: Adjust quantities in the quote builder if the transcript didn't capture them correctly

## Example Transcript for Quote Generation

```
Customer wants to replace existing combi boiler with new 30kW Worcester Greenstar.
Full central heating system with 8 radiators.
Install Hive smart thermostat.
Reuse existing flue where possible.
Include system cleanse and magnetic filter.
Customer name: John Smith
```

This will:
- Auto-select FCH Core Pack (up to 35kW)
- Match Worcester 30kW boiler
- Include radiator valves
- Add Hive control
- Add system cleanse and filter

## Support

For issues or questions:
- Check browser console for error messages
- Verify pricebook CSV files are present in `pricebook_csvs/` folder
- Ensure jsPDF library loads (check Network tab in browser dev tools)

---

**Version:** 1.0
**Last Updated:** 2025-11-17
