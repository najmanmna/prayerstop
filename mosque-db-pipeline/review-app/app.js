import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createReviewClient } from './data.js';
import { parseCoordPair, classifyCoordinateSave, googleMapsSearchUrl, fmtCoord, formatDistance } from './coord-utils.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const review = createReviewClient(supabase);

const appEl = document.getElementById('app');
const topbarRightEl = document.getElementById('topbar-right');

let session = null;
let authMode = 'signin'; // 'signin' | 'signup'
let currentTask = null; // the claimed review_tasks row, or null
let currentMosque = null; // the mosque_records row for currentTask
let completedCount = 0;
let isAdmin = false;
let viewMode = 'task'; // 'task' | 'admin' | 'admin-edit' — admin* only ever reachable when isAdmin is true
let adminData = null; // { reviewers, tasks, mosques } — fetched on demand, not on every load
let expandedReviewerId = null; // which reviewer's reviewed-list is open in the admin overview
let adminEditTarget = null; // { task, mosque } — the completed task an admin is currently correcting
let banner = null; // { kind: 'info'|'warn'|'error', message, retry?: fn }
// Preserved across re-renders of the auth form (e.g. after a failed
// sign-in shows an error banner) — without this, rebuilding the form's
// innerHTML wipes whatever the reviewer had already typed, which is a
// real, confusing bug: retrying after a typo'd password meant re-typing
// the email too.
let authFieldValues = { email: '', password: '', name: '' };
let coordMap = null;
let coordMarkerCurrent = null;
let coordMarkerProposed = null;
let busy = false; // guards against double-submits while an action is in flight

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setBanner(kind, message, retry) {
  banner = { kind, message, retry };
  render();
}
function clearBanner() {
  banner = null;
}

// ============================================================ bootstrap
async function init() {
  review.onAuthStateChange((event, newSession) => {
    if (event === 'SIGNED_OUT') {
      session = null;
      currentTask = null;
      currentMosque = null;
      isAdmin = false;
      viewMode = 'task';
      adminData = null;
      expandedReviewerId = null;
      adminEditTarget = null;
      render();
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      session = newSession;
    }
  });

  try {
    session = await review.getSession();
  } catch {
    session = null;
  }

  if (session) {
    await loadReviewerState();
  }
  render();
}

async function loadReviewerState() {
  try {
    const [task, count, profile] = await Promise.all([
      review.getMyActiveTask(session.user.id),
      review.getMyCompletedCount(session.user.id),
      review.getMyReviewerProfile(session.user.id),
    ]);
    currentTask = task;
    completedCount = count;
    isAdmin = profile?.role === 'admin';
    if (currentTask) {
      currentMosque = await review.getMosque(currentTask.mosque_id);
    } else {
      await ensureActiveTask();
    }
    clearBanner();
  } catch (err) {
    setBanner('error', err.message, loadReviewerState);
  }
}

/** Claims the next available task if the reviewer doesn't already have one. */
async function ensureActiveTask() {
  if (currentTask) return;
  try {
    const task = await review.claimNext();
    if (!task) {
      currentTask = null;
      currentMosque = null;
      render();
      return;
    }
    currentTask = task;
    currentMosque = await review.getMosque(task.mosque_id);
    clearBanner();
  } catch (err) {
    setBanner('error', err.message, ensureActiveTask);
  }
  render();
}

// =============================================================== render
function render() {
  appEl.classList.remove('app-wide'); // only the task screen (below) opts back in
  if (!session) {
    renderAuthScreen();
    return;
  }
  topbarRightEl.innerHTML = `
    <span class="progress-pill">${completedCount} reviewed</span>
    ${isAdmin ? `<button class="btn btn-correct" id="admin-toggle-btn">${viewMode === 'admin' ? '← Back' : 'Admin'}</button>` : ''}
    <span class="reviewer-name">${escapeHtml(session.user.email)}</span>
    <button class="btn btn-skip" id="logout-btn">Log out</button>
  `;
  document.getElementById('logout-btn').onclick = doLogout;
  if (isAdmin) {
    document.getElementById('admin-toggle-btn').onclick = () => (viewMode === 'admin' ? exitAdminView() : enterAdminView());
  }

  if (viewMode === 'admin') {
    renderAdminScreen();
    return;
  }
  if (viewMode === 'admin-edit') {
    renderAdminEditScreen();
    return;
  }

  if (!currentTask) {
    renderNoTaskScreen();
    return;
  }
  renderTaskScreen();
}

