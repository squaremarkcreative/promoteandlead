// Minimal in-memory PostgREST stand-in — just the subset functions/_lib/db.js uses.
import { randomUUID } from "node:crypto";

export const DB = {};
export const SENT = [];

const table = (t) => (DB[t] ||= []);

function parseFilters(params) {
  const f = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "on_conflict", "offset"].includes(k)) continue;
    const [op, ...rest] = v.split(".");
    f.push({ col: k, op, val: rest.join(".") });
  }
  return f;
}

function matches(row, f) {
  const cell = row[f.col];
  switch (f.op) {
    case "eq":  return String(cell) === f.val;
    case "neq": return String(cell) !== f.val;
    case "gte": return cell != null && String(cell) >= f.val;
    case "lte": return cell != null && String(cell) <= f.val;
    case "is":  return f.val === "null" ? (cell == null) : String(cell) === f.val;
    case "in":  return f.val.replace(/^\(|\)$/g, "").split(",").map(decodeURIComponent).includes(String(cell));
    default: throw new Error("mock: unsupported operator " + f.op);
  }
}

// Handles `select=*,alias:other_table(*)` by joining on <other_table minus 'pl_'>_id.
function expand(rows, select, tableName) {
  const m = /(\w+):(\w+)\(\*\)/.exec(select || "");
  if (!m) return rows;
  const [, alias, target] = m;
  const fk = tableName === "pl_cohort_members" && target === "pl_cohorts" ? "cohort_id" : null;
  if (!fk) throw new Error("mock: unknown embed " + select);
  return rows.map((r) => ({ ...r, [alias]: table(target).find((t) => t.id === r[fk]) || null }));
}

export function install(supabaseUrl) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));

    if (String(url).startsWith("https://api.resend.com")) {
      SENT.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: randomUUID() }), { status: 200 });
    }

    if (!String(url).startsWith(supabaseUrl)) return realFetch(url, init);

    const name = u.pathname.replace(/^\/rest\/v1\//, "");
    const rows = table(name);
    const filters = parseFilters(u.searchParams);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;

    if (method === "GET") {
      let out = rows.filter((r) => filters.every((f) => matches(r, f)));
      const order = u.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
      }
      const limit = u.searchParams.get("limit");
      if (limit) out = out.slice(0, Number(limit));
      out = expand(out, u.searchParams.get("select"), name);
      return new Response(JSON.stringify(out), { status: 200 });
    }

    if (method === "POST") {
      const prefer = (init.headers || {}).Prefer || "";
      const conflict = u.searchParams.get("on_conflict");
      const incoming = Array.isArray(body) ? body : [body];
      for (const row of incoming) {
        if(name==='pl_teaching_progress' && !conflict && rows.some(r=>r.cohort_id===row.cohort_id&&r.instructor_id===row.instructor_id))return new Response('Duplicate progress',{status:409});
        if (conflict && prefer.includes("merge-duplicates")) {
          const keys = conflict.split(",");
          const existing = rows.find((r) => keys.every((k) => String(r[k]) === String(row[k])));
          if (existing) { Object.assign(existing, row); continue; }
        }
        rows.push({ id: randomUUID(), created_at: new Date().toISOString(), attempts: 0, ...row });
      }
      return new Response(null, { status: 204 });
    }

    if (method === "PATCH") {
      const updated=rows.filter((r) => filters.every((f) => matches(r, f)));
      for (const r of updated) Object.assign(r, body);
      if((init.headers?.Prefer||'').includes('return=representation'))return new Response(JSON.stringify(updated),{status:200});
      return new Response(null, { status: 204 });
    }

    if (method === "DELETE") {
      DB[name] = rows.filter((r) => !filters.every((f) => matches(r, f)));
      return new Response(null, { status: 204 });
    }

    throw new Error("mock: unsupported method " + method);
  };
}
