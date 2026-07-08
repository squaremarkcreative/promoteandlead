// POST /api/track — lightweight visit beacon. Logs coarse geo + referrer.
// Never surfaces errors; returns 204 regardless.

import { sb, geoFrom, json } from "../_lib/db.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const db = sb(env);
    if (!db.enabled) return new Response(null, { status: 204 });

    let path = "/";
    let ref = "";
    try {
      const b = await request.json();
      path = (b.path || "/").toString().slice(0, 300);
      ref = (b.ref || "").toString().slice(0, 500);
    } catch (e) { /* ignore malformed body */ }

    const geo = geoFrom(request);
    await db.insert("pl_visits", {
      path,
      referrer: parseRef(ref, request.headers.get("host") || ""),
      country: geo.country,
      region: geo.region,
      city: geo.city,
      ua: (request.headers.get("user-agent") || "").slice(0, 300)
    });
    return new Response(null, { status: 204 });
  } catch (err) {
    return new Response(null, { status: 204 });
  }
}

function parseRef(ref, host) {
  if (!ref) return "direct";
  try {
    const u = new URL(ref);
    if (u.host === host) return "internal";
    return u.host;
  } catch {
    return "direct";
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return new Response(null, { status: 204 });
  return onRequestPost(context);
}