/** Fetches the admin overview fresh each time it's opened — small enough (a
 * handful of reviewers, 518 tasks) that staleness isn't worth caching around. */
async function enterAdminView() {
  try {
    adminData = await review.getAdminOverview();
    viewMode = 'admin';
    clearBanner();
  } catch (err) {
    setBanner('error', err.message);
  }
  render();
}
function exitAdminView() {
  viewMode = 'task';
  render();
}

function renderAuthScreen() {
  topbarRightEl.innerHTML = '';
  const isSignIn = authMode === 'signin';
  appEl.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-title">${isSignIn ? 'Sign in' : 'Create your reviewer account'}</div>
        <div class="auth-subtitle">${isSignIn ? 'Private mosque review tool — reviewers only.' : 'You will be registered as a reviewer.'}</div>
        ${banner ? `<div class="auth-error">${escapeHtml(banner.message)}</div>` : ''}
        <form id="auth-form">
          ${!isSignIn ? `<div class="auth-field"><label>Display name</label><input id="auth-name" required value="${escapeHtml(authFieldValues.name)}" /></div>` : ''}
          <div class="auth-field"><label>Email</label><input id="auth-email" type="email" required autocomplete="username" value="${escapeHtml(authFieldValues.email)}" /></div>
          <div class="auth-field"><label>Password</label><input id="auth-password" type="password" required autocomplete="${isSignIn ? 'current-password' : 'new-password'}" minlength="6" value="${escapeHtml(authFieldValues.password)}" /></div>
          <button class="btn btn-verify auth-submit" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Please wait…' : isSignIn ? 'Sign in' : 'Sign up'}</button>
        </form>
        <div class="auth-toggle">
          ${isSignIn ? `New reviewer? <a id="auth-toggle">Create an account</a>` : `Already have an account? <a id="auth-toggle">Sign in</a>`}
        </div>
      </div>
    </div>
  `;
  document.getElementById('auth-toggle').onclick = () => {
    authMode = isSignIn ? 'signup' : 'signin';
    authFieldValues = { email: '', password: '', name: '' };
    clearBanner();
    render();
  };
  document.getElementById('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = !isSignIn ? document.getElementById('auth-name').value.trim() : '';
    // Captured *before* the busy-state re-render (which rebuilds this
    // form's innerHTML from scratch) so nothing the reviewer typed is lost
    // if this attempt fails and they need to retry.
    authFieldValues = { email, password, name };
    busy = true;
    render();
    try {
      if (isSignIn) {
        session = await review.signIn(email, password);
      } else {
        session = await review.signUp(email, password, name);
      }
      busy = false;
      if (session) {
        authFieldValues = { email: '', password: '', name: '' };
        await loadReviewerState();
      } else {
        // Supabase email-confirmation-required projects return no session
        // on signUp until the reviewer confirms their address.
        authFieldValues = { email, password: '', name: '' };
        setBanner('info', 'Account created — check your email to confirm, then sign in.');
        authMode = 'signin';
      }
      render();
    } catch (err) {
      busy = false;
      setBanner('error', err.message);
    }
  };
}

function renderNoTaskScreen() {
  appEl.innerHTML = `
    ${bannerHtml()}
    <div class="queue-empty">
      <h2>All caught up 🎉</h2>
      <p>There are no unclaimed mosques left in the queue right now.<br/>Check back later, or refresh to look again.</p>
      <div class="action-bar" style="justify-content:center; margin-top:16px;">
        <button class="btn btn-verify" id="refresh-queue-btn">Check again</button>
      </div>
    </div>
  `;
  wireBanner();
  document.getElementById('refresh-queue-btn').onclick = () => ensureActiveTask();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderAdminScreen() {
  const { reviewers, tasks, mosques } = adminData;
  const mosqueById = new Map(mosques.map((m) => [m.id, m]));
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const claimed = tasks.filter((t) => t.status === 'claimed').length;
  const unclaimed = tasks.filter((t) => t.status === 'unclaimed').length;
  const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const rows = reviewers
    .map((r) => {
      const myCompleted = tasks.filter((t) => t.assigned_reviewer_id === r.id && t.status === 'completed');
      const activeNow = tasks.some((t) => t.assigned_reviewer_id === r.id && t.status === 'claimed');
      const isExpanded = expandedReviewerId === r.id && myCompleted.length > 0;
      const mainRow = `<tr class="reviewer-row ${myCompleted.length ? 'has-list' : ''}" data-reviewer-row="${escapeHtml(r.id)}">
        <td>${myCompleted.length ? `<span class="expand-caret">${isExpanded ? '▾' : '▸'}</span> ` : ''}${escapeHtml(r.display_name)}</td>
        <td><span class="badge ${r.role === 'admin' ? 'badge-verified' : 'badge-unverified'}">${escapeHtml(r.role)}</span></td>
        <td>${myCompleted.length}</td>
        <td>${activeNow ? '<span class="badge badge-medium">reviewing now</span>' : '—'}</td>
      </tr>`;
      if (!isExpanded) return mainRow;
      const detailRow = `<tr class="reviewer-detail-row"><td colspan="4">
        <div class="reviewed-list">
          ${myCompleted
            .map((t) => {
              const m = mosqueById.get(t.mosque_id);
              return `<div class="reviewed-item">
                <div class="reviewed-item-main">
                  <div class="reviewed-name">${escapeHtml((m && m.name) || '(unnamed record)')}</div>
                  <div class="reviewed-meta">${escapeHtml((m && m.district) || '—')} · ${formatDate(t.completed_at)}</div>
                </div>
                <button class="btn btn-correct btn-small edit-review-btn" data-task="${escapeHtml(t.id)}" data-mosque="${escapeHtml(t.mosque_id)}">Edit</button>
              </div>`;
            })
            .join('')}
        </div>
      </td></tr>`;
      return mainRow + detailRow;
    })
    .join('');

  appEl.innerHTML = `
    ${bannerHtml()}
    <div class="task-title">Admin overview</div>
    <div class="task-meta">Aggregate progress across every reviewer — visible to admins only. Click a reviewer to see what they've reviewed.</div>

    <div class="card stat-grid">
      <div class="stat-box"><div class="stat-value">${tasks.length}</div><div class="stat-label">Total mosques queued</div></div>
      <div class="stat-box"><div class="stat-value">${completed}</div><div class="stat-label">Completed</div></div>
      <div class="stat-box"><div class="stat-value">${claimed}</div><div class="stat-label">Currently claimed</div></div>
      <div class="stat-box"><div class="stat-value">${unclaimed}</div><div class="stat-label">Unclaimed</div></div>
      <div class="stat-box"><div class="stat-value">${pct}%</div><div class="stat-label">Progress</div></div>
    </div>

    <div class="card">
      <h3>Reviewers</h3>
      <div class="table-scroll">
        <table class="sources-table">
          <thead><tr><th>Name</th><th>Role</th><th>Completed</th><th>Status</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">No reviewers yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
  wireBanner();
  document.querySelectorAll('[data-reviewer-row]').forEach((tr) => {
    if (!tr.classList.contains('has-list')) return;
    tr.onclick = () => {
      const id = tr.dataset.reviewerRow;
      expandedReviewerId = expandedReviewerId === id ? null : id;
      render();
    };
  });
  document.querySelectorAll('.edit-review-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      enterAdminEdit(btn.dataset.task, btn.dataset.mosque);
    };
  });
}

