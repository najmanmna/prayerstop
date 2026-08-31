#!/bin/bash
# Rebuilds the local test database from a clean slate and runs the full
# Step 7A test suite in order. This is the local-Postgres stand-in for what
# `supabase db reset && supabase test db` would do against a real Supabase
# local dev stack (see supabase/local-test-harness/README.md for why that
# path isn't available in this environment, and exactly what's simulated
# vs. real).
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
cd "$(dirname "$0")/.."
DB="prayerstop_mosque_test"

echo "=== Rebuilding $DB from scratch ==="
dropdb --if-exists "$DB"
createdb "$DB"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f local-test-harness/0000_auth_stub.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f migrations/0001_mosque_schema.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f migrations/0002_rls_policies.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f migrations/0003_functions.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f migrations/0004_claim_next_task.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f migrations/0005_admin_correct_task.sql
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f local-test-harness/0001_wire_auth_trigger.sql
psql -d "$DB" -c "grant authenticated to $(whoami); grant anon to $(whoami); grant service_role to $(whoami);" -q

echo "=== Importing master-dataset.json + review-log.jsonl ==="
python3 scripts/migrate_to_supabase.py
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f output/migrate_data.sql

echo ""
echo "=== Baseline counts immediately after import (before any test runs) ==="
psql -d "$DB" -c "
select 'mosque_records' as tbl, count(*) from public.mosque_records
union all select 'review_tasks (total)', count(*) from public.review_tasks
union all select 'review_tasks (completed)', count(*) from public.review_tasks where status='completed'
union all select 'review_tasks (unclaimed)', count(*) from public.review_tasks where status='unclaimed'
union all select 'review_decisions', count(*) from public.review_decisions
union all select 'mosque_records (verified)', count(*) from public.mosque_records where verification_status='verified';
"

echo "=== Loading test fixtures (2 additional reviewers) ==="
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f tests/00_fixtures.sql

FAILED=0
run_sql_test() {
  local name="$1" file="$2"
  local out
  echo ""
  echo "--- $name ---"
  if out=$(psql -d "$DB" -v ON_ERROR_STOP=1 -f "$file" 2>&1); then
    echo "$out" | grep -E "NOTICE|ERROR" || true
  else
    echo "$out"
    echo "*** $name: FAILED ***"
    FAILED=1
  fi
}

echo ""
echo "--- Test 01: two reviewers cannot claim the same mosque (real concurrency) ---"
if ! bash tests/01_claim_concurrency.sh; then
  echo "*** Test 01: FAILED ***"
  FAILED=1
fi

run_sql_test "Test 02: only the assigned reviewer can complete a task" tests/02_complete_only_by_assigned.sql
run_sql_test "Test 03: completed tasks cannot be reclaimed" tests/03_completed_cannot_be_reclaimed.sql
run_sql_test "Test 04: reviewers cannot read other reviewers' private data" tests/04_reviewer_privacy.sql
run_sql_test "Test 05: admins can access all review data" tests/05_admin_full_access.sql
run_sql_test "Test 06: existing human-reviewed records remain completed" tests/06_migration_integrity.sql

echo ""
echo "--- Test 07: claim_next_review_task() concurrency (Step 7B) ---"
if ! bash tests/07_claim_next_concurrency.sh; then
  echo "*** Test 07: FAILED ***"
  FAILED=1
fi

run_sql_test "Test 08: admin_correct_mosque_task() (Step 7D)" tests/08_admin_correct_task.sql

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "================================================"
  echo "ALL TESTS PASSED"
  echo "================================================"
else
  echo "================================================"
  echo "SOME TESTS FAILED — see output above"
  echo "================================================"
  exit 1
fi
