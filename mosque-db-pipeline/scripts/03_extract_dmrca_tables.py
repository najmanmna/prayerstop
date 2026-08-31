#!/usr/bin/env python3
"""Extracts raw table rows from all 25 DMRCA district-mosque-list PDFs using
pdfplumber's grid-aware table extraction (confirmed reliable across all 25
files — real PDF table structure, not scanned images). Filters out the
repeated title/header rows that appear on every page. Writes ONE raw JSON
record per PDF row, with values exactly as extracted (only trims WITHIN-cell
newlines from wrapped multi-line cells into a single space) — no other
normalization happens here; this is the provenance-preserving raw layer."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pdfplumber

BASE = Path(__file__).resolve().parent.parent
PDF_DIR = BASE / "raw-sources" / "dmrca" / "pdfs"
MANIFEST_PATH = BASE / "raw-sources" / "dmrca" / "pdf-manifest.json"
OUT_PATH = BASE / "raw-sources" / "dmrca" / "dmrca-mosques-raw.json"

EXPECTED_HEADER = {"sno", "regd. no.", "name of mosque", "type", "address", "city"}

# District display names keyed by the slug used in the manifest/URLs — taken
# from the site's own district-page <h1> titles, correcting the site's own
# misspellings only for the human-readable name (the slug itself is left
# untouched since that's the real, working URL).
DISTRICT_NAMES = {
    "ampara": "Ampara",
    "anuradhapura": "Anuradhapura",
    "badulla": "Badulla",
    "batticaloa": "Batticaloa",
    "colombo": "Colombo",
    "galle": "Galle",
    "gampaha": "Gampaha",
    "hambantota": "Hambantota",
    "jaffana": "Jaffna",
    "kalutura": "Kalutara",
    "kandy": "Kandy",
    "kegalle": "Kegalle",
    "killinochchi": "Kilinochchi",
    "kurunegala": "Kurunegala",
    "mannar": "Mannar",
    "matale": "Matale",
    "matara": "Matara",
    "monaragale": "Moneragala",
    "mullaitivu": "Mullaitivu",
    "nuwara-eliya": "Nuwara Eliya",
    "polonnaruwa": "Polonnaruwa",
    "puttalam": "Puttalam",
    "ratnapura": "Ratnapura",
    "trincomalee": "Trincomalee",
    "vavuniya": "Vavuniya",
}


def clean_cell(value) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", value.replace("\n", " ")).strip()


# Every district PDF's SNO column header appears under a slightly different
# spelling/spacing (SNO, NO, SN O, SN/O, S/N, S.N, S.O, SNO.) depending on
# how that particular document was typed up — collected by inspecting every
# district's actual page-1 header row.
SNO_HEADER_VARIANTS = {"sno", "sno.", "no", "sn o", "sn/o", "s/n", "s.n", "s.o"}


def is_header_or_title_row(row: list, district_name: str) -> bool:
    cells = [clean_cell(c).lower() for c in row]
    non_empty = [c for c in cells if c]
    # Real 6-column header row: first cell is some SNO spelling, second
    # cell mentions "regd", third is "name" or "name of mosque".
    if len(cells) >= 3 and cells[0] in SNO_HEADER_VARIANTS and "regd" in cells[1] and cells[2].startswith("name"):
        return True
    # Title row: a single non-empty cell like "COLOMBO DISTRICT", or the
    # cell equals the district's own name (seen when a page's table has a
    # different detected column count and the title/header text collapses
    # into just the first cell instead of being split across 6).
    if len(non_empty) == 1 and ("district" in non_empty[0] or non_empty[0] == district_name.lower()):
        return True
    # Malformed/merged header row: header keywords bled into one cell
    # because pdfplumber detected fewer columns on that particular page
    # (e.g. "sno regd. no. name", "sn o regd. no. name").
    first_cell = cells[0] if cells else ""
    if "regd. no." in first_cell and ("name" in first_cell or "sno" in first_cell or first_cell.strip() in ("no", "sn o")):
        return True
    return False


def is_junk_fragment_row(cells: list[str]) -> bool:
    """A stray leftover fragment (e.g. a lone "PURAM)" or a lone page-number
    digit landing in one column) that pdfplumber split into its own table
    row — not a real mosque record. Every genuine record has at least two
    of the six fields populated (sno/regNo/name/type/address/city); a row
    with only one populated field is always a fragment, never real data."""
    return sum(1 for c in cells if c) <= 1


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    all_records = []
    stats = []

    for entry in manifest:
        slug = entry["slug"]
        pdf_url = entry["pdfUrl"]
        pdf_files = sorted(PDF_DIR.glob(f"{slug}__*"))
        if not pdf_files:
            print(f"  {slug}: NO PDF FILE FOUND, skipping")
            continue
        pdf_path = pdf_files[0]

        row_count = 0
        skipped_rows = 0
        district_name = DISTRICT_NAMES[slug]
        with pdfplumber.open(pdf_path) as pdf:
            for page_index, page in enumerate(pdf.pages):
                for table in page.extract_tables():
                    for row in table:
                        if is_header_or_title_row(row, district_name):
                            continue
                        cells = [clean_cell(c) for c in row]
                        # Pad/truncate defensively to exactly 6 columns.
                        cells = (cells + [""] * 6)[:6]
                        sno, regdNo, name, mosqueType, address, city = cells
                        if not any(cells) or is_junk_fragment_row(cells):
                            skipped_rows += 1
                            continue
                        all_records.append({
                            "district": DISTRICT_NAMES[slug],
                            "districtSlug": slug,
                            "sourcePdfUrl": pdf_url,
                            "sourcePdfFile": pdf_path.name,
                            "sourcePage": page_index + 1,
                            "sno": sno,
                            "registrationNo": regdNo,
                            "name": name,
                            "type": mosqueType,
                            "address": address,
                            "city": city,
                        })
                        row_count += 1
        stats.append((slug, row_count, skipped_rows))
        print(f"  {slug}: {row_count} records ({skipped_rows} blank rows skipped)")

    OUT_PATH.write_text(json.dumps(all_records, indent=2, ensure_ascii=False), encoding="utf-8")
    total = sum(s[1] for s in stats)
    print(f"\nTotal DMRCA records extracted: {total}")
    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
