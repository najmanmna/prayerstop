#!/usr/bin/env python3
"""Builds data/geo/sri-lanka-districts.json — simplified Sri Lanka district
boundaries bundled into the app to pick the user's ACJU prayer zone from
their GPS location (lib/prayer-times/prayer-zones.ts). Fully offline.

Source: the official NSDI District Boundary layer (25 districts) already
used by the mosque pipeline — mosque-db-pipeline/raw-sources/nsdi/
district-boundaries.json (9.4 MB). Simplified with shapely
(preserve_topology) at TOLERANCE degrees and rounded to 4 decimals (~11 m),
giving ~310 KB.

Accuracy check (2026-10-29), against the 969 NSDI mosque points whose
district is known from the full-resolution polygons: 968/969 resolve to the
correct district at this tolerance, and 968/969 to the correct prayer
zone — the one miss is a point right on the Kegalle/Gampaha border.

Usage (needs shapely): python3 scripts/geo/build-district-boundaries.py
"""
import importlib.util
import json
from datetime import date
from pathlib import Path

from shapely.geometry import MultiPolygon

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "mosque-db-pipeline" / "raw-sources" / "nsdi" / "district-boundaries.json"
OUT = ROOT / "data" / "geo" / "sri-lanka-districts.json"
TOLERANCE = 0.0005

# Reuse the pipeline's ArcGIS-ring -> shapely conversion rather than a second copy.
_spec = importlib.util.spec_from_file_location(
    "assign_districts", ROOT / "mosque-db-pipeline" / "scripts" / "04_assign_nsdi_districts.py"
)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
esri_polygon_to_shapely = _module.esri_polygon_to_shapely


def rings(geometry):
    """All rings (outer + holes), [lng, lat] pairs. Point-in-polygon uses the even-odd rule across all of a district's rings."""
    polygons = geometry.geoms if isinstance(geometry, MultiPolygon) else [geometry]
    out = []
    for polygon in polygons:
        if polygon.is_empty:
            continue
        out.append([[round(x, 4), round(y, 4)] for x, y in polygon.exterior.coords])
        out += [[[round(x, 4), round(y, 4)] for x, y in ring.coords] for ring in polygon.interiors]
    return [ring for ring in out if len(ring) >= 4]


def main():
    boundaries = json.loads(SOURCE.read_text(encoding="utf-8"))
    districts = {}
    for feature in boundaries["features"]:
        name = feature["attributes"]["district_name"]
        simplified = esri_polygon_to_shapely(feature["geometry"]).simplify(TOLERANCE, preserve_topology=True)
        districts[name] = rings(simplified)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "source": "NSDI Sri Lanka District Boundary layer (via mosque-db-pipeline/raw-sources/nsdi/district-boundaries.json)",
                "simplifyToleranceDegrees": TOLERANCE,
                "generated": date.today().isoformat(),
                "districts": dict(sorted(districts.items())),
            },
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT} — {len(districts)} districts, {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