/** Loads the target task+mosque fresh and opens the correction screen. */
async function enterAdminEdit(taskId, mosqueId) {
  try {
    const mosque = await review.getMosque(mosqueId);
    const task = adminData.tasks.find((t) => t.id === taskId) || null;
    adminEditTarget = { task, mosque };
    viewMode = 'admin-edit';
    clearBanner();
  } catch (err) {
    setBanner('error', err.message);
  }
  render();
}

function exitAdminEdit() {
  adminEditTarget = null;
  viewMode = 'admin';
  clearBanner();
  render();
}

function renderAdminEditScreen() {
  const { task, mosque: m } = adminEditTarget;
  const dmrca = findDmrcaSource(m);
  const hasCoords = m.latitude !== null && m.latitude !== undefined;
  const mapsUrl = googleMapsSearchUrl(m.name, m.address, m.district);
  const prefill = hasCoords ? `${m.latitude}, ${m.longitude}` : '';
  const originalReviewer = adminData.reviewers.find((r) => r.id === task.assigned_reviewer_id);

  appEl.innerHTML = `
    ${bannerHtml()}
    <div class="banner banner-info">
      <span>Admin correction — originally reviewed by <strong>${escapeHtml(originalReviewer ? originalReviewer.display_name : 'an unknown reviewer')}</strong> on ${formatDate(task.completed_at)}. Saving adds a new audit entry; it does not reopen or reassign the task.</span>
    </div>
    <div class="task-title ${m.name ? '' : 'unnamed'}">${escapeHtml(m.name || '(unnamed record)')}</div>
    <div class="task-meta">${escapeHtml(m.id)}</div>
    <div class="badges">
      <span class="badge badge-${m.confidence}">${m.confidence}</span>
      <span class="badge badge-${m.verification_status}">${m.verification_status.replace('_', ' ')}</span>
    </div>

    <div class="card coord-hero">
      <div class="coord-address-block">
        <div class="coord-line"><label>Name</label><input id="edit-name" class="coord-inline-input" value="${escapeHtml(m.name || '')}" /></div>
        <div class="coord-line"><label>Address</label><input id="edit-address" class="coord-inline-input" value="${escapeHtml(m.address || '')}" /></div>
        <div class="coord-line coord-line-static"><label>City (DMRCA)</label><span>${escapeHtml((dmrca && dmrca.city) || '—')}</span></div>
        <div class="coord-line coord-line-static"><label>District</label><span>${escapeHtml(m.district || '—')}</span></div>
      </div>
      ${!dmrca ? `<div class="coord-no-dmrca">No DMRCA record linked to this one — address/city above may come from a different source, or be blank.</div>` : ''}
      <a class="btn btn-correct" target="_blank" href="${mapsUrl}">Open in Google Maps ↗</a>
    </div>

    <div class="card">
      <h3>Current coordinates</h3>
      <div class="coord-current-value">${hasCoords ? `${fmtCoord(m.latitude)}, ${fmtCoord(m.longitude)}` : 'No coordinates on this record yet'}</div>
      ${hasCoords ? `<div id="coord-map"></div>` : `<div class="task-meta">Paste a coordinate below to add one.</div>`}
    </div>

    <div class="card">
      <h3>Paste coordinates from Google Maps</h3>
      <input id="coord-input" class="coord-input" placeholder="6.024733676809003, 80.21743036899329" value="${escapeHtml(prefill)}" autocomplete="off" />
      <div id="coord-parsed-feedback" class="coord-feedback-area"></div>
      <div class="coord-save-row">
        <button id="save-btn" class="btn btn-verify btn-big" ${busy ? 'disabled' : ''}>Save correction</button>
        <button id="cancel-edit-btn" class="btn btn-skip" ${busy ? 'disabled' : ''}>Cancel</button>
      </div>
    </div>

    <div class="card">
      <h3>Sources</h3>
      <div class="table-scroll">
        <table class="sources-table">
          <thead><tr><th>Type</th><th>Identifier</th><th>Original name</th><th>Details</th></tr></thead>
          <tbody>${(m.sources || []).map(sourceRow).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Correction note (optional)</h3>
      <textarea class="note-input" id="reviewer-note" placeholder="What was wrong, and why you're correcting it…"></textarea>
    </div>
  `;

  wireBanner();
  wireCoordInput(m, hasCoords);
  document.getElementById('save-btn').onclick = doAdminSave;
  document.getElementById('cancel-edit-btn').onclick = exitAdminEdit;

  if (hasCoords) {
    setTimeout(() => initCoordMap(m.latitude, m.longitude, m.name), 0);
  }
}

