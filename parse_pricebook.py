#!/usr/bin/env python3
"""
Parse BG Manual Pricebook PDF into sectioned CSV files
"""

import pdfplumber
import re
import csv
from pathlib import Path
from collections import defaultdict

# Output directory for CSV files
OUTPUT_DIR = Path("pricebook_csvs")
OUTPUT_DIR.mkdir(exist_ok=True)

# CSV schema columns
CSV_COLUMNS = ['section', 'subsection', 'component_id', 'description', 'selling_price_gbp', 'lead_time_days']

# Mapping of sections to output files
FILE_MAPPING = {
    'core_packs.csv': {
        'sections': ['Core Packs'],
        'subsections': ['Full System', 'Part System'],
        'keywords': []
    },
    'electrics_and_waste.csv': {
        'sections': ['Electrics/Waste/Filling Loops/GDA/Remote PRVs', 'Electrics', 'Waste'],
        'subsections': ['Electrics/Waste/Filling Loops/GDA/Remote PRVs'],
        'keywords': ['filling loop', 'remote prv', 'waste collection', 'electrics']
    },
    'controls_and_stats.csv': {
        'sections': ['Controls', 'Wiring Centres', 'Stats', 'Timers', 'Programmers', 'CO Alarms'],
        'subsections': ['Controls ***UPGRADE ONLY JOBS'],
        'keywords': ['wiring', 'stat', 'timer', 'programmer', 'thermostat', 'control']
    },
    'smart_hive.csv': {
        'sections': ['Smart / Hive', 'Hive', 'Smart', 'Hive Active Heating', 'Hive additional Products', 'Hive View', 'Hive TRV', 'Hive Hubs'],
        'subsections': ['Hive Active Heating', 'Hive TRV', 'Hive Hubs', 'Product Bundles', 'Frames and Stand', 'Boiler IQ'],
        'keywords': ['hive', 'boiler iq']
    },
    'boilers_combi_ng.csv': {
        'sections': ['Boilers', 'BOILERS'],
        'subsections': ['Combi Natural Gas'],
        'keywords': []
    },
    'boilers_combi_lpg.csv': {
        'sections': ['Boilers', 'BOILERS'],
        'subsections': ['Combi LPG'],
        'keywords': []
    },
    'boilers_other.csv': {
        'sections': ['Boilers', 'BOILERS'],
        'subsections': ['System', 'Regular', 'System Natural Gas', 'System LPG', 'Regular Natural Gas', 'Regular LPG', 'Conventional Natural Gas', 'Conventional LPG'],
        'keywords': []
    },
    'heat_pumps_and_ashp_labour.csv': {
        'sections': ['Heat Pumps', 'ASHP', 'Air Source Heat Pump'],
        'subsections': ['Radiator Installation Packs', 'Radiator Installation Bundles', 'Fire, Flue Liner, & Multipoint Installation Packs', 'Radiator Accessories'],
        'keywords': ['heat pump', 'ashp', 'arothem']
    },
    'radiators_and_valves.csv': {
        'sections': ['Radiator Valves', 'Myson Radiators', 'Radiators', 'Price Test'],
        'subsections': ['Radiator Valves', 'Powercleanse, Powerflush, Magnetic Filter, & Combisave', 'Stelrad Radiators', 'Myson Radiators', 'Radiator Placeholders', 'Classic Towel Warmers'],
        'keywords': ['radiator', 'powerflush', 'stelrad', 'myson', 'towel warmer']
    },
    'flues_worcester.csv': {
        'sections': ['Worcester Combi Conventional and System Boilers', 'Flues', 'Worcester Flues', 'BOILERS'],
        'subsections': ['Flue Components', 'Flue Components Continued', 'Worcester 440CDi Highflow', 'Vaillant EcoTec'],
        'keywords': ['flue', 'plume', 'elbow']
    },
    'heat_pump_accessories.csv': {
        'sections': ['ASHP Accessories', 'Trunking', 'Insulation', 'Mixergy', 'Buffer Tanks'],
        'subsections': [],
        'keywords': ['trunking', 'insulation', 'mixergy', 'buffer tank']
    },
    'extras_and_charges.csv': {
        'sections': ['Extras', 'Delivery', 'Assessment', 'Premium Install'],
        'subsections': [],
        'keywords': ['delivery charge', 'assessment', 'premium install', 'cashback']
    },
    'price_alignment.csv': {
        'sections': ['Price Alignment'],
        'subsections': [],
        'keywords': []
    }
}

# Component ID patterns
COMPONENT_ID_PATTERN = re.compile(r'^[A-Z][A-Z0-9]*\d+[A-Z]?$')

# Price pattern
PRICE_PATTERN = re.compile(r'£\s*([0-9,]+\.?\d*)')

def is_component_id(text):
    """Check if text looks like a component ID"""
    if not text:
        return False
    text = text.strip()
    return bool(COMPONENT_ID_PATTERN.match(text))

def is_heading(text):
    """Check if text looks like a section/subsection heading"""
    if not text:
        return False
    text = text.strip()

    # Skip if it looks like a component ID
    if is_component_id(text):
        return False

    # Headings are typically:
    # - Title case or ALL CAPS
    # - Not too long
    # - Don't contain prices
    # - May end with "0"

    if len(text) > 100:
        return False

    if '£' in text:
        return False

    # Remove trailing "0" if present
    text_clean = text.rstrip('0').strip()

    # Known heading patterns
    heading_keywords = [
        'Core Packs', 'Boiler', 'Heat Pump', 'ASHP', 'Radiator', 'Hive',
        'Smart', 'Flue', 'Extra', 'Price Alignment', 'Combi', 'System',
        'Regular', 'Natural Gas', 'LPG', 'Controls', 'Electrics', 'Waste',
        'Filling Loop', 'Worcester', 'Vaillant', 'Active Heating', 'TRV',
        'Full System', 'Part System', 'Wiring', 'Stats', 'Timer', 'Programmer'
    ]

    for keyword in heading_keywords:
        if keyword.lower() in text_clean.lower():
            return True

    return False

