# Promote & Lead — Coming Soon Splash

A bold, single-page "coming soon" splash with email waitlist capture.
Static HTML + a Cloudflare Pages Function backend (no separate server needed).

## Files

```
index.html                 ← the splash page (self-contained: HTML/CSS/JS)
functions/api/subscribe.js ← Pages Function: handles POST /api/subscribe
.gitignore
```

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
