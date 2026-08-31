# Mosque Database — Step 2 Pipeline (DMRCA ↔ NSDI matching)

Standalone, outside the PrayerStop app. Does not touch app source. Requires
`pdfplumber`, `shapely`, `rapidfuzz` (installed via `pip3 install --user`)
and Homebrew `poppler` (used only for a one-off manual `pdftotext` sanity
check, not by the scripts).

## Run order

```
scripts/01_fetch_district_pages.sh      # 25 DMRCA district pages -> raw-sources/dmrca/district-pages/
scripts/02_extract_and_fetch_pdfs.py    # extract+download 25 mosque-list PDFs -> raw-sources/dmrca/pdfs/
scripts/03_extract_dmrca_tables.py      # PDF tables -> raw-sources/dmrca/dmrca-mosques-raw.json (2,389 records)
scripts/04_assign_nsdi_districts.py     # point-in-polygon -> raw-sources/nsdi/nsdi-mosques-with-district.json
scripts/05_match.py                     # matcher -> normalized/{matches,unmatched-dmrca,unmatched-nsdi,duplicate-candidates}.json
```

Each script is idempotent-ish (01/02 skip files already downloaded); 03-05
always regenerate their output fresh from the raw sources.

## Directory layout

- `raw-sources/dmrca/` — original DMRCA HTML pages, PDFs, and the raw
  extracted table (`dmrca-mosques-raw.json`, untouched field values as
  extracted from the PDF, only whitespace-collapsed).
- `raw-sources/nsdi/` — the original Step 1 970-record NSDI dump
  (`nsdi-mosques-original-970.json`, copied verbatim, unmodified), the fresh
  district-boundary polygons, and the derived district-assigned version.
- `normalized/` — matcher output only; never hand-edited.
- `report/report.md` — full findings + the "good enough to found the
  database?" assessment.

See `report/report.md` for the full writeup — counts, methodology,
examples, and the verdict.