def extract_price(text):
    """Extract price from text"""
    match = PRICE_PATTERN.search(text)
    if match:
        price_str = match.group(1).replace(',', '')
        try:
            return float(price_str)
        except ValueError:
            return 0.0
    return 0.0

def extract_lead_time(text):
    """Extract lead time from the end of the line"""
    # Lead time is typically the last number on the line
    parts = text.strip().split()
    if parts:
        last = parts[-1]
        if last.isdigit():
            return int(last)
    return 0

def parse_component_row(text, current_section, current_subsection):
    """Parse a component row into structured data"""
    text = text.strip()

    # Split into parts
    parts = text.split()
    if len(parts) < 3:
        return None

    # First part should be component ID
    component_id = parts[0]
    if not is_component_id(component_id):
        return None

    # Find the price
    price = extract_price(text)
    if price == 0.0:
        return None

    # Extract lead time (last number)
    lead_time = extract_lead_time(text)

    # Description is everything between component_id and price
    # Find where the price starts
    price_match = PRICE_PATTERN.search(text)
    if not price_match:
        return None

    price_start = price_match.start()
    desc_text = text[len(component_id):price_start].strip()

    # Remove leading/trailing quotes or special chars
    desc_text = desc_text.strip('"\'')

    return {
        'section': current_section,
        'subsection': current_subsection,
        'component_id': component_id,
        'description': desc_text,
        'selling_price_gbp': price,
        'lead_time_days': lead_time
    }

def determine_output_file(section, subsection):
    """Determine which CSV file a row should go to"""
    # First pass: Check section + subsection matches
    for filename, config in FILE_MAPPING.items():
        section_match = False
        for s in config['sections']:
            if s.lower() in section.lower() or section.lower() in s.lower():
                section_match = True
                break

        if section_match:
            # If no specific subsections defined, it's a match
            if not config['subsections']:
                return filename

            # Check subsection
            for ss in config['subsections']:
                if ss.lower() in subsection.lower() or subsection.lower() in ss.lower():
                    return filename

    # Second pass: Check subsection-only matches (regardless of section)
    for filename, config in FILE_MAPPING.items():
        if config['subsections']:
            for ss in config['subsections']:
                if ss.lower() in subsection.lower() or subsection.lower() in ss.lower():
                    return filename

    # Third pass: Check keywords in description or subsection
    for filename, config in FILE_MAPPING.items():
        if config['keywords']:
            for keyword in config['keywords']:
                if keyword.lower() in subsection.lower():
                    return filename

    # Default to unclassified if we can't classify
    return 'unclassified.csv'

def parse_pdf(pdf_path):
    """Parse the entire PDF and extract structured data"""
    rows_by_file = defaultdict(list)
    current_section = ""
    current_subsection = ""

    print(f"Opening PDF: {pdf_path}")

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            print(f"Processing page {page_num}/{len(pdf.pages)}")

            # Extract text
            text = page.extract_text()
            if not text:
                continue

            lines = text.split('\n')

            for line in lines:
                line = line.strip()
                if not line or line == '0':
                    continue

                # Check if it's a heading
                if is_heading(line):
                    # Determine if it's a section or subsection
                    # Major sections are usually all caps or very distinct
                    line_clean = line.rstrip('0').strip()

                    # Check if this is a known major section
                    major_sections = ['BOILERS', 'CORE PACKS', 'HEAT PUMPS', 'EXTRAS',
                                     'PRICE ALIGNMENT', 'SMART', 'HIVE']

                    is_major = any(ms in line_clean.upper() for ms in major_sections)

                    if is_major or not current_section:
                        current_section = line_clean
                        current_subsection = ""
                        print(f"  Section: {current_section}")
                    else:
                        current_subsection = line_clean
                        print(f"    Subsection: {current_subsection}")

                    continue

                # Try to parse as component row
                row = parse_component_row(line, current_section, current_subsection)
                if row:
                    output_file = determine_output_file(row['section'], row['subsection'])
                    rows_by_file[output_file].append(row)

    return rows_by_file

def write_csv_files(rows_by_file):
    """Write data to CSV files"""
    for filename, rows in rows_by_file.items():
        if not rows:
            continue

        filepath = OUTPUT_DIR / filename
        print(f"\nWriting {filepath} ({len(rows)} rows)")

        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)

        # Print sample rows
        print(f"Sample rows from {filename}:")
        for i, row in enumerate(rows[:3]):
            print(f"  {i+1}. {row['component_id']}: {row['description'][:60]}... £{row['selling_price_gbp']}")

def main():
    pdf_path = "Manual_Pricebook_28.05.2025 - Updated.pdf"

    print("="*80)
    print("BG Manual Pricebook PDF Parser")
    print("="*80)

    # Parse PDF
    rows_by_file = parse_pdf(pdf_path)

    # Write CSV files
    write_csv_files(rows_by_file)

    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    total_rows = sum(len(rows) for rows in rows_by_file.values())
    print(f"Total rows extracted: {total_rows}")
    print(f"\nRows by file:")
    for filename in sorted(rows_by_file.keys()):
        print(f"  {filename}: {len(rows_by_file[filename])} rows")

    if 'unclassified.csv' in rows_by_file:
        print(f"\nWARNING: {len(rows_by_file['unclassified.csv'])} rows could not be classified")

if __name__ == '__main__':
    main()
