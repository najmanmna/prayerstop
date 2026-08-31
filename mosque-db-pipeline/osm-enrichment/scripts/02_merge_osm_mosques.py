#!/usr/bin/env python3
"""Merges the two Overpass query results (religion=muslim place_of_worship +
building=mosque supplemental), dedupes by (osm_type, osm_id), and flattens
each into a simple {lat, lon, name, tags} record. Nodes carry lat/lon
directly; ways/relations carry a `center` (Overpass's `out center` computes
this) which is used as their representative point."""
from __future__ import annotations

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
RAW_DIR = BASE / "raw-sources"
OUT_PATH = BASE / "raw-sources" / "osm-mosques-merged.json"


def flatten(elements):
    out = []
    for e in elements:
        if "lat" in e and "lon" in e:
            lat, lon = e["lat"], e["lon"]
        elif "center" in e:
            lat, lon = e["center"]["lat"], e["center"]["lon"]
        else:
            continue
        tags = e.get("tags", {})
        out.append({
            "osmType": e["type"],
            "osmId": e["id"],
            "lat": lat,
            "lon": lon,
            "name": tags.get("name"),
            "nameTa": tags.get("name:ta"),
            "nameSi": tags.get("name:si"),
            "addrCity": tags.get("addr:city"),
            "addrStreet": tags.get("addr:street"),
            "religion": tags.get("religion"),
            "denomination": tags.get("denomination"),
            "sourceQuery": None,  # filled in by caller
        })
    return out


def main():
    primary = json.loads((RAW_DIR / "osm-mosques-raw.json").read_text(encoding="utf-8"))["elements"]
    supplemental = json.loads((RAW_DIR / "osm-mosques-building-tag.json").read_text(encoding="utf-8"))["elements"]

    primary_flat = flatten(primary)
    for r in primary_flat:
        r["sourceQuery"] = "religion=muslim"

    primary_ids = {(r["osmType"], r["osmId"]) for r in primary_flat}
    supp_flat = [r for r in flatten(supplemental) if (r["osmType"], r["osmId"]) not in primary_ids]
    for r in supp_flat:
        r["sourceQuery"] = "building=mosque"

    merged = primary_flat + supp_flat
    OUT_PATH.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")

    named = sum(1 for r in merged if r["name"])
    print(f"Primary (religion=muslim): {len(primary_flat)}")
    print(f"Supplemental (building=mosque, new only): {len(supp_flat)}")
    print(f"Merged total: {len(merged)}")
    print(f"With a name: {named} ({100*named/len(merged):.1f}%)")
    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
