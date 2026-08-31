import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createReviewClient, toFriendlyError } from '../data.js';
import { createMockSupabase, postgrestError } from './mock-supabase.mjs';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

describe('toFriendlyError', () => {
  test('maps known Postgres error codes to reviewer-facing messages', () => {
    assert.match(toFriendlyError(postgrestError('P0002')).message, /claimed or completed by someone else/i);
    assert.match(toFriendlyError(postgrestError('42501')).message, /isn't yours right now/i);
    assert.match(toFriendlyError(postgrestError('28000')).message, /signed out/i);
  });

  test('distinguishes a real network failure from a Postgres error', () => {
    const err = toFriendlyError({ message: 'Failed to fetch' });
    assert.equal(err.code, 'NETWORK');
    assert.match(err.message, /network error/i);
  });

  test('falls back to the raw message for an unrecognized code', () => {
    const err = toFriendlyError(postgrestError('99999', 'some obscure db error'));
    assert.equal(err.message, 'some obscure db error');
  });
});

describe('createReviewClient — auth', () => {
  test('signIn calls supabase.auth.signInWithPassword with the given credentials', async () => {
    const supabase = createMockSupabase({
      authImpl: { signInWithPassword: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }) },
    });
    const client = createReviewClient(supabase);
    const session = await client.signIn('a@test.local', 'hunter2');
    assert.equal(session.user.id, USER_A);
    assert.equal(supabase._calls.auth[0].args.email, 'a@test.local');
    assert.equal(supabase._calls.auth[0].args.password, 'hunter2');
  });

  test('signIn throws a friendly error on bad credentials, never a raw Postgres error', async () => {
    const supabase = createMockSupabase({
      authImpl: { signInWithPassword: async () => ({ data: { session: null }, error: { message: 'Invalid login credentials' } }) },
    });
    const client = createReviewClient(supabase);
    await assert.rejects(() => client.signIn('a@test.local', 'wrong'), /Invalid login credentials/);
  });

  test('signUp passes display_name through as user metadata', async () => {
    const supabase = createMockSupabase({
      authImpl: { signUp: async () => ({ data: { session: {} }, error: null }) },
    });
    const client = createReviewClient(supabase);
    await client.signUp('new@test.local', 'pw', 'New Reviewer');
    assert.equal(supabase._calls.auth[0].args.options.data.display_name, 'New Reviewer');
  });
});

describe('createReviewClient — my work is always scoped to my own id', () => {
  test('getMyActiveTask filters by the given userId and status=claimed, never a different user', async () => {
    const supabase = createMockSupabase({
      fromImpl: () => ({ data: { id: 'task-1', assigned_reviewer_id: USER_A, status: 'claimed' }, error: null }),
    });
    const client = createReviewClient(supabase);
    await client.getMyActiveTask(USER_A);

    const call = supabase._calls.from[0];
    assert.equal(call.table, 'review_tasks');
    assert.deepEqual(call.filters, [
      ['assigned_reviewer_id', USER_A],
      ['status', 'claimed'],
    ]);
  });

  test('getMyActiveTask never filters by another user id, even implicitly', async () => {
    const supabase = createMockSupabase({ fromImpl: () => ({ data: null, error: null }) });
    const client = createReviewClient(supabase);
    await client.getMyActiveTask(USER_A);
    const call = supabase._calls.from[0];
    assert.ok(!call.filters.some(([, value]) => value === USER_B), 'must never reference USER_B');
  });

  test('getMyCompletedCount scopes to the caller and status=completed, returns 0 not null when empty', async () => {
    const supabase = createMockSupabase({ fromImpl: () => ({ count: null, error: null }) });
    const client = createReviewClient(supabase);
    const n = await client.getMyCompletedCount(USER_A);
    assert.equal(n, 0);
    const call = supabase._calls.from[0];
    assert.deepEqual(call.filters, [
      ['assigned_reviewer_id', USER_A],
      ['status', 'completed'],
    ]);
    assert.equal(call.selectOptions.count, 'exact');
  });
});

