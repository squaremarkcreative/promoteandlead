// POST /api/classroom/digest — builds and sends the daily digest. Called once a day by the
// promoteandlead-digest Worker's cron trigger (workers/digest-cron). Student names are in here,
// so it needs the shared secret; ?dry=1 returns the digest without sending it.

import { sb, json } from "../../_lib/db.js";
import { runDigest } from "../../_lib/digest.js";

// Compare without leaking, through timing, how much of a guess was right.
function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a || ""));
  const y = new TextEncoder().encode(String(b || ""));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DIGEST_SECRET) return json({ error: "Digest isn't configured." }, 503);
  const auth = request.headers.get("authorization") || "";
  if (!sameSecret(auth.replace(/^Bearer\s+/i, ""), env.DIGEST_SECRET)) return json({ error: "Not allowed." }, 401);

  const db = sb(env);
  if (!db.enabled) return json({ error: "The classroom isn't configured yet." }, 503);

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const { digest, sent } = await runDigest(db, env, { send: !dry });
    return json({ ok: true, dry, sent, counts: { yours: digest.yours.length, chase: digest.chase.length, quiet: digest.quiet.length },
      ...(dry ? { digest } : {}) });
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
