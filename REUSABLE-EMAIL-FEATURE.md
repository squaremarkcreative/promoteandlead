# Reusable: "Email from Admin via Resend"

A drop-in feature that lets an admin **compose and send branded emails** to a mailing list
or a segment, **from your own domain**, with:

- A **branded HTML template** (logo, colors, footer) that renders well in Gmail/Outlook/Apple Mail
- A **confirmation copy to yourself** on every send
- A required **one-click unsubscribe** link (CAN-SPAM compliant)
- A **monthly send counter** and a **big-send warning** so you don't blow provider limits
- Individually-addressed sends (no shared To/CC — protects the list and improves deliverability)

It was built on **Cloudflare Pages Functions + Supabase (PostgREST) + Resend + a vanilla-JS admin**,
but the shape ports to any stack (Node/Next/Workers). Swap the DB calls and the handler wrapper.

---

## 1. Resend setup (once)

1. Create an account at **resend.com** and add your **API key** (`re_...`).
2. **Verify your sending domain** (Domains → Add) by adding the ~3 DNS records it shows
   (SPF `TXT`, DKIM, return-path). Until verified, Resend only delivers to your own account email.
3. Pick a sender on that domain, e.g. `noreply@yourdomain.com`.

**Free tier:** ~3,000 emails/month, ~100/day, 1 domain. Every recipient + the self-copy counts.
Pro (~$20/mo) lifts this to ~50,000/mo. Confirm current numbers at resend.com/pricing.

## 2. Environment variables / secrets

```
RESEND_API_KEY=re_xxx
NOTIFY_FROM=Your Company <noreply@yourdomain.com>   # verified sender
NOTIFY_TO=you@yourdomain.com                          # where the self-copy goes
```

Set locally in `.dev.vars` and in production as project secrets
(`wrangler pages secret put NAME --project-name=...`). Never ship these to the browser.

## 3. Database (two tables)

You need a **recipients** table and a **campaigns log** (for the monthly counter).

```sql
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  unsubscribed boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text, body text, audience text,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);
```

## 4. Backend — the send handler

Server-side only. Resolves recipients, sends via Resend's **batch** endpoint (≤100/call),
mails a self-copy, logs the campaign. `escapeHtml` and `brandedEmail` are below.