describe('createReviewClient — reviewer profile + admin overview', () => {
  test('getMyReviewerProfile filters by the given userId', async () => {
    const supabase = createMockSupabase({
      fromImpl: () => ({ data: { id: USER_A, display_name: 'A', role: 'admin' }, error: null }),
    });
    const client = createReviewClient(supabase);
    const profile = await client.getMyReviewerProfile(USER_A);
    assert.equal(profile.role, 'admin');
    const call = supabase._calls.from[0];
    assert.equal(call.table, 'reviewers');
    assert.deepEqual(call.filters, [['id', USER_A]]);
  });

  test('getAdminOverview reads reviewers, review_tasks, and (for the completed subset) mosque_records — never filters to a single reviewer', async () => {
    const reviewers = [{ id: USER_A, display_name: 'A', role: 'admin' }, { id: USER_B, display_name: 'B', role: 'reviewer' }];
    const tasks = [
      { id: 't1', mosque_id: 'm1', assigned_reviewer_id: USER_A, status: 'completed' },
      { id: 't2', mosque_id: 'm2', assigned_reviewer_id: USER_B, status: 'claimed' },
      { id: 't3', mosque_id: 'm3', assigned_reviewer_id: null, status: 'unclaimed' },
    ];
    const mosques = [{ id: 'm1', name: 'Mosque One', district: 'Colombo' }];
    const supabase = createMockSupabase({
      fromImpl: (state) => {
        if (state.table === 'reviewers') return { data: reviewers, error: null };
        if (state.table === 'review_tasks') return { data: tasks, error: null };
        return { data: mosques, error: null }; // mosque_records
      },
    });
    const client = createReviewClient(supabase);
    const overview = await client.getAdminOverview();

    assert.deepEqual(overview.reviewers, reviewers);
    assert.deepEqual(overview.tasks, tasks);
    assert.deepEqual(overview.mosques, mosques);
    const tables = supabase._calls.from.map((c) => c.table).sort();
    assert.deepEqual(tables, ['mosque_records', 'review_tasks', 'reviewers']);

    const mosqueCall = supabase._calls.from.find((c) => c.table === 'mosque_records');
    assert.deepEqual(mosqueCall.filters, [['id', ['m1']]], 'must only fetch mosques for completed tasks, by id — never the full 3685-row table');

    for (const call of supabase._calls.from.filter((c) => c.table !== 'mosque_records')) {
      assert.equal(call.filters.length, 0, 'reviewer/task reads must not filter to a single reviewer — that would defeat the point of an overview');
    }
  });

  test('getAdminOverview skips the mosque_records query entirely when nothing is completed yet', async () => {
    const tasks = [{ id: 't1', mosque_id: 'm1', assigned_reviewer_id: null, status: 'unclaimed' }];
    const supabase = createMockSupabase({
      fromImpl: (state) => (state.table === 'review_tasks' ? { data: tasks, error: null } : { data: [], error: null }),
    });
    const client = createReviewClient(supabase);
    const overview = await client.getAdminOverview();
    assert.deepEqual(overview.mosques, []);
    assert.ok(!supabase._calls.from.some((c) => c.table === 'mosque_records'), 'no completed tasks means nothing to look up');
  });

  test('getAdminOverview propagates an error if any query fails', async () => {
    const supabase = createMockSupabase({
      fromImpl: (state) => (state.table === 'reviewers' ? { data: null, error: postgrestError('42501') } : { data: [], error: null }),
    });
    const client = createReviewClient(supabase);
    await assert.rejects(() => client.getAdminOverview());
  });
});

