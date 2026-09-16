-- =============================================================================
-- Step 7F fix — duplicate_candidates.redundant_mosque_id must not cascade
-- =============================================================================
-- Found via live testing (real browser session against the real project),
-- not by the local SQL suite: decide_duplicate_candidate()'s delete branch
-- (confirming a candidate whose redundant side has no review history)
-- deletes the redundant mosque_records row — and because
-- redundant_mosque_id was declared `references mosque_records(id) on
-- delete cascade`, that delete cascaded straight through to the
-- duplicate_candidates row itself, destroying the very "who confirmed
-- this, when, with what note" audit record the table exists to keep.
-- survivor_mosque_id is left as-is (cascade is fine there — this workflow
-- never deletes the survivor).
--
-- Dropped the foreign key entirely rather than re-adding it without
-- cascade: with the FK still enforced (default NO ACTION), the delete in
-- decide_duplicate_candidate() would instead fail outright with a
-- foreign-key-violation the moment any duplicate_candidates row still
-- pointed at it — which is every confirmed row, since confirming is what
-- triggers the delete. redundant_mosque_id becomes a plain historical
-- pointer once a decision is made; it no longer needs live referential
-- integrity after that point.
-- =============================================================================

alter table public.duplicate_candidates
  drop constraint duplicate_candidates_redundant_mosque_id_fkey;

comment on column public.duplicate_candidates.redundant_mosque_id is
  'The record proposed as a duplicate. No foreign key on purpose: confirming a candidate can delete this row from mosque_records (see decide_duplicate_candidate), and this column must keep its historical value — a value naming a now-nonexistent id is confirmed history, not corrupted data.';
