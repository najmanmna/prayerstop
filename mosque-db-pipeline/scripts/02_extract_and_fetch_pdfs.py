#!/usr/bin/env python3
"""Extracts the flipbook-widget PDF source URL from each DMRCA district page
and downloads the PDF. The URL lives inside a <script> JSON blob
(window.option_df_NNNN = {..."source":"https:\/\/...pdf"...}), not a plain
<a href>, so it can't be found by a naive HTML link scan."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DISTRICT_PAGES = BASE / "raw-sources" / "dmrca" / "district-pages"
PDF_DIR = BASE / "raw-sources" / "dmrca" / "pdfs"
PDF_DIR.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

SOURCE_RE = re.compile(r'window\.option_df_\d+\s*=\s*(\{.*?\});', re.S)


def extract_pdf_url(html: str) -> str | None:
    m = SOURCE_RE.search(html)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    src = data.get("source")
    if src and src.lower().endswith(".pdf"):
        return src
    return None


def main():
    pages = sorted(DISTRICT_PAGES.glob("*.html"))
    results = []
    for page in pages:
        slug = page.stem
        html = page.read_text(encoding="utf-8", errors="replace")
        url = extract_pdf_url(html)
        results.append({"slug": slug, "pdfUrl": url})
        if not url:
            print(f"  {slug}: NO PDF URL FOUND", file=sys.stderr)
            continue
        filename = url.rsplit("/", 1)[-1]
        out_path = PDF_DIR / f"{slug}__{filename}"
        if out_path.exists() and out_path.stat().st_size > 0:
            print(f"  {slug}: already downloaded ({out_path.name})")
            continue
        proc = subprocess.run(
            ["curl", "-s", "-L", "--max-time", "60", "-A", UA, url, "-o", str(out_path), "-w", "%{http_code}"],
            capture_output=True, text=True,
        )
        code = proc.stdout.strip()
        size = out_path.stat().st_size if out_path.exists() else 0
        print(f"  {slug}: HTTP {code}, {size} bytes -> {out_path.name}")

    manifest_path = BASE / "raw-sources" / "dmrca" / "pdf-manifest.json"
    manifest_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nManifest written to {manifest_path}")
    missing = [r["slug"] for r in results if not r["pdfUrl"]]
    if missing:
        print(f"WARNING: no PDF URL found for: {missing}", file=sys.stderr)


if __name__ == "__main__":
    main()
