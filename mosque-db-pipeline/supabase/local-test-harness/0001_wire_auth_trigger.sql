-- LOCAL TEST HARNESS ONLY. On a real Supabase project this same trigger
-- creation line is the one piece of "wiring" you run once, manually, after
-- 0003_functions.sql (Supabase does not let migrations touch auth.* via
-- the CLI's normal migration path in all setups, so this is typically run
-- once by hand in the SQL editor) — reproduced here verbatim so the local
-- test exercises the exact same trigger a real project would have.
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
