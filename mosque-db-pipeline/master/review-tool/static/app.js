const FACILITY_FIELDS = [
  ["womenPrayer", "Women's prayer area"],
  ["parking", "Parking"],
  ["airConditioning", "Air conditioning"],
  ["wudu", "Wudu (ablution) facilities"],
  ["jummah", "Jummah (Friday) prayer held"],
];
const TIER_LABELS = {
  triple_corroborated: "Triple-corroborated (NSDI + DMRCA + OSM)",
  quick_confirm: "Quick confirm",
  conflict_to_resolve: "Conflict to resolve",
};
const COORD_UNCHANGED_THRESHOLD_M = 1; // treat as "same point" below this — covers float round-tripping through a paste
const SRI_LANKA_BOUNDS = { latMin: 5.5, latMax: 10.0, lonMin: 79.0, lonMax: 82.5 };

let records = [];       // sorted by queuePosition, from server
let stateMap = {};      // recordId -> current effective state
let currentIndex = 0;
let correctionMode = false;
let viewMode = "coordinate"; // "coordinate" (fast) | "full" (everything) — persists across records in this session
let facilityDraft = {}; // recordId -> {field: true|false|null} in-progress before submit
let map = null;          // full-mode Leaflet map
let mapMarker = null;
let coordMap = null;     // coordinate-mode Leaflet map
let coordMarkerCurrent = null;
let coordMarkerProposed = null;

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function loadAll() {
  const data = await api("/api/records");
  records = data.records; // already server-sorted by queuePosition
  stateMap = data.state;
  currentIndex = 0;
  renderSidebar();
  renderProgress();
  renderCurrent();
}

async function refreshProgressAndSidebar() {
  const p = await api("/api/progress");
  document.getElementById("progress").innerHTML =
    `Verified ${p.verified} / ${p.total}` +
    `<span class="progress-bar-track"><span class="progress-bar-fill" style="width:${(100 * p.verified / p.total).toFixed(1)}%"></span></span>`;
}

function renderProgress() { refreshProgressAndSidebar(); }

function statusDotClass(recId) {
  const s = stateMap[recId];
  if (!s) return "";
  if (s.verificationStatus === "verified") return "verified";
  if (s.invalidFlag) return "invalid";
  if (s.rejectedCandidates && s.rejectedCandidates.length) return "candidate-resolved";
  if (s.skipped) return "skipped";
  return "";
}

