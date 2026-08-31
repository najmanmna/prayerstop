#!/usr/bin/env python3
"""Assigns each of the 970 NSDI mosque points a district, via point-in-polygon
against the official NSDI District Boundary layer (25 polygons, ArcGIS
esriGeometryPolygon ring format — some districts are multi-ring, e.g. Jaffna
has lagoon islands as separate rings). NSDI's raw records have no
address/city/district field at all, so this is the only way to scope DMRCA
matching to plausible same-district candidates instead of comparing every
DMRCA record against all 970 NSDI points nationwide."""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import Point, shape as shapely_shape

BASE = Path(__file__).resolve().parent.parent
NSDI_SRC = Path(__file__).resolve().parent.parent.parent / "nsdi-mosque-investigation" / "mosques-all-970.json"
BOUNDARIES_PATH = BASE / "raw-sources" / "nsdi" / "district-boundaries.json"
OUT_PATH = BASE / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"


def esri_polygon_to_shapely(geometry: dict):
    """ArcGIS esriGeometryPolygon: a flat list of rings; outer rings are
    clockwise, holes counter-clockwise (standard Esri convention), but we
    don't need to distinguish here — shapely's `shape()` via a GeoJSON-style
    MultiPolygon built from the signed area of each ring handles it, so we
    classify rings by winding order (shoelace formula) into exterior vs hole
    and pair holes with the exterior ring that contains them."""
    rings = geometry["rings"]

    def signed_area(ring):
        area = 0.0
        for i in range(len(ring) - 1):
            x1, y1 = ring[i]
            x2, y2 = ring[i + 1]
            area += x1 * y2 - x2 * y1
        return area / 2.0

    exteriors = []  # (ring, )
    holes = []
    for ring in rings:
        if signed_area(ring) < 0:  # clockwise = exterior (Esri convention)
            exteriors.append(ring)
        else:
            holes.append(ring)

    from shapely.geometry import Polygon, MultiPolygon

    if not exteriors:
        # Degenerate/unexpected winding — treat every ring as its own exterior.
        exteriors = rings
        holes = []

    polygons = []
    for ext in exteriors:
        ext_poly = Polygon(ext)
        my_holes = [h for h in holes if ext_poly.contains(Point(h[0]))]
        polygons.append(Polygon(ext, my_holes) if my_holes else ext_poly)

    return polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)


def main():
    boundaries = json.loads(BOUNDARIES_PATH.read_text(encoding="utf-8"))
    district_polys = []
    for feat in boundaries["features"]:
        name = feat["attributes"]["district_name"]
        poly = esri_polygon_to_shapely(feat["geometry"])
        district_polys.append((name, poly, poly.bounds))  # bounds for a cheap bbox pre-filter

    nsdi = json.loads(NSDI_SRC.read_text(encoding="utf-8"))
    features = nsdi["features"]

    assigned = 0
    unassigned = []
    out_records = []
    for feat in features:
        geom = feat.get("geometry")
        attrs = feat["attributes"]
        district = None
        if geom and geom.get("x") is not None and geom.get("y") is not None:
            pt = Point(geom["x"], geom["y"])
            for name, poly, (minx, miny, maxx, maxy) in district_polys:
                if not (minx <= pt.x <= maxx and miny <= pt.y <= maxy):
                    continue
                if poly.contains(pt) or poly.touches(pt):
                    district = name
                    break
        if district:
            assigned += 1
        else:
            unassigned.append(attrs.get("objectid"))

        out_records.append({
            "objectid": attrs.get("objectid"),
            "buildingId": attrs.get("building_id"),
            "name": attrs.get("name"),
            "yearOfCreation": attrs.get("year_of_creation"),
            "gfcode": attrs.get("gfcode"),
            "latitude": geom["y"] if geom else None,
            "longitude": geom["x"] if geom else None,
            "district": district,
        })

    OUT_PATH.write_text(json.dumps(out_records, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Total NSDI mosque points: {len(features)}")
    print(f"Assigned a district: {assigned}")
    print(f"Unassigned (no containing polygon found — likely just outside a boundary edge): {len(unassigned)}")
    if unassigned:
        print(f"  objectids: {unassigned}")
    print(f"Written to {OUT_PATH}")


if __name__ == "__main__":
    main()
