-- Test fixtures: two ordinary reviewers, on top of the one migrated admin
-- already imported by migrate_data.sql. Run once before the numbered test
-- files (which assume these three identities exist).
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'reviewer-a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'reviewer-b@test.local')
on conflict (id) do nothing;

insert into public.reviewers (id, display_name, role) values
  ('11111111-1111-4111-8111-111111111111', 'Reviewer A', 'reviewer'),
  ('22222222-2222-4222-8222-222222222222', 'Reviewer B', 'reviewer')
on conflict (id) do nothing;
