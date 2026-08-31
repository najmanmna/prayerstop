#!/usr/bin/env python3
"""Matches DMRCA registered-mosque records to NSDI mosque points.

Data-reality constraint (discovered during this pipeline, not assumed up
front): NSDI's raw records have NO address/city/district field at all —
only 426/970 even have a `name`, and 96 of those are just the generic
placeholder "Mosque"/"Masjid" (not a real, specific name). So only 330/970
NSDI points are usable for name-based matching at all; the rest can only
ever be "unmatched" here, correctly, since we're not allowed to invent a
name or fabricate an address for them.

That leaves two real signals, exactly as scoped by the task:
  - normalized name similarity (rapidfuzz, order- and subset-tolerant)
  - geographic proximity "where coordinates are available from NSDI" —
    operationalized as district agreement: NSDI points are assigned a
    district via point-in-polygon against the official NSDI district
    boundaries (script 04); DMRCA records already carry their district from
    the source document they were extracted from. Matching is scoped to
    same-district candidates only — this is the geographic signal, since
    DMRCA records have no coordinates of their own to compute a literal
    distance against.
  - address/city text similarity from DMRCA is recorded but NOT usable as
    a comparison signal against NSDI, since NSDI has no address/city field
    to compare it to. Reported honestly as a structural data gap, not
    silently dropped.

One NSDI point is one physical building — it cannot legitimately be "the
match" for more than one DMRCA registration. An early version of this script
scored each DMRCA record independently and let multiple different DMRCA
records each separately claim the same NSDI point (found empirically: 26
different DMRCA "Mohideen Jumma Mosque" registrations — a very common name
nationwide, honoring a widely venerated Sufi figure — all scoring a
same-district "match" against the single NSDI point actually named that).
That is a duplicate-candidate collision, not 26 real matches. This version
therefore runs a global greedy 1:1 assignment: every (DMRCA, NSDI) scored
pair is ranked by score across the WHOLE dataset, and once an NSDI point is
claimed it is removed from every other DMRCA record's candidate pool.
Any NSDI point more than one DMRCA record scored >= LOW_SCORE against is
recorded as a duplicate-candidate cluster in the report, showing the winner
and the runners-up that lost the slot — never silently discarded.

Confidence tiers (conservative, never auto-upgraded), assigned AFTER the 1:1
assignment resolves which pairing actually wins each NSDI point:
  HIGH   — name score >= 93 AND a clear margin (>= 5 points) over this
           DMRCA record's own runner-up candidate
  MEDIUM — name score >= 85, or a HIGH-scoring pair whose margin was too
           thin to trust as HIGH
  LOW    — name score >= 70 but below the MEDIUM bar — flagged, kept
           separate, never treated as a real match
  UNMATCHED — no in-district NSDI candidate reaches 70, no usable
           in-district NSDI candidates exist at all, or every candidate
           that scored high enough was already claimed by a
           higher-scoring competitor
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from rapidfuzz import fuzz

BASE = Path(__file__).resolve().parent.parent
DMRCA_PATH = BASE / "raw-sources" / "dmrca" / "dmrca-mosques-raw.json"
NSDI_PATH = BASE / "raw-sources" / "nsdi" / "nsdi-mosques-with-district.json"
NORMALIZED_DIR = BASE / "normalized"
NORMALIZED_DIR.mkdir(parents=True, exist_ok=True)

HIGH_SCORE = 93
MEDIUM_SCORE = 85
LOW_SCORE = 70

GENERIC_NAMES = {"mosque", "masjid", "jumma mosque", "jumma masjid", "jame mosque", "palli"}

# Generic mosque-type/descriptor words that appear in most records regardless
# of which specific mosque they name. Left IN raw/normalized text (nothing
# here touches the preserved source values), but excluded when computing the
# "core" identifying tokens a name is scored on — otherwise a short NSDI
# entry like "AC Mosque" spuriously token-set-matches almost every DMRCA
# record just because both strings contain "MOSQUE" (found empirically: an
# uncorrected run produced 841 "low" matches almost all pairing distinct,
# unrelated DMRCA mosques against the same handful of generic-named NSDI
# points — a real false-positive pattern, not a hypothetical one).
CORE_STOPWORDS = {
    "MOSQUE", "MASJID", "MASJIDUL", "MASJITHUL", "MASJIDUS", "MASJIDUR", "MASJIDUN", "MASJIDHUL",
    "JUMMA", "JUMMAH", "JUMA", "JAME", "JAMEA",
    "PALLI", "PALLIVASAL", "ZAVIA", "ZAVIATHUL", "THAKKIYA", "DHARGA", "DHARGAH", "SHRINE",
    "GRAND", "TOWN", "NEW", "THE", "OLD", "CENTRAL",
    # Arabic-transliteration grammatical particles/prefixes ("al-", "-ul-",
    # "-us-", "-un-", "-ur-") that show up as their own token once hyphens
    # are normalized to spaces — near-universal across names, not
    # distinguishing (e.g. "MASJIDUS US SAGEER" from "Masjid-us-Sagheer").
    "AL", "UL", "US", "UN", "UR", "UD",
}


def normalize_text(value: str) -> str:
    if not value:
        return ""
    value = value.upper()
    value = re.sub(r"[^A-Z0-9\s]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def core_name(value: str) -> str:
    """The distinctive-word subset of a normalized name, used for matching
    (see CORE_STOPWORDS above) — a separate derived value, never a
    replacement for the preserved normalizedName."""
    tokens = [t for t in normalize_text(value).split(" ") if t and t not in CORE_STOPWORDS]
    return " ".join(tokens)


def name_score(core_a: str, core_b: str) -> float:
    """Scored on CORE (stopword-stripped) names only. If either side has no
    distinctive tokens left at all (e.g. NSDI name was just "Grand Mosque"),
    there is nothing reliable to match on — score 0, never a guess."""
    if not core_a or not core_b:
        return 0.0
    return max(fuzz.token_sort_ratio(core_a, core_b), fuzz.token_set_ratio(core_a, core_b))


def main():
    dmrca = json.loads(DMRCA_PATH.read_text(encoding="utf-8"))
    nsdi = json.loads(NSDI_PATH.read_text(encoding="utf-8"))

    for r in dmrca:
        r["normalizedName"] = normalize_text(r["name"])
        r["coreName"] = core_name(r["name"])
        r["normalizedAddress"] = normalize_text(r["address"])
        r["normalizedCity"] = normalize_text(r["city"])

    usable_nsdi = []
    for r in nsdi:
        raw_name = (r["name"] or "").strip()
        r["normalizedName"] = normalize_text(raw_name)
        r["coreName"] = core_name(raw_name)
        # Usable requires a real name AND at least one distinctive
        # (non-stopword) token — "Grand Mosque" alone has zero core tokens
        # and is exactly the kind of generic entry that produced false
        # positives before this fix.
        r["isUsableName"] = bool(raw_name) and raw_name.strip().lower() not in GENERIC_NAMES and bool(r["coreName"])
        if r["isUsableName"] and r["district"]:
            usable_nsdi.append(r)

    # Group usable NSDI candidates by district for fast lookup.
    nsdi_by_district: dict[str, list] = {}
    for r in usable_nsdi:
        nsdi_by_district.setdefault(r["district"], []).append(r)

    # For every DMRCA record, score against every in-district usable NSDI
    # candidate scoring >= LOW_SCORE; keep the full ranked list per record
    # (needed both for the greedy assignment and for each record's own
    # runner-up margin afterwards).
    dmrca_candidates: dict[int, list[tuple[float, dict]]] = {}
    for i, d in enumerate(dmrca):
        candidates = nsdi_by_district.get(d["district"], []) if d["coreName"] else []
        scored = [(name_score(d["coreName"], c["coreName"]), c) for c in candidates]
        scored = [t for t in scored if t[0] >= LOW_SCORE]
        scored.sort(key=lambda t: t[0], reverse=True)
        dmrca_candidates[i] = scored

    # Duplicate-candidate clusters: every NSDI point more than one DMRCA
    # record scored against, BEFORE exclusivity is enforced — this is the
    # raw ambiguity in the data, independent of which side ends up winning.
    nsdi_claimants: dict[int, list[tuple[float, int]]] = {}
    for i, d in enumerate(dmrca):
        for score, c in dmrca_candidates[i]:
            nsdi_claimants.setdefault(c["objectid"], []).append((score, i))
    duplicate_clusters = {k: v for k, v in nsdi_claimants.items() if len(v) > 1}

    # Global greedy 1:1 assignment: every (dmrca_index, score, nsdi) triple,
    # ranked highest score first across the WHOLE dataset (ties broken by
    # dmrca_index for determinism), each NSDI point and each DMRCA record
    # can be claimed at most once.
    all_triples = [
        (score, i, c) for i, ranked in dmrca_candidates.items() for score, c in ranked
    ]
    all_triples.sort(key=lambda t: (-t[0], t[1]))

    assigned_dmrca: dict[int, tuple[float, dict]] = {}
    claimed_nsdi: set[int] = set()
    for score, i, c in all_triples:
        if i in assigned_dmrca or c["objectid"] in claimed_nsdi:
            continue
        assigned_dmrca[i] = (score, c)
        claimed_nsdi.add(c["objectid"])

    matches = []
    unmatched_dmrca = []
    for i, d in enumerate(dmrca):
        if i not in assigned_dmrca:
            unmatched_dmrca.append(d)
            continue
        best_score, best_nsdi = assigned_dmrca[i]
        ranked = dmrca_candidates[i]
        runner_up_score = next((s for s, c in ranked if c["objectid"] != best_nsdi["objectid"]), None)

        if best_score >= HIGH_SCORE:
            confidence = "high"
        elif best_score >= MEDIUM_SCORE:
            confidence = "medium"
        else:
            confidence = "low"

        # Runner-up margin — a small gap to this record's own next-best
        # candidate means real ambiguity existed even though this pairing
        # won the slot; never let that masquerade as high confidence.
        if confidence == "high" and runner_up_score is not None and (best_score - runner_up_score) < 5:
            confidence = "medium"

        # A genuine multi-way tie for this exact NSDI point (e.g. several
        # differently-numbered "Mohideen Jumma Mosque" registrations all
        # scoring 100 against the same NSDI name) means the greedy
        # assignment's specific winner is essentially arbitrary — a real
        # pairing may well exist, but this pipeline cannot tell WHICH
        # claimant it is from text alone. Cap at "low" rather than let an
        # arbitrary tie-break read as a confident match.
        cluster = duplicate_clusters.get(best_nsdi["objectid"])
        if cluster and sum(1 for s, _ in cluster if s >= best_score - 1) > 1:
            confidence = "low"

        matches.append({
            "nsdiId": str(best_nsdi["objectid"]),
            "dmrcaRegistrationNo": d["registrationNo"],
            "name": d["name"],
            "address": d["address"],
            "city": d["city"],
            "district": d["district"],
            "latitude": best_nsdi["latitude"],
            "longitude": best_nsdi["longitude"],
            "sources": ["nsdi", "dmrca"],
            "matchConfidence": confidence,
            "matchScore": round(best_score, 1),
            "runnerUpScore": round(runner_up_score, 1) if runner_up_score is not None else None,
            "wasContestedNsdiPoint": best_nsdi["objectid"] in duplicate_clusters,
            "nsdiName": best_nsdi["name"],
            "dmrcaSourcePdf": d["sourcePdfFile"],
        })

    matched_nsdi_ids = {m["nsdiId"] for m in matches}
    unmatched_nsdi = [r for r in nsdi if str(r["objectid"]) not in matched_nsdi_ids]

    duplicate_report = []
    for nsdi_id, claimants in duplicate_clusters.items():
        winner_i = next((i for i, (s, c) in assigned_dmrca.items() if c["objectid"] == nsdi_id), None)
        nsdi_name = next((r["name"] for r in nsdi if r["objectid"] == nsdi_id), None)
        duplicate_report.append({
            "nsdiId": str(nsdi_id),
            "nsdiName": nsdi_name,
            "winnerDmrcaRegistrationNo": dmrca[winner_i]["registrationNo"] if winner_i is not None else None,
            "winnerName": dmrca[winner_i]["name"] if winner_i is not None else None,
            "claimantCount": len(claimants),
            "claimants": [
                {"dmrcaRegistrationNo": dmrca[i]["registrationNo"], "name": dmrca[i]["name"], "score": round(s, 1)}
                for s, i in sorted(claimants, key=lambda t: -t[0])
            ],
        })
    duplicate_report.sort(key=lambda r: -r["claimantCount"])

    (NORMALIZED_DIR / "matches.json").write_text(json.dumps(matches, indent=2, ensure_ascii=False), encoding="utf-8")
    (NORMALIZED_DIR / "unmatched-dmrca.json").write_text(json.dumps(unmatched_dmrca, indent=2, ensure_ascii=False), encoding="utf-8")
    (NORMALIZED_DIR / "unmatched-nsdi.json").write_text(json.dumps(unmatched_nsdi, indent=2, ensure_ascii=False), encoding="utf-8")
    (NORMALIZED_DIR / "duplicate-candidates.json").write_text(json.dumps(duplicate_report, indent=2, ensure_ascii=False), encoding="utf-8")

    from collections import Counter
    tier_counts = Counter(m["matchConfidence"] for m in matches)
    print(f"Total DMRCA records: {len(dmrca)}")
    print(f"Total NSDI records: {len(nsdi)} (usable-name subset: {len(usable_nsdi)})")
    print(f"Matches: {len(matches)}")
    for tier in ("high", "medium", "low"):
        print(f"  {tier}: {tier_counts.get(tier, 0)}")
    print(f"Unmatched DMRCA: {len(unmatched_dmrca)}")
    print(f"Unmatched NSDI: {len(unmatched_nsdi)}")
    print(f"Duplicate-candidate NSDI points (contested by >1 DMRCA record): {len(duplicate_report)}")


if __name__ == "__main__":
    main()
