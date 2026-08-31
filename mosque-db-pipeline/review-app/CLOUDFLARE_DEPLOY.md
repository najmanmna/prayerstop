# Deploying to Cloudflare Pages (direct upload)

This app is plain static files with no build step — direct upload is a
straight copy of the 5 files below plus one you create yourself.

## 1. Files to upload — nothing else

```
index.html
app.js
data.js
coord-utils.js
style.css
config.js      ← you create this (see step 2), never comes from git
```

Do **not** upload: `config.example.js`, `.gitignore`, `.assetsignore`,
`package.json`, `README.md`, this file, or the `tests/` folder — none of
it is needed by the running site, and `tests/` in particular contains
disposable test credentials that have no reason to be public. If you drag
a copy of the whole `review-app/` folder into the dashboard, delete those
first, or use the "Wrangler CLI" method below instead, which excludes them
automatically via `.assetsignore`.

## 2. Create `config.js`

```bash
cd mosque-db-pipeline/review-app
cp config.example.js config.js
```

Fill in your real project's values from **Supabase Dashboard → Project
Settings → API**:

```js
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-PUBLISHABLE-OR-ANON-KEY';
```

This file is safe to upload as-is: the anon/publishable key is the public
key Supabase RLS is specifically designed to make safe to expose — every
request made with it is still fully governed by the RLS policies in
`mosque-db-pipeline/supabase/migrations/0002_rls_policies.sql`. **Never**
put the `service_role` key here or anywhere in this app — it bypasses RLS
entirely and belongs only in a trusted server context, which this static
site is not.

## 3. Upload

**Dashboard (simplest, ≤1,000 files — this app is 6):**
Cloudflare dashboard → Workers & Pages → Create application → Pages →
Upload assets → drag in the 6 files from step 1 (or a zip containing just
them) → deploy.

**Wrangler CLI (repeatable, respects `.assetsignore` automatically):**
```bash
npx wrangler pages deploy mosque-db-pipeline/review-app --project-name=prayerstop-mosque-review
```
`.assetsignore` in this folder already excludes everything from step 1's
"do not upload" list, so a plain folder deploy is safe with this method
even without hand-picking files.

## 4. One-time Supabase dashboard step

The app itself needs no Supabase configuration change — Auth and RLS work
identically from any origin (verified live against this exact project from
a non-Supabase origin throughout development). The one thing worth setting
once you have your real `*.pages.dev` URL (or custom domain): **Supabase
Dashboard → Authentication → URL Configuration → Site URL** — update it
to your deployed URL so a password-reset email's link points at the right
place. Not required for plain email/password sign-in itself to work.

## 5. Post-deploy smoke test

- Load the deployed URL — should show the sign-in screen, no console errors.
- Sign in with a real reviewer account — should claim/show a task.
- Open browser devtools → Network — confirm no request ever goes to
  `localhost`/`127.0.0.1`, and no request or response body ever contains
  the string `service_role`.

## Pre-flight checklist (already verified for this app as of this write-up)

- [x] `config.js` is gitignored, never committed, and excluded from both
      the manual file list above and `.assetsignore`.
- [x] Only `SUPABASE_URL` and the publishable/anon key are used client-side
      — grepped across every shipped `.js`/`.html`/`.css` file, no match
      for `service_role` outside of a comment warning never to add one.
- [x] No `localhost`/`127.0.0.1` reference anywhere in shipped files.
- [x] No hardcoded test/dev account credentials or debug UI in shipped
      files — all test accounts and mock scaffolding live only under
      `tests/`, which is excluded from every deploy path above.
- [x] All script/style dependencies load over HTTPS from public CDNs
      (jsdelivr for `supabase-js`, pinned to an exact version; unpkg for
      Leaflet, already pinned) — nothing assumes a same-origin server or a
      build step, so it works unmodified from any static HTTPS host.
