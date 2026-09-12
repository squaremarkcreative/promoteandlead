// POST /api/classroom/auth — email + one-time code sign-in for /classroom.
// Actions: request-code | verify-code | logout
//
// This is a P&L classroom account. It is NOT an RBLP credential account — students still
// apply to RBLP separately (see the pipeline copy in classroom/index.html).

import { sb, json } from "../../_lib/db.js";
import { transactionalEmail, sendEmail } from "../../_lib/email.js";
import {
  EMAIL_RE, issueCode, consumeCode, tooManyCodes,
  makeSessionCookie, clearSessionCookie, effectiveRole
} from "../../_lib/session.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const action = body.action;

  if (action === "logout") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() }
    });
  }

  const db = sb(env);
  if (!db.enabled) return json({ error: "The classroom isn't configured yet. Email info@promoteandlead.com." }, 503);

  const email = (body.email || "").toString().trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) return json({ error: "Please enter a valid email address." }, 400);

  try {
    if (action === "request-code") return await requestCode(env, db, email);
    if (action === "verify-code")  return await verifyCode(env, db, email, body);
    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    return json({ error: "Server error. Please try again." }, 500);
  }
}

async function requestCode(env, db, email) {
  if (await tooManyCodes(db, email)) {
    return json({ error: "Too many codes requested for that address. Try again in an hour." }, 429);
  }
  if (!env.RESEND_API_KEY) {
    return json({ error: "Sign-in email isn't configured yet. Email info@promoteandlead.com." }, 503);
  }

  const { code, ttlMinutes } = await issueCode(env, db, email);

  const html = transactionalEmail(
    `<p style="margin:0 0 14px">Here's your sign-in code for the <strong>Promote &amp; Lead classroom</strong>:</p>` +
    `<p style="margin:0 0 14px;font-size:34px;letter-spacing:9px;font-weight:700;color:#0B2E6D;font-family:Arial,Helvetica,sans-serif">${code}</p>` +
    `<p style="margin:0 0 14px">It expires in ${ttlMinutes} minutes and can only be used once.</p>` +
    `<p style="margin:0;color:#666;font-size:13px">This signs you into your Promote &amp; Lead classroom account. It is not your RBLP credential account — you apply for that separately at rblp.com.</p>`
  );
  const sent = await sendEmail(env, {
    to: email,
    subject: `${code} is your Promote & Lead classroom code`,
    html,
    text: `Your Promote & Lead classroom sign-in code is ${code}. It expires in ${ttlMinutes} minutes.\n\nThis is your P&L classroom account, not your RBLP credential account.`
  });
  if (!sent) return json({ error: "We couldn't send the code. Please email info@promoteandlead.com." }, 502);

  return json({ ok: true, sent: true });
}

async function verifyCode(env, db, email, body) {
  const code = (body.code || "").toString().replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return json({ error: "Enter the 6-digit code from your email." }, 400);

  const result = await consumeCode(env, db, email, code);
  if (result.error) return json({ error: result.error }, 401);

  // First valid code for an address creates the free P&L account (pipeline step 1).
  let rows = await db.select("pl_students", `select=*&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (!rows.length) {
    const displayName = (body.display_name || "").toString().trim().slice(0, 120) || null;
    await db.insert("pl_students", { email, display_name: displayName });
    rows = await db.select("pl_students", `select=*&email=eq.${encodeURIComponent(email)}&limit=1`);
    if (!rows.length) return json({ error: "Couldn't create your account. Please try again." }, 500);
    try {
      await db.upsert("pl_pipeline_events",
        { student_id: rows[0].id, step: "account", completed_at: new Date().toISOString() },
        "student_id,step");
    } catch (e) { /* the account exists either way */ }
  }

  const student = rows[0];
  await db.patch("pl_students", `id=eq.${student.id}`, { last_login_at: new Date().toISOString() });

  return new Response(
    JSON.stringify({ ok: true, role: effectiveRole(env, student) }),
    { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": await makeSessionCookie(env, student.id, email) } }
  );
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
