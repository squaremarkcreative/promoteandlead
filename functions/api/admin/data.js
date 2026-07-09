// GET /api/admin/data — full dashboard payload. Requires Cloudflare Access.
import { sb, json } from "../../_lib/db.js";
import { verifyAccess } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await verifyAccess(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const db = sb(env);
  if (!db.enabled) return json({ error: "Supabase is not configured yet." }, 503);

  try {
    const [subscribers, contacts, cohorts, topStates, topReferrers, topCities, countries] = await Promise.all([
      db.select("pl_subscribers", "select=*&order=created_at.desc"),
      db.select("pl_contacts", "select=*&order=created_at.desc"),
      db.select("pl_cohorts", "select=*,members:pl_cohort_members(*)&order=created_at.desc"),
      db.select("pl_stats_top_states", "limit=5"),
      db.select("pl_stats_top_referrers", "limit=5"),
      db.select("pl_stats_top_cities", "limit=5"),
      db.select("pl_stats_countries", "")
    ]);

    const totalVisits = (countries || []).reduce((n, c) => n + (c.visits || 0), 0);

    // settings (key/value) — resilient if the table doesn't exist yet
    const settings = {};
    try {
      const rows = await db.select("pl_settings", "select=key,value");
      (rows || []).forEach((r) => { settings[r.key] = r.value; });
    } catch (e) { /* pl_settings not created yet */ }

    // recent campaigns (for monthly send count) — resilient
    let campaigns = [];
    try {
      campaigns = (await db.select("pl_campaigns", "select=created_at,recipient_count,subject&order=created_at.desc&limit=200")) || [];
    } catch (e) { /* ignore */ }

    return json({
      user: user.email,
      overview: {
        subscribers: subscribers.length,
        contacts: contacts.length,
        cohorts: cohorts.length,
        visits: totalVisits
      },
      topStates: topStates || [],
      topReferrers: topReferrers || [],
      topCities: topCities || [],
      countries: countries || [],
      subscribers,
      contacts,
      cohorts,
      settings,
      campaigns
    });
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  return onRequestGet(context);
}
