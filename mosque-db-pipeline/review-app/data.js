// Data-access layer — every call the app makes to Supabase goes through
// here, and nowhere else. Deliberately thin: no business logic lives in
// this file that the database doesn't already enforce (claim/complete/skip
// atomicity, ownership, append-only history are all real Postgres
// guarantees — see mosque-db-pipeline/supabase/migrations). This module's
// only job is calling the right RPC/query and turning Postgres error codes
// into messages a reviewer can act on.
//
// Takes an already-constructed supabase-js client as a dependency (not
// imported directly) so this whole module is unit-testable with a plain
// mock object — see tests/data.test.mjs — without needing a real network
// connection or a live Supabase project.

export const FACILITY_FIELDS = ['women_prayer', 'parking', 'air_conditioning', 'wudu', 'jummah'];
export const EDITABLE_FIELDS = ['name', 'address', 'district', 'latitude', 'longitude'];

const ERROR_MESSAGES = {
  '28000': "You're signed out. Please log in again.",
  '42501': "That task isn't yours right now — it may have been completed, skipped, or reassigned. Try Next mosque.",
  P0002: 'That mosque was just claimed or completed by someone else. Getting you a different one…',
  '22023': 'Something about that action was invalid — please try again.',
};

/** Wraps a Postgres/PostgREST error (or a raw network failure) into a message safe to show a reviewer. */
export function toFriendlyError(error) {
  if (!error) return new Error('Unknown error');
  if (error.code && ERROR_MESSAGES[error.code]) {
    return Object.assign(new Error(ERROR_MESSAGES[error.code]), { code: error.code, cause: error });
  }
  // supabase-js surfaces a plain network/fetch failure with no `.code` at
  // all (e.g. offline, DNS failure, CORS) — distinguish that from a real
  // Postgres error so the UI can offer "check your connection" specifically.
  if (!error.code && /fetch|network|failed to fetch/i.test(error.message || '')) {
    return Object.assign(new Error('Network error — check your connection and try again.'), { code: 'NETWORK', cause: error });
  }
  return Object.assign(new Error(error.message || 'Something went wrong.'), { code: error.code, cause: error });
}

export function createReviewClient(supabase) {
  return {
    // ---------------------------------------------------------------- auth
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw toFriendlyError(error);
      return data.session;
    },

    async signUp(email, password, displayName) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw toFriendlyError(error);
      return data.session;
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw toFriendlyError(error);
    },

    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw toFriendlyError(error);
      return data.session;
    },

    onAuthStateChange(callback) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
      return () => data.subscription.unsubscribe();
    },

    // ------------------------------------------------------------ my work
    // Every query below is scoped to the calling user's own id AND is
    // additionally enforced server-side by RLS regardless — this
    // `.eq('assigned_reviewer_id', userId)` is defense-in-depth, not the
    // only thing standing between a reviewer and someone else's task (see
    // mosque-db-pipeline/supabase/migrations/0002_rls_policies.sql).
    async getMyActiveTask(userId) {
      const { data, error } = await supabase
        .from('review_tasks')
        .select('*')
        .eq('assigned_reviewer_id', userId)
        .eq('status', 'claimed')
        .maybeSingle();
      if (error) throw toFriendlyError(error);
      return data;
    },

    async getMyCompletedCount(userId) {
      const { count, error } = await supabase
        .from('review_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_reviewer_id', userId)
        .eq('status', 'completed');
      if (error) throw toFriendlyError(error);
      return count ?? 0;
    },

    async getMosque(mosqueId) {
      const { data, error } = await supabase.from('mosque_records').select('*').eq('id', mosqueId).maybeSingle();
      if (error) throw toFriendlyError(error);
      return data;
    },

    async getMyReviewerProfile(userId) {
      const { data, error } = await supabase.from('reviewers').select('id,display_name,role').eq('id', userId).maybeSingle();
      if (error) throw toFriendlyError(error);
      return data;
    },

    // ------------------------------------------------------------- admin
    // Only meaningful for a caller whose own role is 'admin' — but that's
    // not something this method checks or needs to: RLS (0002_rls_policies.sql,
    // "admins can view all reviewer profiles" / "admins can view all tasks")
    // is what actually restricts a non-admin caller to just their own rows,
    // regardless of what this method requests. Aggregated client-side from
    // small full-table reads (reviewers ~single digits, review_tasks 518
    // rows, mosque_records fetched only for the completed subset) rather
    // than a new database function — no schema change needed for a
    // read-only summary RLS already permits.
    async getAdminOverview() {
      const [{ data: reviewers, error: e1 }, { data: tasks, error: e2 }] = await Promise.all([
        supabase.from('reviewers').select('id,display_name,role,created_at').order('created_at', { ascending: true }),
        supabase.from('review_tasks').select('id,mosque_id,assigned_reviewer_id,status,completed_at').order('completed_at', { ascending: false }),
      ]);
      if (e1) throw toFriendlyError(e1);
      if (e2) throw toFriendlyError(e2);

      const completedMosqueIds = [...new Set((tasks ?? []).filter((t) => t.status === 'completed').map((t) => t.mosque_id))];
      let mosques = [];
      if (completedMosqueIds.length > 0) {
        const { data, error: e3 } = await supabase.from('mosque_records').select('id,name,district,verification_status').in('id', completedMosqueIds);
        if (e3) throw toFriendlyError(e3);
        mosques = data ?? [];
      }

      return { reviewers: reviewers ?? [], tasks: tasks ?? [], mosques };
    },

    // Admin-only correction of a task that's already completed — routes
    // through admin_correct_mosque_task (0005), never a direct table write.
    // Requires the caller to actually be admin AND the task to actually be
    // completed; both are enforced server-side (RLS + the function's own
    // private.is_admin() check), this is not the authorization boundary.
    async adminCorrectTask(taskId, decision, changes, note) {
      const { data, error } = await supabase.rpc('admin_correct_mosque_task', {
        p_task_id: taskId,
        p_decision: { decision, changes: changes ?? [], note: note ?? null },
      });
      if (error) throw toFriendlyError(error);
      return data;
    },

    // --------------------------------------------------------- the queue
    /** Returns the claimed task, or null if the queue is currently empty (not an error). */
    async claimNext() {
      const { data, error } = await supabase.rpc('claim_next_review_task');
      if (error) throw toFriendlyError(error);
      return data ?? null;
    },

    async completeTask(taskId, decision, changes, note) {
      const { data, error } = await supabase.rpc('complete_review_task', {
        p_task_id: taskId,
        p_decision: { decision, changes: changes ?? [], note: note ?? null },
      });
      if (error) throw toFriendlyError(error);
      return data;
    },

    async skipTask(taskId, note) {
      const { data, error } = await supabase.rpc('skip_review_task', { p_task_id: taskId, p_note: note ?? null });
      if (error) throw toFriendlyError(error);
      return data;
    },

    // "Invalid" logs the decision distinctly (preserving the real audit
    // trail) AND releases the task back to the unclaimed pool — otherwise
    // the reviewer would be stuck holding a task they've already decided
    // isn't reviewable, unable to move on without a second action.
    async markInvalid(taskId, note) {
      const { error: logError } = await supabase.rpc('log_review_note', {
        p_task_id: taskId,
        p_decision: 'invalid',
        p_candidate_decision: null,
        p_note: note ?? null,
      });
      if (logError) throw toFriendlyError(logError);
      const { data, error } = await supabase.rpc('skip_review_task', { p_task_id: taskId, p_note: note ?? null });
      if (error) throw toFriendlyError(error);
      return data;
    },
  };
}
