// POST /api/subscribe — cohort/waitlist signup.
// Stores the subscriber in Supabase (with coarse geo) and emails a notification via Resend.
// Both integrations degrade gracefully: the form still returns OK if either is unconfigured.

import { sb, geoFrom, referrerFrom, json } from "../_lib/db.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email } = await request.json();
    const valid = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) return json({ error: "Invalid email address." }, 400);

    const clean = email.trim().toLowerCase();
    const geo = geoFrom(request);
    const db = sb(env);
    let isNew = true;

    if (db.enabled) {
      try {
        const existing = await db.select("pl_subscribers", `email=eq.${encodeURIComponent(clean)}&select=id`);
        isNew = !(existing && existing.length);
        await db.upsert("pl_subscribers", {
          email: clean,
          source: "cohort-form",
          referrer: referrerFrom(request),
          country: geo.country,
          region: geo.region,
          city: geo.city
        }, "email");
      } catch (e) {
        // best-effort: never fail the signup on a transient DB hiccup; still notify below
      }
    }

    if (isNew) await notify(env, clean, geo);
    return json({ ok: true });
  } catch (err) {
    return json({ error: "Server error. Please try again." }, 500);
  }
}

async function notify(env, email, geo) {
  if (!env.RESEND_API_KEY) return;
  const to = env.NOTIFY_TO || "info@promoteandlead.com";
  const from = env.NOTIFY_FROM || "Promote & Lead Solutions <onboarding@resend.dev>";
  const where = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "unknown";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to,
        subject: "New cohort list signup",
        text: `New signup for the Promote & Lead cohort list:\n\nEmail: ${email}\nFrom:  ${where}\nTime:  ${new Date().toISOString()}\n`
      })
    });
  } catch (err) { /* signup already succeeded */ }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
