// POST /api/contact — on-site contact form.
// Stores the lead in Supabase (with geo) and emails it to NOTIFY_TO via Resend.

import { sb, geoFrom, referrerFrom, json } from "../_lib/db.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const name = (body.name || "").toString().trim().slice(0, 200);
    const email = (body.email || "").toString().trim().slice(0, 200);
    const topic = (body.topic || "General question").toString().trim().slice(0, 120);
    const message = (body.message || "").toString().trim().slice(0, 5000);

    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name || !okEmail || !message) {
      return json({ error: "Please provide your name, a valid email, and a message." }, 400);
    }

    const geo = geoFrom(request);

    // Store the lead (best-effort — never block the send).
    const db = sb(env);
    if (db.enabled) {
      try {
        await db.insert("pl_contacts", {
          name, email, topic, message,
          referrer: referrerFrom(request),
          country: geo.country, region: geo.region, city: geo.city
        });
      } catch (e) { /* keep going — still email it */ }
    }

    if (!env.RESEND_API_KEY) {
      return json({ error: "Contact form isn't configured yet. Please email info@promoteandlead.com." }, 503);
    }

    const to = env.NOTIFY_TO || "info@promoteandlead.com";
    const from = env.NOTIFY_FROM || "Promote & Lead Solutions <onboarding@resend.dev>";
    const where = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "unknown";

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to, reply_to: email,
        subject: `Website contact: ${topic}`,
        text:
          "New contact form submission:\n\n" +
          `Name:    ${name}\n` +
          `Email:   ${email}\n` +
          `Topic:   ${topic}\n` +
          `From:    ${where}\n` +
          `Time:    ${new Date().toISOString()}\n\n` +
          `${message}\n`
      })
    });

    if (!r.ok) return json({ error: "We couldn't send your message. Please email info@promoteandlead.com." }, 502);
    return json({ ok: true });
  } catch (err) {
    return json({ error: "Server error. Please try again." }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
