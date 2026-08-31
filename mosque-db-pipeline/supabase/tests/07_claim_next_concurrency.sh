#!/bin/bash
# Proves claim_next_review_task() — the web app's "Next mosque" button —
# is safe under real concurrency: two reviewers calling it at the same
# moment (neither knows a specific task id in advance, unlike
# claim_review_task(uuid)) must each get a task, and never the same one.
# Uses `for update skip locked` (see migrations/0004) rather than the
# `where status='unclaimed'` pattern claim_review_task(uuid) relies on,
# since here there's no id to put in a WHERE clause up front — the
# function has to pick a row under contention, not just update one it
# already knows.
set -uo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
DB="prayerstop_mosque_test"
REVIEWER_A="11111111-1111-4111-8111-111111111111"
REVIEWER_B="22222222-2222-4222-8222-222222222222"

UNCLAIMED_BEFORE=$(psql -d "$DB" -t -A -c "select count(*) from public.review_tasks where status = 'unclaimed';")
echo "Unclaimed tasks available before the race: $UNCLAIMED_BEFORE"
if [ "$UNCLAIMED_BEFORE" -lt 2 ]; then
  echo "FAIL: need at least 2 unclaimed tasks to prove they land on different rows"
  exit 1
fi

OUT_A=$(mktemp)
OUT_B=$(mktemp)

# Both sessions call claim_next_review_task() and then hold their
# transaction open briefly before committing, so both calls are genuinely
# in flight at the same time — not "A finishes, then B starts".
psql -d "$DB" -v ON_ERROR_STOP=1 > "$OUT_A" 2>&1 <<SQL &
begin;
set local role authenticated;
select test.login('$REVIEWER_A'::uuid);
select (public.claim_next_review_task()).id as claimed_id;
select pg_sleep(1);
commit;
SQL
PID_A=$!

psql -d "$DB" -v ON_ERROR_STOP=1 > "$OUT_B" 2>&1 <<SQL &
begin;
set local role authenticated;
select test.login('$REVIEWER_B'::uuid);
select (public.claim_next_review_task()).id as claimed_id;
select pg_sleep(1);
commit;
SQL
PID_B=$!

wait "$PID_A"; EXIT_A=$?
wait "$PID_B"; EXIT_B=$?

echo "--- Session A (reviewer A) ---"; cat "$OUT_A"
echo "--- Session B (reviewer B) ---"; cat "$OUT_B"

CLAIMED_A=$(grep -A2 "claimed_id" "$OUT_A" | tail -1 | tr -d ' ')
CLAIMED_B=$(grep -A2 "claimed_id" "$OUT_B" | tail -1 | tr -d ' ')
rm -f "$OUT_A" "$OUT_B"

echo "Reviewer A claimed: $CLAIMED_A"
echo "Reviewer B claimed: $CLAIMED_B"

if [ "$EXIT_A" -ne 0 ] || [ "$EXIT_B" -ne 0 ]; then
  echo "FAIL: at least one session errored — both should succeed (queue had $UNCLAIMED_BEFORE >= 2 tasks)"
  exit 1
fi
if [ -z "$CLAIMED_A" ] || [ "$CLAIMED_A" = "" ]; then
  echo "FAIL: reviewer A got no task despite an available queue"
  exit 1
fi
if [ -z "$CLAIMED_B" ] || [ "$CLAIMED_B" = "" ]; then
  echo "FAIL: reviewer B got no task despite an available queue"
  exit 1
fi
if [ "$CLAIMED_A" = "$CLAIMED_B" ]; then
  echo "FAIL: both reviewers were given the SAME task ($CLAIMED_A)"
  exit 1
fi

echo "PASS: two simultaneous claim_next_review_task() calls each succeeded with two DIFFERENT tasks."
exit 0