function bannerHtml() {
  if (!banner) return '';
  return `<div class="banner banner-${banner.kind}">
    <span>${escapeHtml(banner.message)}</span>
    ${banner.retry ? `<button class="btn btn-skip" id="banner-retry-btn">Retry</button>` : ''}
  </div>`;
}
function wireBanner() {
  const btn = document.getElementById('banner-retry-btn');
  if (btn) btn.onclick = () => { const fn = banner.retry; clearBanner(); fn(); };
}

function findDmrcaSource(mosque) {
  return (mosque.sources || []).find((s) => s.type === 'dmrca') || null;
}

function renderTaskScreen() {
  appEl.classList.add('app-wide');
  const m = currentMosque;
  const dmrca = findDmrcaSource(m);
  const hasCoords = m.latitude !== null && m.latitude !== undefined;
  const mapsUrl = googleMapsSearchUrl(m.name, m.address, m.district);
  const prefill = hasCoords ? `${m.latitude}, ${m.longitude}` : '';

  appEl.innerHTML = `
    <div class="task-layout">
    <div class="task-main">
    ${bannerHtml()}
    <div class="task-title ${m.name ? '' : 'unnamed'}">${escapeHtml(m.name || '(unnamed record)')}</div>
    <div class="task-meta">${escapeHtml(m.id)}${currentTask.priority_tier ? ' · ' + escapeHtml(currentTask.priority_tier.replace(/_/g, ' ')) : ''}</div>
    <div class="badges">
      <span class="badge badge-${m.confidence}">${m.confidence}</span>
      <span class="badge badge-${m.verification_status}">${m.verification_status.replace('_', ' ')}</span>
    </div>

    <div class="card coord-hero">
      <div class="coord-address-block">
        <div class="coord-line"><label>Name</label><input id="edit-name" class="coord-inline-input" value="${escapeHtml(m.name || '')}" /></div>
        <div class="coord-line"><label>Address</label><input id="edit-address" class="coord-inline-input" value="${escapeHtml(m.address || '')}" /></div>
        <div class="coord-line coord-line-static"><label>City (DMRCA)</label><span>${escapeHtml((dmrca && dmrca.city) || '—')}</span></div>
        <div class="coord-line coord-line-static"><label>District</label><span>${escapeHtml(m.district || '—')}</span></div>
      </div>
      ${!dmrca ? `<div class="coord-no-dmrca">No DMRCA record linked to this one — address/city above may come from a different source, or be blank.</div>` : ''}
      <a class="btn btn-correct" target="_blank" href="${mapsUrl}">Open in Google Maps ↗</a>
    </div>

    <div class="card">
      <h3>Current coordinates</h3>
      <div class="coord-current-value">${hasCoords ? `${fmtCoord(m.latitude)}, ${fmtCoord(m.longitude)}` : 'No coordinates on this record yet'}</div>
      ${hasCoords ? `<div id="coord-map"></div>` : `<div class="task-meta">Paste a coordinate below to add one for the first time.</div>`}
    </div>

    <div class="card">
      <h3>Paste coordinates from Google Maps</h3>
      <input id="coord-input" class="coord-input" placeholder="6.024733676809003, 80.21743036899329" value="${escapeHtml(prefill)}" autocomplete="off" />
      <div id="coord-parsed-feedback" class="coord-feedback-area"></div>
      <div class="coord-save-row">
        <button id="save-btn" class="btn btn-verify btn-big" ${busy ? 'disabled' : ''}>Save &amp; next →</button>
        <span class="coord-save-hint">Saves the name/address above and this coordinate together, then gets you the next mosque.</span>
      </div>
    </div>

    <div class="card">
      <h3>Sources</h3>
      <div class="table-scroll">
        <table class="sources-table">
          <thead><tr><th>Type</th><th>Identifier</th><th>Original name</th><th>Details</th></tr></thead>
          <tbody>${(m.sources || []).map(sourceRow).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>Reviewer note (optional)</h3>
      <textarea class="note-input" id="reviewer-note" placeholder="Anything worth recording about this decision…"></textarea>
    </div>

    <div class="action-bar">
      <button class="btn btn-skip" id="skip-btn" ${busy ? 'disabled' : ''}>Skip / review later</button>
      <button class="btn btn-reject" id="invalid-btn" ${busy ? 'disabled' : ''}>Invalid</button>
    </div>
    </div>
    ${reviewTipsHtml()}
    </div>
  `;

  wireBanner();
  wireCoordInput(m, hasCoords);
  document.getElementById('save-btn').onclick = doSave;
  document.getElementById('skip-btn').onclick = doSkip;
  document.getElementById('invalid-btn').onclick = doInvalid;

  if (hasCoords) {
    setTimeout(() => initCoordMap(m.latitude, m.longitude, m.name), 0);
  }
}

