# Promote & Lead Solutions — site

Static HTML + Cloudflare Pages Functions (no separate server needed), with Supabase and Resend
behind the API routes.

## Production design and teaching guide

The approved crisp-peaks homepage and light classroom theme are active at `/` and `/classroom`. Existing email sign-in, funding, worksheets, attendance and certificate workflows remain in place. Instructor accounts open Cohort overview first; the Teaching guide serves the 87 reading/example/discussion sections and coaching notes through the authenticated `/api/classroom/teaching` endpoint.

Teaching progress is stored in Supabase per instructor and cohort, with revision checks to prevent stale devices overwriting newer progress. Apply `migrations/20260914-teaching-progress.sql` before deploying the endpoint. Row-level security is enabled; only the server service role accesses this table. Students cannot retrieve instructor materials. The old `/proposal/*` routes return 404 in production; the separate local Python preview remains a design reference.

Validation commands: `node tests/classroom.e2e.mjs`, `node tests/teaching.e2e.mjs`, and `node tests/teaching-ui.mjs`. The last command exercises the UI logic with a DOM stub, not a visual browser.

## Files

```
index.html                 ← the marketing site (self-contained: HTML/CSS/JS)
admin/                     ← admin CRM — see ADMIN-SETUP.md (Cloudflare Access protected)
classroom/                 ← student classroom — see CLASSROOM-SETUP.md (email one-time code)
functions/api/subscribe.js ← Pages Function: handles POST /api/subscribe
tests/classroom.e2e.mjs    ← classroom end-to-end suite: `node tests/classroom.e2e.mjs`
.gitignore
```

## Guides

- **ADMIN-SETUP.md** — the `/admin` CRM: Supabase, Cloudflare Access, secrets
- **CLASSROOM-SETUP.md** — the `/classroom` student experience: schema, secrets, running a cohort
- **REUSABLE-EMAIL-FEATURE.md** — the branded Resend email sender, as a drop-in feature

## How signups work

The form POSTs to `/api/subscribe`. The Pages Function validates the email and,
if a KV namespace named `WAITLIST` is bound, stores it. **Until you bind KV, the
form still works** — it just won't persist (the function returns OK without storing).

---

## Deploy: GitHub → Cloudflare Pages

### 1. Push this folder to a new GitHub repo
From VS Code (or terminal):

```bash
git init
git add .
git commit -m "Initial coming-soon splash"
git branch -M main
git remote add origin https://github.com/<you>/promoteandlead-splash.git
git push -u origin main
```

### 2. Connect it in Cloudflare
- Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
- Authorize GitHub, pick `promoteandlead-splash`
- Build settings:
  - **Framework preset:** None
  - **Build command:** *(leave blank)*
  - **Build output directory:** `/`
- **Save and Deploy**

### 3. (Optional) Enable email storage with KV
- Cloudflare → **Workers & Pages** → **KV** → **Create namespace** → name it `WAITLIST`
- Go to your Pages project → **Settings** → **Functions** → **KV namespace bindings**
- Add binding: **Variable name** `WAITLIST` → select the `WAITLIST` namespace
- Redeploy (or push a commit) so the binding takes effect
- View signups under the KV namespace, or export via `wrangler kv:key list`

### 4. Add your custom domain
- Pages project → **Custom domains** → **Set up a domain**
- Enter `promoteandlead.com` (or `www.` / a subdomain)
- Cloudflare auto-creates the DNS record since the domain is already on your account

---

## Local preview (optional)

Plain file — just open `index.html` in a browser. To test the function locally:

```bash
npm install -g wrangler
wrangler pages dev .
```

## Customize
- Colors: edit the CSS variables at the top of `index.html` (`--hot`, `--tangerine`, etc.)
- Copy: the `<h1>`, `.sub`, and `.badge` text
- Fonts: swap the Clash Display / General Sans links in `<head>`