function renderSidebar() {
  const el = document.getElementById("queue-list");
  el.innerHTML = "";
  let lastTier = null;
  records.forEach((r, i) => {
    if (r.tier !== lastTier) {
      lastTier = r.tier;
      const h = document.createElement("div");
      h.className = "tier-header";
      h.textContent = TIER_LABELS[r.tier] || r.tier;
      el.appendChild(h);
    }
    const item = document.createElement("div");
    item.className = "queue-item" + (i === currentIndex ? " active" : "");
    item.innerHTML =
      `<span class="rank">#${r.queuePosition}</span>` +
      `<span class="dot ${statusDotClass(r.id)}"></span>` +
      `<span class="label">${escapeHtml(r.name || "(unnamed)")}</span>`;
    item.onclick = () => { currentIndex = i; correctionMode = false; renderSidebar(); renderCurrent(); };
    el.appendChild(item);
  });
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtCoord(v) {
  // Full precision, not rounded — a coordinate you pasted should be echoed
  // back exactly as entered, never silently truncated to fewer digits
  // (found confusing in practice: a display showing "6.463871" for a
  // pasted "6.463871417972701" looked like a *different*, wrong value had
  // been saved, when the full-precision value was actually stored intact).
  return v === null || v === undefined ? "—" : String(v);
}

function confBadge(conf) { return `<span class="badge badge-${conf}">${conf}</span>`; }
function statusBadge(status) { return `<span class="badge badge-${status}">${status.replace("_", " ")}</span>`; }

function currentStateFor(r) {
  return stateMap[r.id] || {
    name: r.name, district: r.district, address: r.address, latitude: r.latitude, longitude: r.longitude,
    verificationStatus: r.verificationStatus, skipped: false, rejectedCandidates: [],
    invalidFlag: false, invalidNote: null,
    ...Object.fromEntries(FACILITY_FIELDS.map(([f]) => [f, r[f]])),
  };
}

function renderCurrent() {
  const r = records[currentIndex];
  const content = document.getElementById("content");
  if (!r) {
    content.innerHTML = `<div class="empty-state">No more records in the queue.</div>`;
    return;
  }
  const s = currentStateFor(r);
  facilityDraft[r.id] = facilityDraft[r.id] || Object.fromEntries(FACILITY_FIELDS.map(([f]) => [f, s[f]]));

  const alreadyVerified = s.verificationStatus === "verified";

  content.innerHTML = `
    ${alreadyVerified ? `<div class="already-done-banner">✓ Already verified${s.reviewedAt ? " at " + escapeHtml(s.reviewedAt) : ""}. You can still adjust it below — changes will be logged.</div>` : ""}
    ${s.invalidFlag ? `<div class="invalid-banner">⚑ Marked invalid${s.invalidNote ? ": " + escapeHtml(s.invalidNote) : ""}. A Verify/Correct below will clear this flag.</div>` : ""}
    <div class="record-header">
      <div>
        <div class="record-title ${s.name ? "" : "unnamed"}">${escapeHtml(s.name || "(unnamed record)")}</div>
        <div class="record-meta">${escapeHtml(r.id)} · queue position #${r.queuePosition} of ${records.length} · ${escapeHtml(TIER_LABELS[r.tier] || r.tier)}</div>
      </div>
      <div class="badges">
        ${confBadge(r.confidence)}
        ${statusBadge(s.verificationStatus)}
      </div>
    </div>

    <div class="mode-toggle-row">
      <div class="mode-toggle">
        <button data-mode="coordinate" class="${viewMode === "coordinate" ? "active" : ""}">⚡ Coordinate check</button>
        <button data-mode="full" class="${viewMode === "full" ? "active" : ""}">Full review</button>
      </div>
    </div>

    ${r.notes ? `<div class="notes-box"><strong>Why this is queued:</strong> ${escapeHtml(r.notes)}</div>` : ""}
    ${!r.notes && r.priorityReason ? `<div class="notes-box">${escapeHtml(r.priorityReason)}</div>` : ""}

    <div id="mode-body"></div>
  `;

  document.querySelectorAll(".mode-toggle button").forEach(btn => {
    btn.onclick = () => { viewMode = btn.dataset.mode; correctionMode = false; renderCurrent(); };
  });

  if (viewMode === "coordinate") {
    renderCoordinateMode(r, s);
  } else {
    renderFullMode(r, s);
  }
}

// ============================== FULL MODE ==============================
// Everything from the original Step 6B tool: identity fields, full source
// table, candidate comparison, facility toggles, Verify/Correct/Skip.

function renderFullMode(r, s) {
  const body = document.getElementById("mode-body");
  const draft = facilityDraft[r.id];

  body.innerHTML = `
    <div class="card" id="fields-card">
      <h3>Proposed identity</h3>
      <div id="fields-display"></div>
    </div>

    <div class="card">
      <h3>Location</h3>
      ${s.latitude !== null && s.latitude !== undefined
        ? `<div id="map"></div><a class="map-link" target="_blank" href="https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=17/${s.latitude}/${s.longitude}">Open in OpenStreetMap ↗</a>`
        : `<div class="record-meta">No coordinates on this record — it came from a source with no geometry (see Sources below).</div>`}
    </div>

    <div class="card">
      <h3>Sources</h3>
      <table class="sources-table">
        <thead><tr><th>Type</th><th>Identifier</th><th>Original name</th><th>Details</th></tr></thead>
        <tbody>${r.sources.map(sourceRow).join("")}</tbody>
      </table>
    </div>

    ${r.candidates && r.candidates.length ? `
    <div class="card">
      <h3>Candidate comparison</h3>
      <div class="candidate-grid">${r.candidates.map(c => candidateCard(c, r.id, s)).join("")}</div>
    </div>` : ""}

    <div class="card">
      <h3>Facility fields</h3>
      <div class="facility-grid">
        ${FACILITY_FIELDS.map(([field, label]) => facilityRow(field, label, draft[field])).join("")}
      </div>
    </div>

    ${reviewerNoteCard()}

    <div class="action-bar" id="action-bar"></div>
  `;

  renderFieldsDisplay(r, s);
  renderFullActionBar(r, s);
  wireFacilityToggles(r.id);

  if (s.latitude !== null && s.latitude !== undefined) {
    setTimeout(() => initMap(s.latitude, s.longitude, s.name), 0);
  }
}

function reviewerNoteCard() {
  return `
    <div class="card">
      <h3>Reviewer note (optional)</h3>
      <textarea class="note-input" id="reviewer-note" placeholder="Anything worth recording about this decision…"></textarea>
    </div>`;
}

function sourceRow(src) {
  let idCell = escapeHtml(src.id);
  if (src.type === "osm") idCell = `<a href="${src.osmLink}" target="_blank">${escapeHtml(src.id)} ↗</a>`;
  if (src.type === "dmrca" && src.sourcePdfUrl) idCell = `${escapeHtml(src.id)} — <a href="${src.sourcePdfUrl}" target="_blank">PDF ↗</a>`;
  const details = [];
  if (src.address) details.push(`Address: ${escapeHtml(src.address)}`);
  if (src.city) details.push(`City: ${escapeHtml(src.city)}`);
  if (src.district) details.push(`District: ${escapeHtml(src.district)}`);
  if (src.latitude !== undefined && src.latitude !== null) details.push(`${src.latitude}, ${src.longitude}`);
  if (src.note) details.push(`<span style="color:var(--text-muted)">${escapeHtml(src.note)}</span>`);
  return `<tr>
    <td><span class="source-type-pill">${src.type}</span></td>
    <td>${idCell}</td>
    <td>${escapeHtml(src.originalName || "—")}</td>
    <td>${details.join(" · ") || "—"}</td>
  </tr>`;
}

function candidateCard(c, recordId, state) {
  const alreadyRejected = (state.rejectedCandidates || []).includes(c.sourceId);
  const cls = c.status === "linked" ? "linked" : "rejected" + (alreadyRejected ? " was-rejected" : "");
  const statusLabel = c.status === "linked" ? "Linked source" : (alreadyRejected ? "Rejected (already decided)" : "Rejected candidate — needs a decision");
  const meta = [];
  if (c.distanceM !== undefined) meta.push(`${c.distanceM} m away`);
  if (c.nameScore !== undefined && c.nameScore !== null) meta.push(`name similarity ${c.nameScore}/100`);
  if (c.address) meta.push(escapeHtml(c.address));
  if (c.city) meta.push(escapeHtml(c.city));
  if (c.latitude !== undefined && c.latitude !== null) meta.push(`${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`);
  return `
    <div class="candidate-card ${cls}">
      <div class="status-label">${statusLabel}</div>
      <div class="cname">${escapeHtml(c.name || "(unnamed)")}</div>
      <div class="cmeta">
        <span class="source-type-pill">${c.sourceType}</span> ${escapeHtml(c.sourceId)}<br/>
        ${meta.join(" · ")}
      </div>
      ${c.reason ? `<div class="creason">${escapeHtml(c.reason)}</div>` : ""}
      ${(c.status !== "linked" && !alreadyRejected) ? `<button class="btn btn-reject btn-small btn-reject-candidate" onclick="rejectCandidate('${escapeHtml(recordId)}', '${escapeHtml(c.sourceType)}', '${escapeHtml(c.sourceId)}')">Reject this candidate</button>` : ""}
    </div>`;
}

function facilityRow(field, label, value) {
  return `
    <div class="facility-row">
      <span class="flabel">${label}</span>
      <div class="tri-toggle" data-field="${field}">
        <button data-value="true" class="${value === true ? "active-yes" : ""}">Yes</button>
        <button data-value="false" class="${value === false ? "active-no" : ""}">No</button>
        <button data-value="null" class="${value === null || value === undefined ? "active-unknown" : ""}">Unknown</button>
      </div>
    </div>`;
}

function wireFacilityToggles(recordId) {
  document.querySelectorAll(".tri-toggle").forEach(group => {
    const field = group.dataset.field;
    group.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => {
        const raw = btn.dataset.value;
        facilityDraft[recordId][field] = raw === "true" ? true : raw === "false" ? false : null;
        group.querySelectorAll("button").forEach(b => b.className = "");
        btn.className = raw === "true" ? "active-yes" : raw === "false" ? "active-no" : "active-unknown";
      };
    });
  });
}

