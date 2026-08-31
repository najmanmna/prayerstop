// Copy this file to config.js (gitignored) and fill in your real Supabase
// project values — find both under Project Settings → API in the Supabase
// dashboard. The anon key is safe to ship in client-side code by design
// (it's the public key RLS is specifically built to make safe to expose —
// every request made with it is still fully subject to the RLS policies in
// mosque-db-pipeline/supabase/migrations/0002_rls_policies.sql); never put
// the service_role key in this file or anywhere in this app.
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