describe('createReviewClient — admin correction of an already-completed task', () => {
  test('adminCorrectTask sends decision + changes + note to admin_correct_mosque_task', async () => {
    const supabase = createMockSupabase({ rpcImpl: () => ({ data: { id: 'task-1', status: 'completed' }, error: null }) });
    const client = createReviewClient(supabase);
    const changes = [{ field: 'name', newValue: 'Corrected Name' }];
    await client.adminCorrectTask('task-1', 'correct', changes, 'fixed a typo');

    const call = supabase._calls.rpc[0];
    assert.equal(call.fnName, 'admin_correct_mosque_task');
    assert.equal(call.params.p_task_id, 'task-1');
    assert.equal(call.params.p_decision.decision, 'correct');
    assert.deepEqual(call.params.p_decision.changes, changes);
    assert.equal(call.params.p_decision.note, 'fixed a typo');
  });

  test('adminCorrectTask propagates a friendly error when the caller is not an admin', async () => {
    const supabase = createMockSupabase({
      rpcImpl: () => ({ data: null, error: postgrestError('42501', 'admin_correct_mosque_task requires admin role') }),
    });
    const client = createReviewClient(supabase);
    await assert.rejects(() => client.adminCorrectTask('task-1', 'correct', [], null), /isn't yours right now/i);
  });

  test('adminCorrectTask propagates a friendly error when the task is not completed', async () => {
    const supabase = createMockSupabase({ rpcImpl: () => ({ data: null, error: postgrestError('P0002', 'task is not a completed task') }) });
    const client = createReviewClient(supabase);
    await assert.rejects(() => client.adminCorrectTask('task-1', 'correct', [], null), /claimed or completed by someone else/i);
  });
});

describe('createReviewClient — claiming', () => {
  test('claimNext calls the claim_next_review_task RPC with no task id (server picks it)', async () => {
    const supabase = createMockSupabase({
      rpcImpl: (fn) => (fn === 'claim_next_review_task' ? { data: { id: 'task-2', status: 'claimed' }, error: null } : { data: null, error: null }),
    });
    const client = createReviewClient(supabase);
    const task = await client.claimNext();
    assert.equal(task.id, 'task-2');
    assert.equal(supabase._calls.rpc[0].fnName, 'claim_next_review_task');
    assert.equal(supabase._calls.rpc[0].params, undefined);
  });

  test('claimNext returns null (not an error) when the queue is empty', async () => {
    const supabase = createMockSupabase({ rpcImpl: () => ({ data: null, error: null }) });
    const client = createReviewClient(supabase);
    const task = await client.claimNext();
    assert.equal(task, null);
  });

  test('claimNext throws a friendly error when the caller is not a registered reviewer', async () => {
    const supabase = createMockSupabase({ rpcImpl: () => ({ data: null, error: postgrestError('42501', 'caller is not a registered reviewer') }) });
    const client = createReviewClient(supabase);
    await assert.rejects(() => client.claimNext());
  });
});

describe('createReviewClient — completing/skipping only ever targets the given taskId', () => {
  test('completeTask sends decision + changes + note to complete_review_task', async () => {
    const supabase = createMockSupabase({ rpcImpl: () => ({ data: { id: 'task-1', status: 'completed' }, error: null }) });
    const client = createReviewClient(supabase);
    const changes = [{ field: 'latitude', newValue: 6.93 }];
    await client.completeTask('task-1', 'correct', changes, 'moved the pin');

    const call = supabase._calls.rpc[0];
    assert.equal(call.fnName, 'complete_review_task');
    assert.equal(call.params.p_task_id, 'task-1');
    assert.equal(call.params.p_decision.decision, 'correct');
    assert.deepEqual(call.params.p_decision.changes, changes);
    assert.equal(call.params.p_decision.note, 'moved the pin');
  });

  test('completeTask propagates "not your task" as a friendly error (server-enforced ownership)', async () => {
    const supabase = createMockSupabase({
      rpcImpl: () => ({ data: null, error: postgrestError('42501', 'task cannot be completed by this reviewer') }),
    });
    const client = createReviewClient(supabase);
    await assert.rejects(() => client.completeTask('someone-elses-task', 'verify', [], null), /isn't yours right now/i);
  });

  test('skipTask calls skip_review_task with the task id and note', async () => {
    const supabase = createMockSupabase({ rpcImpl: () => ({ data: { id: 'task-1', status: 'unclaimed' }, error: null }) });
    const client = createReviewClient(supabase);
    await client.skipTask('task-1', 'not sure about this one');
    const call = supabase._calls.rpc[0];
    assert.equal(call.fnName, 'skip_review_task');
    assert.deepEqual(call.params, { p_task_id: 'task-1', p_note: 'not sure about this one' });
  });

  test('markInvalid logs the decision AND releases the task via two calls, in order', async () => {
    const supabase = createMockSupabase({
      rpcImpl: (fn) =>
        fn === 'log_review_note' ? { data: { id: 1 }, error: null } : { data: { id: 'task-1', status: 'unclaimed' }, error: null },
    });
    const client = createReviewClient(supabase);
    await client.markInvalid('task-1', 'duplicate of another record');

    assert.equal(supabase._calls.rpc.length, 2);
    assert.equal(supabase._calls.rpc[0].fnName, 'log_review_note');
    assert.equal(supabase._calls.rpc[0].params.p_decision, 'invalid');
    assert.equal(supabase._calls.rpc[0].params.p_task_id, 'task-1');
    assert.equal(supabase._calls.rpc[1].fnName, 'skip_review_task');
    assert.equal(supabase._calls.rpc[1].params.p_task_id, 'task-1');
  });

  test('markInvalid stops before releasing the task if logging the note itself fails', async () => {
    const supabase = createMockSupabase({
      rpcImpl: (fn) => (fn === 'log_review_note' ? { data: null, error: postgrestError('42501') } : { data: {}, error: null }),
    });
    const client = createReviewClient(supabase);
    await assert.rejects(() => client.markInvalid('task-1', null));
    assert.equal(supabase._calls.rpc.length, 1, 'skip_review_task must not run if log_review_note failed');
  });
});
