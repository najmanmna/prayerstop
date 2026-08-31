#!/usr/bin/env python3
"""Selects 100 representative DMRCA records for the geocoding POC: 4 per
district (25 districts x 4 = 100), stratified within each district by a
heuristic address-quality bucket so the sample includes a real mix of
easy/hard cases rather than only the cleanest addresses."""
from __future__ import annotations

import json
import random
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent.parent
DMRCA_PATH = BASE / "raw-sources" / "dmrca" / "dmrca-mosques-raw.json"
OUT_PATH = Path(__file__).resolve().parent.parent / "output" / "sample-100.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

random.seed(42)


def address_quality(address: str, city: str) -> str:
    addr = (address or "").strip()
    city_n = (city or "").strip().upper()
    addr_n = addr.upper().rstrip(",")
    if not addr:
        return "low"
    if addr_n == city_n:
        return "low"
    has_digit = bool(re.search(r"\d", addr))
    word_count = len(re.findall(r"[A-Za-z]+", addr))
    if has_digit and word_count >= 3:
        return "high"
    if word_count >= 3:
        return "medium"
    return "low"


def main():
    records = json.loads(DMRCA_PATH.read_text(encoding="utf-8"))
    for r in records:
        r["addressQuality"] = address_quality(r["address"], r["city"])

    by_district: dict[str, list] = {}
    for r in records:
        by_district.setdefault(r["district"], []).append(r)

    sample = []
    for district in sorted(by_district):
        pool = by_district[district]
        by_quality = {"high": [], "medium": [], "low": []}
        for r in pool:
            by_quality[r["addressQuality"]].append(r)
        for bucket in by_quality.values():
            random.shuffle(bucket)

        picked = []
        # Try to get one of each quality bucket first, then fill from
        # whatever's left (some districts may lack a "high" bucket entirely).
        for q in ("high", "medium", "low"):
            if by_quality[q] and len(picked) < 4:
                picked.append(by_quality[q].pop())
        remaining_pool = by_quality["high"] + by_quality["medium"] + by_quality["low"]
        random.shuffle(remaining_pool)
        while len(picked) < 4 and remaining_pool:
            picked.append(remaining_pool.pop())

        sample.extend(picked[:4])

    print(f"Sampled {len(sample)} records across {len(by_district)} districts")
    from collections import Counter
    qc = Counter(r["addressQuality"] for r in sample)
    print(f"Address-quality mix in sample: {dict(qc)}")

    OUT_PATH.write_text(json.dumps(sample, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