function reviewTipsHtml() {
  return `
    <aside class="task-sidebar">
      <div class="card tips-card">
        <h3>Before you save</h3>
        <ul class="tips-list">
          <li><strong>Always check the address.</strong> The DMRCA address/city/district is a source record, not a guarantee — fix the Name/Address fields above if they're wrong, incomplete, or don't match the actual mosque.</li>
          <li><strong>Always add or update the coordinate from Google Maps</strong> when you can find the real pin, even if the existing one looks close — don't leave one unverified just because it's roughly in the right place.</li>
        </ul>
        <h3>Copying a coordinate from Google Maps</h3>
        <ol class="tips-list tips-steps">
          <li>Tap <strong>Open in Google Maps ↗</strong> above to search this mosque by name.</li>
          <li>Find the correct pin — drag it onto the actual building if it's off.</li>
          <li>Right-click the pin (desktop) or long-press it (phone). The coordinates appear at the top of the menu, e.g. <code>6.9271, 79.8612</code>.</li>
          <li>Click/tap those numbers to copy them.</li>
          <li>Paste into the box below — latitude and longitude split automatically.</li>
        </ol>
      </div>
    </aside>
  `;
}

function sourceRow(src) {
  let idCell = escapeHtml(src.id);
  if (src.type === 'osm' && src.osmLink) idCell = `<a href="${src.osmLink}" target="_blank">${escapeHtml(src.id)} ↗</a>`;
  if (src.type === 'dmrca' && src.sourcePdfUrl) idCell = `${escapeHtml(src.id)} — <a href="${src.sourcePdfUrl}" target="_blank">PDF ↗</a>`;
  const details = [];
  if (src.address) details.push(`Address: ${escapeHtml(src.address)}`);
  if (src.city) details.push(`City: ${escapeHtml(src.city)}`);
  if (src.district) details.push(`District: ${escapeHtml(src.district)}`);
  if (src.latitude !== undefined && src.latitude !== null) details.push(`${src.latitude}, ${src.longitude}`);
  return `<tr>
    <td><span class="source-type-pill">${escapeHtml(src.type)}</span></td>
    <td>${idCell}</td>
    <td>${escapeHtml(src.originalName || '—')}</td>
    <td>${details.join(' · ') || '—'}</td>
  </tr>`;
}