function renderFieldsDisplay(r, s) {
  const el = document.getElementById("fields-display");
  if (!correctionMode) {
    el.innerHTML = `
      <div class="field-grid">
        <div class="field-row"><label>Name</label><span class="value">${escapeHtml(s.name || "—")}</span></div>
        <div class="field-row"><label>District</label><span class="value">${escapeHtml(s.district || "—")}</span></div>
        <div class="field-row"><label>Address</label><span class="value">${escapeHtml(s.address || "—")}</span></div>
        <div class="field-row"><label>Coordinates</label><span class="value">${fmtCoord(s.latitude)}, ${fmtCoord(s.longitude)}</span></div>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="correction-banner">Editing — press "Save correction" to apply. Only changed fields are logged.
        <button class="btn btn-skip btn-small" onclick="cancelCorrection()">Cancel</button>
      </div>
      <div class="field-grid">
        <div class="field-row"><label>Name</label><input id="edit-name" value="${escapeHtml(s.name || "")}" /></div>
        <div class="field-row"><label>District</label><input id="edit-district" value="${escapeHtml(s.district || "")}" /></div>
        <div class="field-row"><label>Address</label><input id="edit-address" value="${escapeHtml(s.address || "")}" /></div>
        <div class="field-row"><label>Latitude</label><input id="edit-lat" value="${s.latitude ?? ""}" /></div>
        <div class="field-row"><label>Longitude</label><input id="edit-lon" value="${s.longitude ?? ""}" /></div>
      </div>`;
  }
}

