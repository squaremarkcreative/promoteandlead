// Classroom sessions — email + one-time code, then an HMAC-signed cookie.
//
// Why not Supabase Auth's own OTP: this site already talks to Supabase server-side only
// (service role, RLS on with no policies — see supabase-schema.sql), and it already sends
// branded mail through Resend. Putting the anon key in the browser and relying on Supabase's
// built-in SMTP (2 emails/hour on the default sender, unbranded) would be a step backwards.
// So Supabase stays the store, Resend delivers the code, and the session is a signed cookie.

import { sb, json } from "./db.js";

const COOKIE = "pl_classroom";
const SESSION_DAYS = 30;
const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function secret(env) {
  // Falls back to the service-role key so the classroom still works before the dedicated
  // secret is set; rotating SUPABASE_SERVICE_ROLE_KEY then simply logs everyone out.
  return env.CLASSROOM_SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "";
}

async function hmac(env, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret(env)),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------- one-time codes

export function generateCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

// Codes are stored hashed, so a database leak doesn't hand out live logins.
export async function hashCode(env, email, code) {
  return hmac(env, `code:${email}:${code}`);
}

// Throttle per email so the endpoint can't be used to spam someone's inbox.
export async function tooManyCodes(db, email) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const rows = await db.select(
    "pl_login_codes",
    `select=id&email=eq.${encodeURIComponent(email)}&created_at=gte.${since}`
  );
  return rows.length >= MAX_CODES_PER_HOUR;
}

export async function issueCode(env, db, email) {
  const code = generateCode();
  await db.insert("pl_login_codes", {
    email,
    code_hash: await hashCode(env, email, code),
    expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString()
  });
  return { code, ttlMinutes: CODE_TTL_MIN };
}

// Returns { ok } or { error } — never says whether the email itself is known.
export async function consumeCode(env, db, email, code) {
  const hash = await hashCode(env, email, code);
  const now = new Date().toISOString();
  const rows = await db.select(
    "pl_login_codes",
    `select=id,attempts,expires_at,consumed_at&email=eq.${encodeURIComponent(email)}` +
      `&consumed_at=is.null&expires_at=gte.${now}&order=created_at.desc&limit=1`
  );
  if (!rows.length) return { error: "That code has expired. Request a new one." };

  const row = rows[0];
  if (row.attempts >= MAX_ATTEMPTS) return { error: "Too many attempts. Request a new code." };

  const match = await db.select(
    "pl_login_codes",
    `select=id&id=eq.${row.id}&code_hash=eq.${encodeURIComponent(hash)}`
  );
  if (!match.length) {
    await db.patch("pl_login_codes", `id=eq.${row.id}`, { attempts: row.attempts + 1 });
    return { error: "That code isn't right. Check the email and try again." };
  }

  await db.patch("pl_login_codes", `id=eq.${row.id}`, { consumed_at: now });
  return { ok: true };
}

// ---------------------------------------------------------------- cookie sessions

export async function makeSessionCookie(env, studentId, email) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = `${studentId}.${email}.${exp}`;
  const token = `${payload}.${await hmac(env, payload)}`;
  const maxAge = SESSION_DAYS * 86400;
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Verifies the cookie signature only — the caller still loads the live row for the role,
// so a promotion or demotion in the database takes effect on the next request.
export async function sessionFrom(request, env) {
  const token = readCookie(request);
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!timingSafeEqual(sig, await hmac(env, payload))) return null;

  const [studentId, email, exp] = payload.split(".");
  if (!studentId || !email || !exp) return null;
  if (Number(exp) < Date.now()) return null;
  return { studentId, email };
}

// Loads the signed-in student row. Returns null when there's no valid session.
export async function currentStudent(request, env, db) {
  const s = await sessionFrom(request, env);
  if (!s) return null;
  const rows = await db.select("pl_students", `select=*&id=eq.${s.studentId}&limit=1`);
  if (!rows.length) return null;
  const student = rows[0];
  student.role = effectiveRole(env, student);
  return student;
}

// Admin comes from CLASSROOM_ADMINS and NOWHERE else — not from the role column, not from a
// promotion in the UI. The company owner sets up cohorts, fills them and handles the money, so
// that authority follows an environment variable only he can change. A stored role of "admin"
// (left over, or written by some future bug) grants nothing.
//
// The flip side: if CLASSROOM_ADMINS is wrong, nobody is admin. That's the safer failure —
// getting back in means fixing the variable, not finding a back door.
export function adminEmails(env) {
  return (env.CLASSROOM_ADMINS || "info@promoteandlead.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function effectiveRole(env, student) {
  const email = (student.email || "").toLowerCase();
  if (adminEmails(env).includes(email)) return "admin";
  return student.role === "instructor" ? "instructor" : "student";
}

export function requireStudent(student) {
  if (!student) return json({ error: "Please sign in again." }, 401);
  return null;
}

export function requireRole(student, roles) {
  const gate = requireStudent(student);
  if (gate) return gate;
  if (!roles.includes(student.role)) return json({ error: "You don't have access to that." }, 403);
  return null;
}

export { COOKIE, sb };