function wireCoordInput(mosque, hasCoords) {
  const input = document.getElementById('coord-input');
  const feedback = document.getElementById('coord-parsed-feedback');
  const saveBtn = document.getElementById('save-btn');

  function update() {
    const parsed = parseCoordPair(input.value);
    const outcome = classifyCoordinateSave(mosque, parsed);
    saveBtn.disabled = busy || outcome.kind === 'blocked';

    if (outcome.kind === 'blocked') {
      feedback.innerHTML = parsed.error
        ? `<div class="coord-feedback error">${escapeHtml(parsed.error)}</div>`
        : `<div class="coord-feedback info">${escapeHtml(outcome.reason)}</div>`;
      clearProposedMarker();
      return;
    }
    let html = '';
    if (!parsed.empty) {
      html += `<div class="coord-feedback ok">Parsed: latitude ${parsed.lat}, longitude ${parsed.lon}</div>`;
      if (parsed.warning) html += `<div class="coord-feedback warn">⚠ ${escapeHtml(parsed.warning)}</div>`;
    }
    if (outcome.kind === 'unchanged') {
      html += parsed.empty
        ? `<div class="coord-feedback info">No coordinate pasted — the current coordinate will be kept as-is.</div>`
        : `<div class="coord-feedback ok">≈ ${outcome.distanceM.toFixed(2)} m from the current coordinate — will be saved as <strong>unchanged / verified</strong>.</div>`;
      clearProposedMarker();
    } else {
      html += outcome.distanceM === null
        ? `<div class="coord-feedback info">No existing coordinate — this will be added as a new one.</div>`
        : `<div class="coord-feedback info">≈ ${formatDistance(outcome.distanceM)} from the current coordinate — will be saved as a <strong>correction</strong>.</div>`;
      if (!parsed.empty) updateProposedMarker(parsed.lat, parsed.lon);
    }
    feedback.innerHTML = html;
  }

  input.addEventListener('input', update);
  update();
}

