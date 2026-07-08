// Shared helpers for Pages Functions (underscore folder = not routed).
// Supabase access is via PostgREST + the SERVICE ROLE key — server-side only.

export function sb(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const enabled = !!(url && key);
  const base = enabled ? url.replace(/\/$/, "") + "/rest/v1" : null;
  const headers = enabled
    ? { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
    : null;

  async function req(path, init) {
    const res = await fetch(`${base}/${path}`, init);
    if (!res.ok) throw new Error(`supabase ${init.method || "GET"} ${path} ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    enabled,
    insert(table, row, opts = {}) {
      const prefer = opts.representation ? "return=representation" : "return=minimal";
      return req(table, { method: "POST", headers: { ...headers, Prefer: prefer }, body: JSON.stringify(row) });
    },
    upsert(table, row, onConflict) {
      return req(`${table}?on_conflict=${onConflict}`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row)
      });
    },
    select(table, query = "") {
      return req(`${table}?${query}`, { headers });
    },
    patch(table, query, row) {
      return req(`${table}?${query}`, { method: "PATCH", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(row) });
    },
    remove(table, query) {
      return req(`${table}?${query}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
    }
  };
}

// Coarse geo from Cloudflare's edge (no precise/personal data).
export function geoFrom(request) {
  const cf = request.cf || {};
  return {
    country: cf.country || null,
    region: cf.region || null, // state / province, e.g. "Oklahoma"
    city: cf.city || null
  };
}

// Referrer host, or 'direct' / 'internal'.
export function referrerFrom(request) {
  const r = request.headers.get("referer") || "";
  if (!r) return "direct";
  try {
    const u = new URL(r);
    if (u.host === (request.headers.get("host") || "")) return "internal";
    return u.host;
  } catch {
    return "direct";
  }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
