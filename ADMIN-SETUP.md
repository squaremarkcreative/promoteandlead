# Admin CRM — Setup Guide

The `/admin` dashboard is a full CRM: mailing list, contact leads, cohorts (6 slots each),
visitor stats (top states / referrers / cities), and a bulk email composer. It runs on
Cloudflare Pages Functions + your Supabase + Resend, and is protected by Cloudflare Access.

There are **three things to configure**: Supabase, Cloudflare Access, and the env vars/secrets.

---

## 1. Supabase (data store)

1. In your Supabase project → **SQL Editor → New query** → paste all of `supabase-schema.sql` → **Run**.
2. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ server-side only, never in the browser)

Add both to `.dev.vars` (already stubbed) for local testing.

---

## 2. Test locally (fastest way to see it working)

`.dev.vars` already has `ADMIN_DEV_BYPASS=true`, which skips the Access check **locally only**.

```bash
npx wrangler pages dev . --compatibility-date=2025-06-01 --port 8788
```

Open **http://localhost:8788/admin** — you should see the dashboard. Sign-ups, contact
submissions, and visits will start flowing into Supabase.

---

## 3. Cloudflare Access (protects /admin in production)

1. Cloudflare dashboard → **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. **Application domains** — add BOTH paths so the page and its API are protected:
   - `preview.promoteandlead.com/admin` and `preview.promoteandlead.com/api/admin`
   - (later, for live) `promoteandlead.com/admin` and `promoteandlead.com/api/admin`
3. **Policy**: Action = Allow, Include = **Emails** → your email(s) (e.g. `tommy@promoteandlead.com`).
   Choose a login method (One-time PIN by email works with no extra setup).
4. After creating it, open the application → copy:
   - **Application Audience (AUD) tag** → `ACCESS_AUD`
   - Your team domain (e.g. `https://squaremark.cloudflareaccess.com`) → `ACCESS_TEAM_DOMAIN`

The API verifies this JWT on every request, so hitting the `*.pages.dev` URL directly can't bypass it.

---

## 4. Set the production / preview secrets

Set these on the Pages project (`RESEND_API_KEY`, `NOTIFY_FROM`, `NOTIFY_TO` are already set):

```bash
# preview project
printf '%s' "<value>" | npx wrangler pages secret put SUPABASE_URL              --project-name=promoteandlead-preview
printf '%s' "<value>" | npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name=promoteandlead-preview
printf '%s' "<value>" | npx wrangler pages secret put ACCESS_TEAM_DOMAIN        --project-name=promoteandlead-preview
printf '%s' "<value>" | npx wrangler pages secret put ACCESS_AUD               --project-name=promoteandlead-preview
```

Do **not** set `ADMIN_DEV_BYPASS` in production — it only belongs in `.dev.vars`.

Redeploy after setting secrets so the Functions pick them up.

---

## 5. Going live (later)

Repeat steps 3–4 for the production `promoteandlead` project and the `promoteandlead.com` domain,
then push to `main` (the production project is Git-connected).

---

## Notes

- **Visitor stats** come from a tiny beacon on the site; Cloudflare tags each request with
  country/state/city (no precise location). Stats populate as real traffic arrives.
- **Bulk email** sends from your verified domain via Resend, one message per recipient, each with
  a required unsubscribe link. Unsubscribed contacts are auto-skipped (CAN-SPAM compliant).
- **Security**: the `service_role` key and Resend key live only in server-side secrets. The browser
  never talks to Supabase. `/api/admin/*` is unusable without a valid Access JWT.
