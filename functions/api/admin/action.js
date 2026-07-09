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
      case "cohort.create":
        if (!data.name) return json({ error: "Cohort name is required." }, 400);
        await db.insert("pl_cohorts", {
          name: data.name, session_date: data.session_date || null,
          capacity: data.capacity || 6, notes: data.notes || null
        });
        break;
      case "cohort.update":
        await db.patch("pl_cohorts", `id=eq.${data.id}`, pick(data, ["name", "session_date", "capacity", "status", "notes"]));
        break;
      case "cohort.delete":
        await db.remove("pl_cohorts", `id=eq.${data.id}`);
        break;
      case "member.add":
        await db.insert("pl_cohort_members", {
          cohort_id: data.cohort_id, name: data.name || null, email: (data.email || "").toLowerCase() || null,
          rblp_type: data.rblp_type || null, payment_type: data.payment_type || null,
          status: data.status || "applied", notes: data.notes || null
        });
        break;
      case "member.update":
        await db.patch("pl_cohort_members", `id=eq.${data.id}`, pick(data, ["name", "email", "rblp_type", "payment_type", "status", "notes"]));
        break;
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
  const replyTo = env.NOTIFY_TO || "info@promoteandlead.com";
  const htmlBody = escapeHtml(message).replace(/\n/g, "<br>");

  let sent = 0;
  for (let i = 0; i < recipients.length; i += 90) {
    const chunk = recipients.slice(i, i + 90);
    const emails = chunk.map((to) => {
      const unsub = `${origin}/api/unsubscribe?e=${encodeURIComponent(to)}`;
      return {
        from, to, reply_to: replyTo, subject,
        html: `${htmlBody}<br><br><hr style="border:none;border-top:1px solid #ddd"><p style="font-size:12px;color:#888">You're receiving this because you joined the Promote &amp; Lead Solutions list. <a href="${unsub}">Unsubscribe</a>.</p>`,
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

  try { await db.insert("pl_campaigns", { subject, body: message, audience: audienceLabel, recipient_count: sent }); } catch (e) {}
  return json({ ok: true, sent });
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