// ============================================================== actions
async function doSave() {
  if (busy) return;
  const m = currentMosque;
  const input = document.getElementById('coord-input');
  const parsed = parseCoordPair(input.value);
  const outcome = classifyCoordinateSave(m, parsed);
  if (outcome.kind === 'blocked') return;

  const nameVal = document.getElementById('edit-name').value.trim();
  const addressVal = document.getElementById('edit-address').value.trim();
  const note = document.getElementById('reviewer-note').value.trim() || null;

  const changes = [];
  if (nameVal !== (m.name || '')) changes.push({ field: 'name', newValue: nameVal || null });
  if (addressVal !== (m.address || '')) changes.push({ field: 'address', newValue: addressVal || null });
  if (outcome.kind === 'correct') changes.push({ field: 'latitude', newValue: parsed.lat }, { field: 'longitude', newValue: parsed.lon });

  const decision = changes.length === 0 ? 'verify' : 'correct';

  busy = true;
  render();
  try {
    await review.completeTask(currentTask.id, decision, changes, note);
    completedCount += 1;
    await advanceToNext();
  } catch (err) {
    busy = false;
    handleActionError(err);
  }
}

async function doSkip() {
  if (busy) return;
  const note = document.getElementById('reviewer-note').value.trim() || null;
  busy = true;
  render();
  try {
    await review.skipTask(currentTask.id, note);
    await advanceToNext();
  } catch (err) {
    busy = false;
    handleActionError(err);
  }
}