```js
async function sendCampaign(env, db, data, origin) {
  if (!env.RESEND_API_KEY) return json({ error: "Email isn't configured." }, 503);
  const subject = (data.subject || "").trim();
  const message = (data.message || "").trim();
  if (!subject || !message) return json({ error: "Subject and message are required." }, 400);

  // Resolve recipients (adapt to your data layer)
  let recipients = [];
  if (data.audience === "list") {
    const subs = await db.select("subscribers", "select=email&unsubscribed=eq.false");
    recipients = subs.map((s) => s.email);
  } else if (Array.isArray(data.emails)) {
    recipients = data.emails;
  }
  recipients = [...new Set(recipients.filter(Boolean).map((e) => e.toLowerCase()))];
  if (!recipients.length) return json({ error: "No recipients found." }, 400);

  const from = env.NOTIFY_FROM;
  const owner = env.NOTIFY_TO;
  const messageHtml = escapeHtml(message).replace(/\n/g, "<br>");

  let sent = 0;
  for (let i = 0; i < recipients.length; i += 90) {           // batch of ≤100
    const chunk = recipients.slice(i, i + 90);
    const emails = chunk.map((to) => {
      const unsub = `${origin}/api/unsubscribe?e=${encodeURIComponent(to)}`;
      return { from, to, reply_to: owner, subject,
        html: brandedEmail(messageHtml, unsub, null),
        text: `${message}\n\n---\nUnsubscribe: ${unsub}` };
    });
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(emails)
    });
    if (res.ok) sent += chunk.length;
  }

  // Self-copy / receipt
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: owner, reply_to: owner,
        subject: `✓ Sent to ${sent}: ${subject}`,
        html: brandedEmail(messageHtml, null, sent),
        text: `Sent to ${sent} recipient(s).\n\n${message}` })
    });
  } catch (e) {}

  try { await db.insert("campaigns", { subject, body: message, audience: data.audience || "custom", recipient_count: sent }); } catch (e) {}
  return json({ ok: true, sent });
}

function escapeHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// Branded, email-client-safe wrapper. receiptCount != null => self-copy (banner, no unsubscribe).
function brandedEmail(messageHtml, unsubUrl, receiptCount) {
  const isReceipt = receiptCount !== null && receiptCount !== undefined;
  const banner = isReceipt
    ? `<div style="background:#1F5E2A;color:#fff;padding:10px 14px;border-radius:8px;font-size:13px;margin:0 0 18px;font-family:Arial,sans-serif">This is your copy — sent to ${receiptCount} recipient(s).</div>` : "";
  const footer = isReceipt ? ""
    : `You're receiving this because you joined our list. <a href="${unsubUrl}" style="color:#999">Unsubscribe</a>.`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden">`
    + `<tr><td style="height:5px;background:#C8A415"></td></tr>`                                  /* accent bar — brand color */
    + `<tr><td align="center" style="padding:26px 24px 4px">`
    + `<img src="https://YOURDOMAIN.com/logo.png" width="54" alt="Company" style="display:block;margin:0 auto 10px">`  /* hosted logo URL */
    + `<div style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#0B2E6D">YOUR COMPANY</div>`
    + `</td></tr>`
    + `<tr><td style="padding:22px 32px 8px;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#222">${banner}${messageHtml}</td></tr>`
    + `<tr><td style="padding:16px 32px 26px"><hr style="border:none;border-top:1px solid #eee;margin:0 0 14px">`
    + `<div style="font-family:Arial,sans-serif;font-size:12px;color:#999;line-height:1.6">Your Company · <a href="https://YOURDOMAIN.com" style="color:#1F5E2A">yourdomain.com</a><br>${footer}</div>`
    + `</td></tr></table></td></tr></table></body></html>`;
}
```

## 5. Backend — unsubscribe endpoint (public GET `/api/unsubscribe?e=<email>`)

```js
export async function onRequest(context) {
  const { request, env } = context;
  const email = (new URL(request.url).searchParams.get("e") || "").toLowerCase().trim();
  const db = sb(env);
  let ok = false;
  if (db.enabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try { await db.patch("subscribers", `email=eq.${encodeURIComponent(email)}`, { unsubscribed: true }); ok = true; } catch (e) {}
  }
  const msg = ok ? "You've been unsubscribed." : "We couldn't process that. Email us to be removed.";
  return new Response(`<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;text-align:center;padding:3rem">${msg}</body>`,
    { headers: { "Content-Type": "text/html" } });
}
```

## 6. Admin UI — composer + safety features

**HTML** (inside your protected admin):
```html
<div id="emUsage"></div>
<select id="emAudience"></select>
<input id="emSubject" placeholder="Subject">
<textarea id="emBody" placeholder="Message (plain text; line breaks kept)"></textarea>
<button id="sendBtn" onclick="sendCampaign()">Send</button>
<span id="emMsg"></span>
```

**JS** — monthly counter + big-send warning + send:
```js
function monthEmails(){                                   // sum recipient_count for the current month
  var now=new Date(), y=now.getFullYear(), mo=now.getMonth(), t=0;
  (DATA.campaigns||[]).forEach(function(c){ var d=new Date(c.created_at);
    if(d.getFullYear()===y&&d.getMonth()===mo) t+=(c.recipient_count||0); });
  return t;
}
function renderUsage(){ document.getElementById("emUsage").innerHTML =
  "Sent this month: <b>"+monthEmails()+"</b> of 3,000 · free tier 100/day."; }

async function sendCampaign(){
  var audience=emAudience.value, subject=emSubject.value.trim(), message=emBody.value.trim();
  if(!subject||!message) return;
  var n = audience==="list" ? SUBS.filter(s=>!s.unsubscribed).length : 0;   // estimate recipients
  var warn = n>90 ? "\n\n⚠ "+n+" emails — free tier allows 100/day; a batch this big may not all send today." : "";
  if(!confirm("Send to "+n+" recipient(s), plus a copy to you?"+warn)) return;
  var res = await fetch("/api/admin/action",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"campaign.send",data:{audience,subject,message}})});
  var j = await res.json();
  document.getElementById("emMsg").textContent = res.ok ? ("Sent to "+j.sent+".") : (j.error||"Error");
}
```

The composer POSTs `{action:"campaign.send", data:{audience, subject, message}}` to your admin
action endpoint, which calls `sendCampaign(env, db, data, new URL(request.url).origin)`.

---

## Adapting to another project — checklist

- [ ] Resend account + **verified domain** + API key
- [ ] Set `RESEND_API_KEY`, `NOTIFY_FROM`, `NOTIFY_TO`
- [ ] Create `subscribers` + `campaigns` tables (rename to taste)
- [ ] Drop in the send handler, `brandedEmail`, `escapeHtml`, and the unsubscribe endpoint
- [ ] Point `brandedEmail` at your **hosted logo URL**, brand colors, company name, site
- [ ] Add the composer HTML/JS to your (auth-protected) admin
- [ ] Gate `/api/admin/*` behind real auth (Cloudflare Access, session, etc.)

## Gotchas

- **Verify the domain first** — otherwise Resend only delivers to your own account email.
- **Batch endpoint caps at 100** emails/request; loop in chunks (use ~90).
- **Always send individually** (one `to` per email) — never a shared To/CC.
- **Unsubscribe link is legally required** for marketing email; keep it in every send.
- **Watch the daily cap** — the big-send warning exists so a list >100 doesn't silently truncate.
- Host the **logo on a public URL** (email can't use local/relative images).
