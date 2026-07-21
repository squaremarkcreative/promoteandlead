// POST /api/admin/action — mutations + campaign send. Requires Cloudflare Access.
import { sb, json } from "../../_lib/db.js";
import { verifyAccess } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await verifyAccess(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const db = sb(env);
  if (!db.enabled) return json({ error: "Supabase is not configured yet." }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const { action, data = {} } = body || {};

  try {
    switch (action) {
      case "cohort.create": {
        if (!data.name) return json({ error: "Cohort name is required." }, 400);
        const row = { name: data.name, session_date: data.session_date || null, capacity: data.capacity || 6, notes: data.notes || null };
        if (data.code) row.code = data.code;
        await db.insert("pl_cohorts", row);
        break;
      }
      case "cohort.update":
        await db.patch("pl_cohorts", `id=eq.${data.id}`, pick(data, ["name", "code", "session_date", "capacity", "status", "notes"]));
        break;
      case "cohort.delete":
        await db.remove("pl_cohorts", `id=eq.${data.id}`);
        break;
      case "member.add":
        await db.insert("pl_cohort_members", {
          cohort_id: data.cohort_id, name: data.name || null, email: (data.email || "").toLowerCase() || null,
          rblp_type: data.rblp_type || null, payment_type: data.payment_type || null,
          branch: data.branch || null, ca_submitted_on: data.ca_submitted_on || null,
          status: data.status || "applied", notes: data.notes || null
        });
        break;
      case "member.update": {
        const patch = pick(data, ["cohort_id", "name", "email", "rblp_type", "payment_type", "branch", "ca_submitted_on", "status", "certified_on", "notes"]);
        // Cleared date inputs arrive as "" — Postgres needs null, not an empty string.
        for (const k of ["ca_submitted_on", "certified_on"]) if (patch[k] === "") patch[k] = null;
        await db.patch("pl_cohort_members", `id=eq.${data.id}`, patch);
        break;
      }
      case "member.delete":
        await db.remove("pl_cohort_members", `id=eq.${data.id}`);
        break;
      case "contact.update":
        await db.patch("pl_contacts", `id=eq.${data.id}`, pick(data, ["status", "notes"]));
        break;
      case "subscriber.add":
        if (!data.email) return json({ error: "Email required." }, 400);
        await db.upsert("pl_subscribers", { email: data.email.toLowerCase(), source: "manual" }, "email");
        break;
      case "subscriber.delete":
        await db.remove("pl_subscribers", `id=eq.${data.id}`);
        break;
      case "setting.save":
        if (!data.key) return json({ error: "Missing key." }, 400);
        await db.upsert("pl_settings", { key: data.key, value: data.value || "", updated_at: new Date().toISOString() }, "key");
        break;
      case "campaign.send":
        return await sendCampaign(env, db, data, new URL(request.url).origin);
      default:
        return json({ error: "Unknown action." }, 400);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

async function sendCampaign(env, db, data, origin) {
  if (!env.RESEND_API_KEY) return json({ error: "Email isn't configured (RESEND_API_KEY)." }, 503);
  const subject = (data.subject || "").trim();
  const message = (data.message || "").trim();
  if (!subject || !message) return json({ error: "Subject and message are required." }, 400);

  let recipients = [];
  let audienceLabel = "custom";
  if (data.audience === "list") {
    const subs = await db.select("pl_subscribers", "select=email&unsubscribed=eq.false");
    recipients = subs.map((s) => s.email);
    audienceLabel = "list";
  } else if (data.audience && data.audience.startsWith("cohort:")) {
    const cid = data.audience.slice(7);
    const members = await db.select("pl_cohort_members", `select=email&cohort_id=eq.${cid}`);
    recipients = members.map((m) => m.email);
    audienceLabel = data.audience;
  } else if (Array.isArray(data.emails)) {
    recipients = data.emails;
  }
  recipients = [...new Set(recipients.filter(Boolean).map((e) => e.toLowerCase()))];
  if (!recipients.length) return json({ error: "No recipients found for that audience." }, 400);

  const from = env.NOTIFY_FROM || "Promote & Lead Solutions <onboarding@resend.dev>";
  const owner = env.NOTIFY_TO || "info@promoteandlead.com";
  const messageHtml = escapeHtml(message).replace(/\n/g, "<br>");

  let sent = 0;
  for (let i = 0; i < recipients.length; i += 90) {
    const chunk = recipients.slice(i, i + 90);
    const emails = chunk.map((to) => {
      const unsub = `${origin}/api/unsubscribe?e=${encodeURIComponent(to)}`;
      return {
        from, to, reply_to: owner, subject,
        html: brandedEmail(messageHtml, unsub, null),
        text: `${message}\n\n---\nUnsubscribe: ${unsub}`
      };
    });
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(emails)
    });
    if (res.ok) sent += chunk.length;
  }

  // Send a confirmation copy to the owner so they know it went out.
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: owner, reply_to: owner,
        subject: `✓ Sent to ${sent}: ${subject}`,
        html: brandedEmail(messageHtml, null, sent),
        text: `Your message "${subject}" was sent to ${sent} recipient(s).\n\n${message}`
      })
    });
  } catch (e) { /* receipt is best-effort */ }

  try { await db.insert("pl_campaigns", { subject, body: message, audience: audienceLabel, recipient_count: sent }); } catch (e) {}
  return json({ ok: true, sent });
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Branded, email-client-safe HTML wrapper.
// receiptCount != null => owner confirmation copy (banner, no unsubscribe).
function brandedEmail(messageHtml, unsubUrl, receiptCount) {
  const isReceipt = receiptCount !== null && receiptCount !== undefined;
  const banner = isReceipt
    ? `<div style="background:#1F5E2A;color:#fff4e8;padding:10px 14px;border-radius:8px;font-size:13px;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif">This is your copy — sent to ${receiptCount} recipient(s).</div>`
    : "";
  const footer = isReceipt
    ? ""
    : `You're receiving this because you joined the Promote &amp; Lead Solutions list. <a href="${unsubUrl}" style="color:#999">Unsubscribe</a>.`;
  return (
    `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">` +
    `<tr><td style="height:5px;background:#C8A415"></td></tr>` +
    `<tr><td align="center" style="padding:26px 24px 4px">` +
    `<img src="https://promoteandlead.com/assets/logo-icon.png" width="54" alt="Promote &amp; Lead Solutions" style="display:block;margin:0 auto 10px">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#0B2E6D;letter-spacing:.5px">PROMOTE &amp; LEAD SOLUTIONS</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8B2C2C;letter-spacing:1px;margin-top:3px">RBLP AUTHORIZED TRAINING PARTNER</div>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#222">${banner}${messageHtml}</td></tr>` +
    `<tr><td style="padding:16px 32px 26px">` +
    `<hr style="border:none;border-top:1px solid #eee;margin:0 0 14px">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999;line-height:1.6">` +
    `Promote &amp; Lead Solutions &middot; <a href="https://promoteandlead.com" style="color:#1F5E2A">promoteandlead.com</a> &middot; <a href="mailto:info@promoteandlead.com" style="color:#1F5E2A">info@promoteandlead.com</a><br>${footer}` +
    `</div></td></tr></table></td></tr></table></body></html>`
  );
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
