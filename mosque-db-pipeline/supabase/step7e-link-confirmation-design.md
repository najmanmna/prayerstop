# Step 7E (design only) — NSDI↔DMRCA link confirmation for the 40 high-confidence candidates

Not applied to the live database. This is the proposal from
`mosque-db-pipeline/report/reviewed-dmrca-overlap-candidates.json`'s 40
`high`-tier rows only — the 18 `medium` and 58 `low`/contested rows are
**not** included in anything below; they stay purely in the report file
until a separate decision is made about them.

## What's actually being confirmed

Verified directly against the live database (not assumed): each of these
40 candidates is currently **two separate rows** in `mosque_records` —
e.g. `nsdi-18469` ("Wekanda Jumma Mosque", human-reviewed, real
coordinates, `verification_status='verified'`) and `dmrca-R-259-C-30`
("WEKANDA JUMMA MOSQUE", `verification_status='unverified'`, no
coordinates — DMRCA has none). None of the 40 standalone DMRCA rows has
ever had a `review_task` created for it (checked: 0 of 40), so confirming
a link can't collide with anything already in flight for this specific
batch.

"Confirm" means: merge the DMRCA row's data into the already-verified
NSDI row (never the reverse — the NSDI row's human-entered name/address/
coordinates are never overwritten, only filled in where blank), then
retire the now-redundant standalone DMRCA row. "Reject" means: record
that a human looked at it and said no, touch nothing else.

## Reviewer experience — deliberately not the existing review screen

A new, much smaller screen. No map, no coordinate input, no name/address
editing — everything on it is read-only except two buttons, because the
whole point is that coordinate verification already happened:

```
┌─────────────────────────────────────────────┐
│  Already verified (yours or another reviewer's work) │
│  Wekanda Jumma Mosque                        │
│  19 Wekanda Jumma Masjid Road, Colombo 00200 │
│  6.9222, 79.8517                             │
├─────────────────────────────────────────────┤
│  Proposed DMRCA match — 100% name match       │
│  R/259/C.30 — WEKANDA JUMMA MOSQUE           │
│  21, Wekanda Jumma Masjid Mawatha, Colombo-02│
│  [View source PDF ↗]                         │
├─────────────────────────────────────────────┤
│  Same mosque?                                │
│  [ ✅  Yes, link it ]   [ ❌  No, different ]  │
│  (optional note, shown for either answer)    │
└─────────────────────────────────────────────┘
                                    "12 of 40 confirmed"
```

One click per record. Auto-advances to the next pending one on either
answer, same "claim next → decide → advance" rhythm as the existing app,
so reviewers don't need to learn a new interaction pattern, just a
much lighter one.

## Data model — a new, separate table, not review_tasks/review_decisions

Deliberately **not** built on `review_tasks`/`review_decisions`: this is
a different kind of decision (a link, not a coordinate correction), and
routing it through the existing claim machinery would mean either
inventing a new `priority_tier` value the whole review-app has to know
to render differently, or risking a bug that lets a link-confirmation
task get treated as a normal coordinate task. A dedicated table keeps the
two workflows structurally incapable of interfering with each other, and
IS itself the full audit trail for this action (no need to force an
awkward fit into `review_decisions`, which requires a `task_id` this
workflow has no reason to have).

```sql
create table public.dmrca_link_candidates (
  id uuid primary key default gen_random_uuid(),
  mosque_id text not null references public.mosque_records(id) on delete cascade,      -- the verified nsdi-* row
  candidate_dmrca_id text not null references public.mosque_records(id) on delete cascade, -- the standalone dmrca-* row
  match_score numeric not null,
  match_tier text not null check (match_tier in ('high', 'medium', 'low')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  decided_by uuid references public.reviewers(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  unique (mosque_id, candidate_dmrca_id)
);

alter table public.dmrca_link_candidates enable row level security;
revoke all on public.dmrca_link_candidates from anon, authenticated;
grant select on public.dmrca_link_candidates to authenticated;

create policy "authenticated users can view pending link candidates"
on public.dmrca_link_candidates for select to authenticated
using (status = 'pending');

create policy "reviewers can view candidates they decided"
on public.dmrca_link_candidates for select to authenticated
using (decided_by = (select auth.uid()));

create policy "admins can view all link candidates"
on public.dmrca_link_candidates for select to authenticated
using (private.is_admin());
```

Seeded once, from the existing report — only the 40 `high` rows:

