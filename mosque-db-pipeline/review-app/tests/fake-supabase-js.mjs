// A stateful fake of the exact subset of supabase-js's client shape app.js
// calls, served to a real browser (via Playwright route interception on
// the CDN import URL) in place of the real library — lets tests drive the
// REAL index.html/app.js/style.css/data.js/coord-utils.js through a REAL
// DOM and REAL click/input events, without needing a live Supabase
// project. Complements (does not replace) tests/mock-supabase.mjs, which
// unit-tests data.js's logic directly in Node.
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const MOSQUE_1 = {
  id: 'nsdi-16027',
  name: 'BAITHUL MUBARAK BUKHARI THAKKIYA',
  latitude: 6.577581781000049,
  longitude: 80.14738434400005,
  district: 'Kalutara',
  address: 'MALIGAWATTE, MALIGAHENA',
  confidence: 'high',
  verification_status: 'needs_review',
  sources: [
    { type: 'nsdi', id: '16027', originalName: 'Mubarak Mosque', note: 'Sri Lanka NSDI' },
    { type: 'dmrca', id: 'R/807/KL.42', originalName: 'BAITHUL MUBARAK BUKHARI THAKKIYA', address: 'MALIGAWATTE, MALIGAHENA', city: 'BERUWELA' },
  ],
};
const MOSQUE_2 = {
  id: 'nsdi-17967',
  name: 'AL - MASJIDUL MUNEER',
  latitude: 6.878538936000041,
  longitude: 81.83902609100005,
  district: 'Ampara',
  address: 'HIDAYAPURAM,',
  confidence: 'high',
  verification_status: 'needs_review',
  sources: [{ type: 'nsdi', id: '17967', originalName: 'Al Muneera Mosque' }],
};

const TASK_1 = { id: 'task-1111', mosque_id: MOSQUE_1.id, status: 'claimed', priority_tier: 'triple_corroborated' };
const TASK_2 = { id: 'task-2222', mosque_id: MOSQUE_2.id, status: 'claimed', priority_tier: 'quick_confirm' };

export function createClient() {
  const state = { session: null, completedCount: 5, claimCallCount: 0, calls: [] };
  window.__fakeSupabaseState = state; // exposed so the test can assert on it

  return {
    auth: {
      async signInWithPassword({ email, password }) {
        state.calls.push(['signInWithPassword', email]);
        if (password === 'wrongpassword') {
          return { data: { session: null }, error: { message: 'Invalid login credentials' } };
        }
        state.session = { user: { id: USER_ID, email } };
        return { data: { session: state.session }, error: null };
      },
      async signUp() {
        return { data: { session: null }, error: null };
      },
      async signOut() {
        state.session = null;
        return { error: null };
      },
      async getSession() {
        return { data: { session: state.session }, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from(table) {
      const builder = {
        _filters: [],
        _opts: null,
        select(arg, opts) {
          this._opts = opts;
          return this;
        },
        eq(col, val) {
          this._filters.push([col, val]);
          return this;
        },
        async maybeSingle() {
          state.calls.push(['from.maybeSingle', table, this._filters]);
          if (table === 'review_tasks') return { data: null, error: null }; // no active task on first load
          if (table === 'mosque_records') {
            const id = this._filters.find(([c]) => c === 'id')?.[1];
            return { data: id === MOSQUE_2.id ? MOSQUE_2 : MOSQUE_1, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          state.calls.push(['from.then(count)', table, this._filters]);
          resolve({ data: null, error: null, count: state.completedCount });
        },
      };
      return builder;
    },
    async rpc(fnName, params) {
      state.calls.push(['rpc', fnName, params]);
      if (fnName === 'claim_next_review_task') {
        state.claimCallCount += 1;
        return { data: state.claimCallCount === 1 ? TASK_1 : TASK_2, error: null };
      }
      if (fnName === 'complete_review_task') {
        state.completedCount += 1;
        return { data: { ...TASK_1, status: 'completed' }, error: null };
      }
      if (fnName === 'skip_review_task') {
        return { data: { ...TASK_1, status: 'unclaimed' }, error: null };
      }
      if (fnName === 'log_review_note') {
        return { data: { id: 1 }, error: null };
      }
      return { data: null, error: null };
    },
  };
}
