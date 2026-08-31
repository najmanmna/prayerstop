#!/bin/bash
# Proves two simultaneous reviewers cannot claim the same mosque's task.
#
# This needs real OS-level concurrency (two separate database connections
# racing for the same row) — a single .sql script run by one psql process
# can't produce a genuine race, so this is a shell test orchestrating two
# real, overlapping psql sessions.
#
# Session A claims the task, then holds its transaction open (pg_sleep)
# *before* committing — forcing Session B's UPDATE (inside the same
# claim_review_task call) to block on A's row lock and only proceed once A
# commits, at which point B's `where status = 'unclaimed'` no longer
# matches (A already flipped it to 'claimed'). This is the real mechanism
# under test, not just "ran twice, second one lost" — see 0003_functions.sql
# for the full explanation of why this is safe.
set -uo pipefail
# (deliberately no -e: one of the two racing sessions is EXPECTED to exit
# non-zero — psql exits non-zero when claim_review_task raises — and that
# expected failure must not abort this script)
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
DB="prayerstop_mosque_test"
REVIEWER_A="11111111-1111-4111-8111-111111111111"
REVIEWER_B="22222222-2222-4222-8222-222222222222"

TASK_ID=$(psql -d "$DB" -t -A -c "select id from public.review_tasks where status = 'unclaimed' limit 1;")
if [ -z "$TASK_ID" ]; then
  echo "FAIL: no unclaimed task available to race for"
  exit 1
fi
echo "Racing for task: $TASK_ID"

OUT_A=$(mktemp)
OUT_B=$(mktemp)

# Session A: claims, then holds the transaction open for 2s before committing.
psql -d "$DB" -v ON_ERROR_STOP=1 > "$OUT_A" 2>&1 <<SQL &
begin;
set local role authenticated;
select test.login('$REVIEWER_A'::uuid);
select status, assigned_reviewer_id from public.claim_review_task('$TASK_ID'::uuid);
select pg_sleep(2);
commit;
SQL
PID_A=$!

# Session B: starts ~0.3s later, well inside A's still-open transaction —
# its claim attempt WILL block on A's row lock, exactly what's under test.
sleep 0.3
psql -d "$DB" -v ON_ERROR_STOP=1 > "$OUT_B" 2>&1 <<SQL &
begin;
set local role authenticated;
select test.login('$REVIEWER_B'::uuid);
select status, assigned_reviewer_id from public.claim_review_task('$TASK_ID'::uuid);
commit;
SQL
PID_B=$!

wait "$PID_A"; EXIT_A=$?
wait "$PID_B"; EXIT_B=$?

echo "--- Session A (reviewer A) ---"; cat "$OUT_A"
echo "--- Session B (reviewer B) ---"; cat "$OUT_B"

A_SUCCEEDED=0; B_SUCCEEDED=0
[ "$EXIT_A" -eq 0 ] && grep -q "claimed" "$OUT_A" && A_SUCCEEDED=1
[ "$EXIT_B" -eq 0 ] && grep -q "claimed" "$OUT_B" && B_SUCCEEDED=1

FINAL_STATE=$(psql -d "$DB" -t -A -c "select status || ' ' || assigned_reviewer_id from public.review_tasks where id = '$TASK_ID';")
echo "Final task state: $FINAL_STATE"

rm -f "$OUT_A" "$OUT_B"

TOTAL_SUCCESSES=$((A_SUCCEEDED + B_SUCCEEDED))
if [ "$TOTAL_SUCCESSES" -eq 1 ]; then
  echo "PASS: exactly one of the two simultaneous claims succeeded."
  exit 0
else
  echo "FAIL: expected exactly 1 successful claim, got $TOTAL_SUCCESSES"
  exit 1
fi