```sql
insert into public.dmrca_link_candidates (mosque_id, candidate_dmrca_id, match_score, match_tier)
values
  ('nsdi-22458', 'dmrca-R-0278-AM-01', 100.0, 'high'),
  ('nsdi-18469', 'dmrca-R-259-C-30',   100.0, 'high'),
  -- ... all 40, generated directly from report/reviewed-dmrca-overlap-candidates.json
;
```

## Two functions — same shape as the existing claim/complete pair

```sql
-- Peek at the next undecided candidate, highest score first. Read-only —
-- no row lock, no "claimed" state, since a single button-click decision
-- has no abandon-partway-through risk worth a claim step for a 40-row batch.
create or replace function public.claim_next_link_candidate()
returns public.dmrca_link_candidates
language sql security definer set search_path = '' stable
as $$
  select * from public.dmrca_link_candidates
  where status = 'pending'
  order by match_score desc, created_at
  limit 1;
$$;

-- The one state-changing action. Atomic: the UPDATE's own WHERE clause
-- (status = 'pending') is the whole concurrency guarantee, identical
-- pattern to claim_review_task — a second reviewer's decide on an
-- already-decided candidate affects zero rows and gets a clear error.
create or replace function public.decide_link_candidate(p_id uuid, p_decision text, p_note text default null)
returns public.dmrca_link_candidates
language plpgsql security definer set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_row public.dmrca_link_candidates;
  v_nsdi public.mosque_records;
  v_dmrca public.mosque_records;
  v_dmrca_source jsonb;
begin
  if v_caller is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.reviewers where id = v_caller) then
    raise exception 'caller is not a registered reviewer' using errcode = '42501';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'decide_link_candidate only accepts confirmed/rejected (got %)', p_decision using errcode = '22023';
  end if;

  update public.dmrca_link_candidates
  set status = p_decision, decided_by = v_caller, decided_at = now(), decision_note = p_note
  where id = p_id and status = 'pending'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'candidate % already decided by someone else' , p_id using errcode = 'P0002';
  end if;

  if p_decision = 'confirmed' then
    select * into v_nsdi from public.mosque_records where id = v_row.mosque_id for update;
    select * into v_dmrca from public.mosque_records where id = v_row.candidate_dmrca_id for update;
    select s into v_dmrca_source from jsonb_array_elements(v_dmrca.sources) s where s ->> 'type' = 'dmrca' limit 1;

    -- Never overwrites anything the human reviewer already entered —
    -- only fills gaps (address) or adds provenance (sources, reg no).
    update public.mosque_records
    set sources = v_nsdi.sources || jsonb_build_array(v_dmrca_source),
        dmrca_registration_no = coalesce(v_nsdi.dmrca_registration_no, v_dmrca.dmrca_registration_no),
        address = coalesce(v_nsdi.address, v_dmrca.address)
    where id = v_row.mosque_id;

    -- Safe to remove outright: verified via live query that none of these
    -- 40 standalone rows has ever had a review_task (no FK, no history to
    -- lose) — its one source object is preserved inside v_nsdi.sources above.
    delete from public.mosque_records where id = v_row.candidate_dmrca_id;
  end if;

  return v_row;
end;
$$;

grant execute on function public.claim_next_link_candidate() to authenticated;
grant execute on function public.decide_link_candidate(uuid, text, text) to authenticated;
```

## Verified against a real example before writing this

`nsdi-18469` / `dmrca-R-259-C-30`: NSDI side has a real reviewer-entered
address ("19 Wekanda Jumma Masjid Road, Colombo 00200") that **differs**
from DMRCA's own address ("21, Wekanda Jumma Masjid Mawatha") — both
plausibly the same building described two ways. This is exactly why the
merge uses `coalesce(nsdi.address, dmrca.address)` (fill blanks only) and
never overwrites — confirmed by checking a live row, not assumed.

## What stays separate

The 18 `medium` and 58 `low`/contested candidates are not in the seed
insert above at all — they don't exist in `dmrca_link_candidates` yet, so
there's nothing to accidentally surface in this queue. A future,
separate decision can add them (likely wanting the full name/address/
map view restored for `medium`, and probably a "pick which one" UI for
the contested `low` cluster cases, given multiple candidates can tie for
the same NSDI point).

## Not yet done (all require your go-ahead)

1. Apply this as `supabase/migrations/0007_dmrca_link_candidates.sql` to
   the real project.
2. Generate and run the 40-row seed insert from the report JSON.
3. Build the new screen in `review-app/` (`data.js`: `getNextLinkCandidate`,
   `decideLinkCandidate`; `app.js`: the read-only confirm/reject screen
   above).
4. Live-verify against the real project the same way every prior step
   was — including that rejecting a candidate truly changes nothing.