function cancelCorrection() {
  correctionMode = false;
  renderCurrent();
}

function renderFullActionBar(r, s) {
  const bar = document.getElementById("action-bar");
  if (!correctionMode) {
    bar.innerHTML = `
      <button class="btn btn-verify" onclick="doVerify()">Verify</button>
      <button class="btn btn-correct" onclick="startCorrection()">Correct…</button>
      <button class="btn btn-reject" onclick="doInvalid()">Mark invalid</button>
      <button class="btn btn-skip" onclick="doSkip()">Skip / review later</button>
      <button class="btn btn-skip" onclick="goNext()" ${currentIndex >= records.length - 1 ? "disabled" : ""}>Next →</button>
    `;
  } else {
    bar.innerHTML = `<button class="btn btn-verify" onclick="doCorrect()">Save correction (marks verified)</button>`;
  }
}

function startCorrection() {
  correctionMode = true;
  renderCurrent();
}

function collectFacilityEdits(recordId) {
  const draft = facilityDraft[recordId] || {};
  const s = stateMap[recordId] || {};
  const edits = {};
  FACILITY_FIELDS.forEach(([f]) => {
    const cur = s[f] !== undefined ? s[f] : null;
    if (draft[f] !== cur) edits[f] = draft[f];
  });
  return edits;
}

