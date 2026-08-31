// A minimal, faithful-enough mock of the supabase-js v2 surface data.js
// actually uses — not a reimplementation of supabase-js, just enough
// chainable query-builder/rpc/auth shape to unit-test data.js without a
// network connection or a live Supabase project. Records every call so
// tests can assert on exactly what was requested (e.g. "did this really
// filter by the caller's own user id, never someone else's").

export function createMockSupabase({ rpcImpl, fromImpl, authImpl } = {}) {
  const calls = { rpc: [], from: [], auth: [] };

  function makeQueryBuilder(table) {
    const state = { table, filters: [], selectArg: null, selectOptions: null };
    const builder = {
      select(arg, options) {
        state.selectArg = arg;
        state.selectOptions = options ?? null;
        return builder;
      },
      eq(column, value) {
        state.filters.push([column, value]);
        return builder;
      },
      in(column, values) {
        state.filters.push([column, values]);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      async maybeSingle() {
        calls.from.push({ ...state, terminal: 'maybeSingle' });
        const result = fromImpl ? fromImpl(state) : { data: null, error: null };
        return result;
      },
      async single() {
        calls.from.push({ ...state, terminal: 'single' });
        return fromImpl ? fromImpl(state) : { data: null, error: null };
      },
      // supabase-js query builders are themselves "thenable" so `await
      // supabase.from(...).select(...)` works with no terminal method —
      // used by getMyCompletedCount's head:true count query.
      then(resolve, reject) {
        calls.from.push({ ...state, terminal: 'then' });
        const result = fromImpl ? fromImpl(state) : { data: null, error: null, count: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    _calls: calls,
    from(table) {
      return makeQueryBuilder(table);
    },
    async rpc(fnName, params) {
      calls.rpc.push({ fnName, params });
      if (!rpcImpl) return { data: null, error: null };
      return rpcImpl(fnName, params);
    },
    auth: {
      async signInWithPassword(args) {
        calls.auth.push({ method: 'signInWithPassword', args });
        return authImpl?.signInWithPassword?.(args) ?? { data: { session: null }, error: null };
      },
      async signUp(args) {
        calls.auth.push({ method: 'signUp', args });
        return authImpl?.signUp?.(args) ?? { data: { session: null }, error: null };
      },
      async signOut() {
        calls.auth.push({ method: 'signOut' });
        return authImpl?.signOut?.() ?? { error: null };
      },
      async getSession() {
        calls.auth.push({ method: 'getSession' });
        return authImpl?.getSession?.() ?? { data: { session: null }, error: null };
      },
      onAuthStateChange(cb) {
        calls.auth.push({ method: 'onAuthStateChange' });
        authImpl?.onAuthStateChange?.(cb);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  };
}

export function postgrestError(code, message) {
  return { code, message: message ?? `mock error ${code}` };
}