async function doAdminSave() {
  if (busy) return;
  const { task, mosque: m } = adminEditTarget;
  const input = document.getElementById('coord-input');
  const parsed = parseCoordPair(input.value);
  const outcome = classifyCoordinateSave(m, parsed);
  if (outcome.kind === 'blocked') return;

  const nameVal = document.getElementById('edit-name').value.trim();
  const addressVal = document.getElementById('edit-address').value.trim();
  const note = document.getElementById('reviewer-note').value.trim() || null;

  const changes = [];
  if (nameVal !== (m.name || '')) changes.push({ field: 'name', newValue: nameVal || null });
  if (addressVal !== (m.address || '')) changes.push({ field: 'address', newValue: addressVal || null });
  if (outcome.kind === 'correct') changes.push({ field: 'latitude', newValue: parsed.lat }, { field: 'longitude', newValue: parsed.lon });

  if (changes.length === 0) {
    setBanner('warn', 'No changes to save yet — edit a field above, or Cancel to leave it as-is.');
    return;
  }

  busy = true;
  render();
  try {
    await review.adminCorrectTask(task.id, 'correct', changes, note);
    adminData = await review.getAdminOverview(); // refresh so the overview reflects the correction immediately
    busy = false;
    adminEditTarget = null;
    viewMode = 'admin';
    setBanner('info', 'Correction saved.');
  } catch (err) {
    busy = false;
    if (err.code === '28000') {
      session = null;
    } else {
      setBanner('error', err.message);
    }
  }
  render();
}

async function doInvalid() {
  if (busy) return;
  const note = document.getElementById('reviewer-note').value.trim() || null;
  if (!note && !window.confirm('No reason given — mark this record invalid anyway?')) return;
  busy = true;
  render();
  try {
    await review.markInvalid(currentTask.id, note);
    await advanceToNext();
  } catch (err) {
    busy = false;
    handleActionError(err);
  }
}

/** Shared "action succeeded, move on" path: clear the finished task and claim the next one. */
async function advanceToNext() {
  currentTask = null;
  currentMosque = null;
  busy = false;
  clearBanner();
  await ensureActiveTask();
}

/**
 * A lost claim race (P0002/42501 — someone else finished this mosque
 * first) is not a dead end: drop the stale task and get a fresh one
 * automatically, with a brief explanation, rather than leaving the
 * reviewer stuck looking at a task that no longer belongs to them.
 */
function handleActionError(err) {
  if (err.code === 'P0002' || err.code === '42501') {
    currentTask = null;
    currentMosque = null;
    setBanner('warn', err.message);
    ensureActiveTask();
    return;
  }
  if (err.code === '28000') {
    session = null;
    render();
    return;
  }
  setBanner(err.code === 'NETWORK' ? 'error' : 'error', err.message, () => { clearBanner(); render(); });
}

async function doLogout() {
  try {
    await review.signOut();
  } catch {
    // sign-out failing (e.g. offline) shouldn't trap the reviewer — clear
    // local state regardless so they land back on the login screen.
  }
  session = null;
  currentTask = null;
  currentMosque = null;
  isAdmin = false;
  viewMode = 'task';
  adminData = null;
  expandedReviewerId = null;
  adminEditTarget = null;
  authFieldValues = { email: '', password: '', name: '' };
  render();
}

// ================================================================= map
function initCoordMap(lat, lon, label) {
  const el = document.getElementById('coord-map');
  if (!el) return;
  if (coordMap) { try { coordMap.remove(); } catch { /* container already replaced */ } coordMap = null; coordMarkerProposed = null; }
  coordMap = L.map('coord-map').setView([lat, lon], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(coordMap);
  coordMarkerCurrent = L.marker([lat, lon]).addTo(coordMap);
  if (label) coordMarkerCurrent.bindPopup('Current: ' + escapeHtml(label));
}

function updateProposedMarker(lat, lon) {
  if (!coordMap) return;
  clearProposedMarker();
  const icon = L.divIcon({ className: 'proposed-marker-icon', html: '📍', iconSize: [24, 24], iconAnchor: [12, 22] });
  coordMarkerProposed = L.marker([lat, lon], { icon }).addTo(coordMap).bindPopup('Proposed (unsaved)');
  const bounds = L.latLngBounds([coordMarkerCurrent.getLatLng(), [lat, lon]]);
  coordMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
}
function clearProposedMarker() {
  if (coordMarkerProposed && coordMap) { coordMap.removeLayer(coordMarkerProposed); coordMarkerProposed = null; }
}

init();
