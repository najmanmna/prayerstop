#!/usr/bin/env python3
"""PrayerStop Mosque Database — internal review tool server.

Zero external dependencies (Python stdlib only — http.server) by design:
this is a private, single-user, local data-curation tool, not a production
service. Run with `python3 server.py` and open http://localhost:8765/.

Persistence model (see README.md for the full explanation):
  - master/review-results/review-log.jsonl  — append-only audit log, one
    JSON object per review action. This is the actual provenance record
    and is NEVER rewritten or truncated by this server, only appended to.
  - master/review-results/review-state.json — a DERIVED cache (current
    effective value per field per record), rebuilt by replaying the log
    every time the server starts, and updated incrementally as actions
    come in. Safe to delete — it regenerates from the log.

Never touches master/output/*.json (Step 6A's outputs) or anything in
raw-sources/, normalized/, or osm-enrichment/ — this server only ever
reads those, and only ever WRITES inside master/review-results/.
"""
from __future__ import annotations

import json
import mimetypes
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
REVIEW_DATA_PATH = ROOT / "data" / "review-data.json"

RESULTS_DIR = ROOT.parent / "review-results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = RESULTS_DIR / "review-log.jsonl"
STATE_PATH = RESULTS_DIR / "review-state.json"

FACILITY_FIELDS = ["womenPrayer", "parking", "airConditioning", "wudu", "jummah"]
EDITABLE_FIELDS = ["name", "district", "address", "latitude", "longitude"]

_lock = threading.Lock()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_review_data():
    return json.loads(REVIEW_DATA_PATH.read_text(encoding="utf-8"))


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {}


def save_state(state):
    STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def append_log(event):
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def rebuild_state_from_log(records_by_id):
    """Replays the append-only log to reconstruct current state — makes
    review-state.json a disposable cache, never the source of truth."""
    state = {}
    if not LOG_PATH.exists():
        return state
    with open(LOG_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            event = json.loads(line)
            rec_id = event["recordId"]
            base = records_by_id.get(rec_id, {})
            s = state.setdefault(rec_id, {
                "verificationStatus": base.get("verificationStatus"),
                "name": base.get("name"), "district": base.get("district"),
                "address": base.get("address"), "latitude": base.get("latitude"), "longitude": base.get("longitude"),
                **{f: base.get(f) for f in FACILITY_FIELDS},
                "skipped": False, "reviewedAt": None, "lastDecision": None,
                "rejectedCandidates": [], "invalidFlag": False, "invalidNote": None,
            })
            for change in event.get("changes", []):
                s[change["field"]] = change["newValue"]
            if event["decision"] == "skip":
                s["skipped"] = True
            else:
                s["skipped"] = False
            if event["decision"] == "reject_candidate" and event.get("candidateDecision"):
                cid = event["candidateDecision"]["candidateId"]
                if cid not in s["rejectedCandidates"]:
                    s["rejectedCandidates"].append(cid)
            if event["decision"] == "invalid":
                s["invalidFlag"] = True
                s["invalidNote"] = event.get("note")
            elif event["decision"] in ("verify", "correct"):
                # A real verify/correct decision supersedes an earlier
                # "invalid" call — the reviewer has changed their mind.
                s["invalidFlag"] = False
                s["invalidNote"] = None
            s["lastDecision"] = event["decision"]
            s["reviewedAt"] = event["reviewedAt"]
    return state


class Handler(BaseHTTPRequestHandler):
    server_version = "PrayerStopReviewTool/1.0"

    def log_message(self, fmt, *args):
        pass  # keep console quiet; this is a local dev tool

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def _send_static(self, rel_path: str):
        if rel_path == "" or rel_path == "/":
            rel_path = "index.html"
        file_path = (STATIC_DIR / rel_path).resolve()
        if STATIC_DIR not in file_path.parents and file_path != STATIC_DIR:
            self.send_error(403)
            return
        if not file_path.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        # This tool's static files change frequently while it's actively
        # being developed against — never let the browser serve a stale
        # cached copy of app.js/style.css/index.html after an edit.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/records":
            with _lock:
                records = load_review_data()
                by_id = {r["id"]: r for r in records}
                state = rebuild_state_from_log(by_id)
                save_state(state)
            self._send_json({"records": records, "state": state})
            return
        if parsed.path == "/api/progress":
            with _lock:
                records = load_review_data()
                by_id = {r["id"]: r for r in records}
                state = rebuild_state_from_log(by_id)
            total = len(records)
            verified = sum(1 for s in state.values() if s["verificationStatus"] == "verified")
            skipped_only = sum(1 for s in state.values() if s["skipped"] and s["verificationStatus"] != "verified")
            invalid_count = sum(1 for s in state.values() if s["invalidFlag"])
            touched = len(state)
            self._send_json({
                "verified": verified, "total": total, "touched": touched,
                "skippedPending": skipped_only, "invalid": invalid_count, "remaining": total - touched,
            })
            return
        # static files
        self._send_static(parsed.path.lstrip("/"))

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/review":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            self._send_json({"error": "invalid JSON body"}, status=400)
            return

        record_id = body.get("recordId")
        decision = body.get("decision")
        if not record_id or decision not in ("verify", "correct", "reject_candidate", "skip", "invalid"):
            self._send_json({"error": "recordId and a valid decision are required"}, status=400)
            return

        with _lock:
            records = load_review_data()
            by_id = {r["id"]: r for r in records}
            if record_id not in by_id:
                self._send_json({"error": f"unknown recordId {record_id}"}, status=404)
                return
            state = rebuild_state_from_log(by_id)
            current = state.get(record_id) or {
                "verificationStatus": by_id[record_id]["verificationStatus"],
                "name": by_id[record_id]["name"], "district": by_id[record_id]["district"],
                "address": by_id[record_id]["address"], "latitude": by_id[record_id]["latitude"],
                "longitude": by_id[record_id]["longitude"],
                **{f: by_id[record_id][f] for f in FACILITY_FIELDS},
            }

            changes = []
            field_edits = body.get("fieldEdits", {})
            for field, new_value in field_edits.items():
                if field not in EDITABLE_FIELDS:
                    continue
                prev = current.get(field)
                if prev != new_value:
                    changes.append({"field": field, "previousValue": prev, "newValue": new_value})

            facility_edits = body.get("facilityEdits", {})
            for field, new_value in facility_edits.items():
                if field not in FACILITY_FIELDS or new_value not in (True, False, None):
                    continue
                prev = current.get(field)
                if prev != new_value:
                    changes.append({"field": field, "previousValue": prev, "newValue": new_value})

            if decision in ("verify", "correct"):
                prev_status = current.get("verificationStatus")
                if prev_status != "verified":
                    changes.append({"field": "verificationStatus", "previousValue": prev_status, "newValue": "verified"})

            event = {
                "recordId": record_id,
                "decision": decision,
                "reviewer": body.get("reviewer") or "local",
                "reviewedAt": now_iso(),
                "changes": changes,
                "candidateDecision": body.get("candidateDecision"),
                "note": body.get("note"),
            }
            append_log(event)
            new_state = rebuild_state_from_log(by_id)
            save_state(new_state)

            total = len(records)
            verified = sum(1 for s in new_state.values() if s["verificationStatus"] == "verified")

        self._send_json({"ok": True, "event": event, "state": new_state[record_id], "progress": {"verified": verified, "total": total}})


def main():
    port = 8765
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"PrayerStop mosque review tool running at http://127.0.0.1:{port}/")
    print(f"Review log: {LOG_PATH}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