async function submitReview(decision, extra) {
  const r = records[currentIndex];
  const note = document.getElementById("reviewer-note")?.value || null;
  const body = { recordId: r.id, decision, note, ...extra };
  const res = await api("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  stateMap[r.id] = res.state;
  return res;
}

async function doVerify() {
  await submitReview("verify", { facilityEdits: collectFacilityEdits(records[currentIndex].id) });
  await refreshProgressAndSidebar();
  renderSidebar();
  goNext();
}

async function doCorrect() {
  const r = records[currentIndex];
  const fieldEdits = {
    name: document.getElementById("edit-name").value || null,
    district: document.getElementById("edit-district").value || null,
    address: document.getElementById("edit-address").value || null,
    latitude: parseFloat(document.getElementById("edit-lat").value) || null,
    longitude: parseFloat(document.getElementById("edit-lon").value) || null,
  };
  await submitReview("correct", { fieldEdits, facilityEdits: collectFacilityEdits(r.id) });
  correctionMode = false;
  await refreshProgressAndSidebar();
  renderSidebar();
  goNext();
}

async function doSkip() {
  await submitReview("skip", {});
  await refreshProgressAndSidebar();
  renderSidebar();
  goNext();
}

async function doInvalid() {
  const noteEl = document.getElementById("reviewer-note");
  const note = noteEl ? noteEl.value.trim() : "";
  if (!note) {
    const proceed = confirm("No reason given in the reviewer note — mark this record invalid anyway?");
    if (!proceed) return;
  }
  await submitReview("invalid", {});
  await refreshProgressAndSidebar();
  renderSidebar();
  goNext();
}

async function rejectCandidate(recordId, sourceType, sourceId) {
  const idx = records.findIndex(r => r.id === recordId);
  currentIndex = idx;
  await submitReview("reject_candidate", { candidateDecision: { candidateSourceType: sourceType, candidateId: sourceId, outcome: "rejected" } });
  renderSidebar();
  renderCurrent(); // stay on the same record — there may be more to review
}

function goNext() {
  if (currentIndex < records.length - 1) currentIndex++;
  correctionMode = false;
  renderSidebar();
  renderCurrent();
}

function initMap(lat, lon, label) {
  const el = document.getElementById("map");
  if (!el) return;
  if (map) { try { map.remove(); } catch (e) { /* container already replaced by innerHTML re-render — harmless */ } map = null; }
  map = L.map("map").setView([lat, lon], 17);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  mapMarker = L.marker([lat, lon]).addTo(map);
  if (label) mapMarker.bindPopup(escapeHtml(label));
}

// ============================ COORDINATE MODE ============================
// Fast path: name + DMRCA address/city/district + current coordinates +
// "Open in Google Maps" + one paste-a-coordinate input + Save/Skip/Invalid.

function findDmrcaSource(r) {
  return r.sources.find(x => x.type === "dmrca") || null;
}

function googleMapsSearchUrl(name, address, district) {
  const parts = [name, address, district, "Sri Lanka"].filter(Boolean);
  const q = parts.length ? parts.join(", ") : "Sri Lanka";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

function parseCoordPair(text) {
  if (!text || !text.trim()) return { empty: true };
  const parts = text.split(",").map(p => p.trim()).filter(p => p.length);
  if (parts.length !== 2) return { error: "Expected exactly two comma-separated numbers: latitude, longitude." };
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!isFinite(lat) || !isFinite(lon)) return { error: "Could not parse both values as numbers." };
  if (lat < -90 || lat > 90) return { error: `Latitude ${lat} is out of range (must be between -90 and 90).` };
  if (lon < -180 || lon > 180) return { error: `Longitude ${lon} is out of range (must be between -180 and 180).` };
  const withinSriLanka = lat >= SRI_LANKA_BOUNDS.latMin && lat <= SRI_LANKA_BOUNDS.latMax
    && lon >= SRI_LANKA_BOUNDS.lonMin && lon <= SRI_LANKA_BOUNDS.lonMax;
  return { lat, lon, warning: withinSriLanka ? null : "This looks far from Sri Lanka's usual range — double-check you copied the right value." };
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dphi = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(m) {
  return m < 1000 ? `${m.toFixed(1)} m` : `${(m / 1000).toFixed(2)} km`;
}

function renderCoordinateMode(r, s) {
  const body = document.getElementById("mode-body");
  const dmrca = findDmrcaSource(r);
  const hasCoords = s.latitude !== null && s.latitude !== undefined;
  const mapsUrl = googleMapsSearchUrl(s.name, s.address, s.district);
  const draft = facilityDraft[r.id];

  const prefill = hasCoords ? `${s.latitude}, ${s.longitude}` : "";

  body.innerHTML = `
    <div class="card coord-hero">
      <div class="coord-address-block">
        <div class="coord-line"><label>Name</label><input id="quick-name" class="coord-inline-input" value="${escapeHtml(s.name || "")}" /></div>
        <div class="coord-line"><label>Address</label><input id="quick-address" class="coord-inline-input" value="${escapeHtml(s.address || "")}" /></div>
        <div class="coord-line coord-line-static"><label>City (DMRCA)</label><span>${escapeHtml((dmrca && dmrca.city) || "—")}</span></div>
        <div class="coord-line coord-line-static"><label>District</label><span>${escapeHtml(s.district || "—")}</span></div>
      </div>
      ${!dmrca ? `<div class="coord-no-dmrca">No DMRCA record linked to this one — address/city above may come from a different source, or be blank.</div>` : ""}
      <a class="btn btn-correct" target="_blank" href="${mapsUrl}">Open in Google Maps ↗</a>
    </div>

    <div class="card">
      <h3>Current coordinates</h3>
      <div class="coord-current-value">${hasCoords ? `${fmtCoord(s.latitude)}, ${fmtCoord(s.longitude)}` : "No coordinates on this record yet"}</div>
      ${hasCoords ? `<div id="coord-map"></div>` : `<div class="record-meta">Paste a coordinate below to add one for the first time.</div>`}
    </div>

    <div class="card">
      <h3>Paste coordinates from Google Maps</h3>
      <input id="coord-input" class="coord-input" placeholder="6.024733676809003, 80.21743036899329" value="${escapeHtml(prefill)}" autocomplete="off" />
      <div id="coord-parsed-feedback" class="coord-feedback-area"></div>
      <div class="coord-save-row">
        <button id="coord-save-btn" class="btn btn-verify btn-save-big" onclick="doSaveQuick()">Save &amp; next →</button>
        <span class="coord-save-hint">Saves the name/address above and this coordinate together, then moves to the next record.</span>
      </div>
    </div>

    <div class="card">
      <h3>Facility fields</h3>
      <div class="facility-grid">
        ${FACILITY_FIELDS.map(([field, label]) => facilityRow(field, label, draft[field])).join("")}
      </div>
    </div>

    ${reviewerNoteCard()}

    <div class="action-bar" id="action-bar">
      <button class="btn btn-skip" onclick="doSkip()">Skip / review later</button>
      <button class="btn btn-reject" onclick="doInvalid()">Invalid</button>
      <button class="btn btn-skip" onclick="viewMode='full'; correctionMode=false; renderCurrent();">View full details →</button>
    </div>
  `;

  wireFacilityToggles(r.id);
  wireCoordInput(r, s, hasCoords);

  if (hasCoords) {
    setTimeout(() => initCoordMap(s.latitude, s.longitude, s.name), 0);
  }
}

function wireCoordInput(r, s, hasCoords) {
  const input = document.getElementById("coord-input");
  const feedback = document.getElementById("coord-parsed-feedback");
  const saveBtn = document.getElementById("coord-save-btn");

  function update() {
    const parsed = parseCoordPair(input.value);
    if (parsed.error) {
      feedback.innerHTML = `<div class="coord-feedback error">${escapeHtml(parsed.error)}</div>`;
      saveBtn.disabled = true; // only a genuinely malformed paste blocks Save — an empty field does not
      if (coordMarkerProposed) { coordMap && coordMap.removeLayer(coordMarkerProposed); coordMarkerProposed = null; }
      return;
    }
    saveBtn.disabled = false;
    if (parsed.empty) {
      feedback.innerHTML = hasCoords
        ? `<div class="coord-feedback info">No coordinate pasted — the current coordinate will be kept as-is.</div>`
        : `<div class="coord-feedback info">No coordinate yet — you can still save name/address, or paste one first.</div>`;
      if (coordMarkerProposed) { coordMap && coordMap.removeLayer(coordMarkerProposed); coordMarkerProposed = null; }
      return;
    }
    let html = `<div class="coord-feedback ok">Parsed: latitude ${parsed.lat}, longitude ${parsed.lon}</div>`;
    if (parsed.warning) html += `<div class="coord-feedback warn">⚠ ${escapeHtml(parsed.warning)}</div>`;

    if (hasCoords) {
      const distance = haversineM(s.latitude, s.longitude, parsed.lat, parsed.lon);
      if (distance < COORD_UNCHANGED_THRESHOLD_M) {
        html += `<div class="coord-feedback ok">≈ ${distance.toFixed(2)} m from the current coordinate — will be saved as <strong>unchanged / verified</strong>.</div>`;
      } else {
        html += `<div class="coord-feedback info">≈ ${formatDistance(distance)} from the current coordinate — will be saved as a <strong>correction</strong>.</div>`;
      }
    } else {
      html += `<div class="coord-feedback info">No existing coordinate — this will be added as a new one (a correction).</div>`;
    }
    feedback.innerHTML = html;
    updateCoordMapProposedMarker(parsed.lat, parsed.lon);
  }

  input.addEventListener("input", update);
  update();
}

async function doSaveQuick() {
  const r = records[currentIndex];
  const s = currentStateFor(r);
  const input = document.getElementById("coord-input");
  const parsed = parseCoordPair(input.value);
  if (parsed.error) return; // Save button is disabled in this state; defensive no-op

  const hasCoords = s.latitude !== null && s.latitude !== undefined;
  const distance = (!parsed.empty && hasCoords) ? haversineM(s.latitude, s.longitude, parsed.lat, parsed.lon) : null;
  const coordUnchanged = parsed.empty || (distance !== null && distance < COORD_UNCHANGED_THRESHOLD_M);

  const fieldEdits = {};
  const nameVal = document.getElementById("quick-name").value.trim();
  const addressVal = document.getElementById("quick-address").value.trim();
  if (nameVal !== (s.name || "")) fieldEdits.name = nameVal || null;
  if (addressVal !== (s.address || "")) fieldEdits.address = addressVal || null;
  if (!parsed.empty && !coordUnchanged) {
    fieldEdits.latitude = parsed.lat;
    fieldEdits.longitude = parsed.lon;
  }

  const decision = (Object.keys(fieldEdits).length === 0) ? "verify" : "correct";
  await submitReview(decision, { fieldEdits, facilityEdits: collectFacilityEdits(r.id) });
  await refreshProgressAndSidebar();
  renderSidebar();
  goNext();
}

function initCoordMap(lat, lon, label) {
  const el = document.getElementById("coord-map");
  if (!el) return;
  if (coordMap) { try { coordMap.remove(); } catch (e) { /* container already replaced by innerHTML re-render — harmless */ } coordMap = null; coordMarkerProposed = null; }
  coordMap = L.map("coord-map").setView([lat, lon], 17);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(coordMap);
  coordMarkerCurrent = L.marker([lat, lon]).addTo(coordMap);
  if (label) coordMarkerCurrent.bindPopup("Current: " + escapeHtml(label));
}

function updateCoordMapProposedMarker(lat, lon) {
  if (!coordMap) return;
  const currentLatLng = coordMarkerCurrent ? coordMarkerCurrent.getLatLng() : null;
  const isSameAsCurrent = currentLatLng && haversineM(currentLatLng.lat, currentLatLng.lng, lat, lon) < COORD_UNCHANGED_THRESHOLD_M;
  if (coordMarkerProposed) { coordMap.removeLayer(coordMarkerProposed); coordMarkerProposed = null; }
  if (isSameAsCurrent) return; // nothing new to show — pasted value matches the existing pin
  const proposedIcon = L.divIcon({ className: "proposed-marker-icon", html: "📍", iconSize: [24, 24], iconAnchor: [12, 22] });
  coordMarkerProposed = L.marker([lat, lon], { icon: proposedIcon }).addTo(coordMap).bindPopup("Proposed (unsaved)");
  const bounds = L.latLngBounds([coordMarkerCurrent.getLatLng(), [lat, lon]]);
  coordMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
}

loadAll().catch(err => {
  document.getElementById("content").innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
});
