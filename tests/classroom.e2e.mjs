// End-to-end tests for /classroom. No dependencies, no network, no database:
// the handlers run in Node against an in-memory PostgREST stand-in (tests/pgrest-mock.mjs)
// with Resend captured. Run:  node tests/classroom.e2e.mjs
import { install, DB, SENT } from "./pgrest-mock.mjs";
import { randomUUID } from "node:crypto";
import { execSync as execSyncCert } from "node:child_process";

const SUPA = "https://mock.supabase.test";
install(SUPA);

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const R = ROOT + "functions";  // handlers under test
const auth    = await import(`file://${R}/api/classroom/auth.js`);
const me      = await import(`file://${R}/api/classroom/me.js`);
const action  = await import(`file://${R}/api/classroom/action.js`);
const consoleEp = await import(`file://${R}/api/classroom/console.js`);
const { certificateOrg } = await import(`file://${R}/_lib/classroom.js`);

const env = {
  SUPABASE_URL: SUPA,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  CLASSROOM_SESSION_SECRET: "test-session-secret",
  RESEND_API_KEY: "re_test",
  CLASSROOM_ADMINS: "tommy@promoteandlead.com"
};

let PASS = 0, FAIL = 0;
function check(label, cond, extra) {
  if (cond) { PASS++; console.log("  ✓", label); }
  else { FAIL++; console.log("  ✗", label, extra !== undefined ? JSON.stringify(extra) : ""); }
}
function section(t) { console.log("\n" + t); }

const post = (mod, body, cookie) => mod.onRequest({
  request: new Request("https://promoteandlead.com/api/classroom/x", {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body)
  }), env
});
const get = (mod, cookie) => mod.onRequest({
  request: new Request("https://promoteandlead.com/api/classroom/x", { headers: cookie ? { cookie } : {} }), env
});

async function signIn(email) {
  const r1 = await post(auth, { action: "request-code", email });
  if (!r1.ok) throw new Error("request-code failed: " + (await r1.text()));
  const code = /\b(\d{6})\b/.exec(SENT[SENT.length - 1].subject)[1];
  const r2 = await post(auth, { action: "verify-code", email, code });
  if (!r2.ok) throw new Error("verify-code failed: " + (await r2.text()));
  return { cookie: r2.headers.get("set-cookie").split(";")[0], body: await r2.json() };
}

// ---------------------------------------------------------------- sign-in
section("Auth — email + one-time code");
const before = SENT.length;
const student = await signIn("pat.jones@example.com");
check("code email sent, branded, 6 digits in subject", SENT.length === before + 1 && /^\d{6} is your Promote & Lead classroom code$/.test(SENT[before].subject));
check("email is transactional (no unsubscribe link)", !SENT[before].html.includes("Unsubscribe"));
check("email states classroom ≠ RBLP account", SENT[before].html.includes("not your RBLP credential account"));
const rawCookie = (await (async () => {
  const r1 = await post(auth, { action: "request-code", email: "cookie@example.com" });
  const c = /\b(\d{6})\b/.exec(SENT[SENT.length - 1].subject)[1];
  const r2 = await post(auth, { action: "verify-code", email: "cookie@example.com", code: c });
  return r2.headers.get("set-cookie");
})());
check("session cookie is HttpOnly, Secure, SameSite=Lax, Path=/", /HttpOnly/.test(rawCookie) && /Secure/.test(rawCookie) && /SameSite=Lax/.test(rawCookie) && /Path=\//.test(rawCookie), rawCookie);
check("account row created on first sign-in", DB.pl_students.filter(s => s.email === "pat.jones@example.com").length === 1 && DB.pl_students[0].email === "pat.jones@example.com");
check("account creation is idempotent (second sign-in reuses the row)", await (async () => { const again = await signIn("pat.jones@example.com"); return DB.pl_students.filter(s => s.email === "pat.jones@example.com").length === 1; })());
check("code stored hashed, not in the clear", !JSON.stringify(DB.pl_login_codes).includes(/\b(\d{6})\b/.exec(SENT[before].subject)[1]));

const wrong = await post(auth, { action: "verify-code", email: "pat.jones@example.com", code: "000001" });
check("wrong code rejected with 401", wrong.status === 401);
const noCookie = await get(me);
check("unauthenticated /me returns signedIn:false", (await noCookie.json()).signedIn === false);

section("One-time code hardening");
const reuseEmail = "reuse@example.com";
await post(auth, { action: "request-code", email: reuseEmail });
const reuseCode = /\b(\d{6})\b/.exec(SENT[SENT.length - 1].subject)[1];
const firstUse = await post(auth, { action: "verify-code", email: reuseEmail, code: reuseCode });
const secondUse = await post(auth, { action: "verify-code", email: reuseEmail, code: reuseCode });
check("a code works once", firstUse.ok);
check("the same code cannot be replayed", secondUse.status === 401);

const expEmail = "expired@example.com";
await post(auth, { action: "request-code", email: expEmail });
DB.pl_login_codes.filter(r => r.email === expEmail).forEach(r => { r.expires_at = new Date(Date.now() - 1000).toISOString(); });
const expCode = /\b(\d{6})\b/.exec(SENT[SENT.length - 1].subject)[1];
check("an expired code is refused", (await post(auth, { action: "verify-code", email: expEmail, code: expCode })).status === 401);

const floodEmail = "flood@example.com";
let throttled = null;
for (let i = 0; i < 7; i++) {
  const r = await post(auth, { action: "request-code", email: floodEmail });
  if (r.status === 429) { throttled = i; break; }
}
check("code requests are rate limited per address", throttled === 5, throttled);
check("bad email address rejected", (await post(auth, { action: "request-code", email: "nope" })).status === 400);

// ---------------------------------------------------------------- gating
section("Acceptance: the journey, start to certified");
let m = await (await get(me, student.cookie)).json();
check("a brand-new student is asked for their credential and funding first", m.pipeline.currentStep === "profile", m.pipeline.currentStep);
check("prep work is locked", m.worksheets.unlocked === false);
check("locked payload still lists modules so the student can see what's coming", Array.isArray(m.worksheets.modules) && m.worksheets.modules.length > 0);
check("every step says whose court the ball is in",
  m.pipeline.steps.every((st) => ["you", "pls", "rblp", "ca"].includes(st.owner) && st.ownerLabel && st.blurb),
  m.pipeline.steps.filter((st) => !st.owner).map((st) => st.key));
check("the journey ends at the RBLP credential", m.pipeline.steps[m.pipeline.steps.length - 1].key === "certified");
check("Promote & Lead's training certificate sits just before the exam",
  m.pipeline.steps.map((st) => st.key).slice(-3).join() === "certificate,exam,certified",
  m.pipeline.steps.map((st) => st.key).slice(-3));

// Until they say how they're paying we can't know which route they're on, so we show the
// short one rather than scaring them with invoices they may never need.
check("before funding is chosen the student is on the Normal route", m.pipeline.route === "Normal");
await post(action, { action: "profile.save", data: { display_name: "Pat Jones", track: "RBLP-C" } }, student.cookie);
await post(action, { action: "funding.choose", data: { source: "army_ca" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("choosing Army CA puts them on the CA route", m.pipeline.route === "CA");
check("the CA route includes the invoice and approval steps",
  ["invoice", "ca_submitted", "ca_approved"].every((k) => m.pipeline.steps.some((st) => st.key === k)));
check("the CA route does not ask them to pay us directly", !m.pipeline.steps.some((st) => st.key === "paid"));
check("after choosing funding the next move is applying at RBLP", m.pipeline.currentStep === "rblp_apply", m.pipeline.currentStep);

await post(action, { action: "pipeline.confirmApplied", data: { applied: true } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("once they've applied, the ball is with RBLP", m.pipeline.current.key === "rblp_received" && m.pipeline.current.owner === "rblp", m.pipeline.current.key);
check("still locked — applying is not paying", m.worksheets.unlocked === false);

// Tommy marks the things that only reach us by email, and each one tells the student.
const sentBefore = SENT.length;
const advance = (step, cookie) => post(action, { action: "student.advance", data: { id: DB.pl_students[0].id, step } }, cookie);
const notAdmin = await advance("rblp_received", student.cookie);
check("a student cannot advance their own journey past us (403)", notAdmin.status === 403);

// (admin cookie is created further down; use a temporary admin for this section)
DB.pl_students.find((x) => x.email === "pat.jones@example.com").role = "student";
const boss = await signIn("tommy@promoteandlead.com");
await advance("rblp_received", boss.cookie);
m = await (await get(me, student.cookie)).json();
check("admin marking RBLP-received moves the student on", m.pipeline.current.key === "invoice", m.pipeline.current.key);
check("and emails them what happens next", SENT.length > sentBefore && /RBLP has your application/.test(SENT[SENT.length - 1].subject), SENT[SENT.length - 1] && SENT[SENT.length - 1].subject);
check("that email names RLS as the company CA pays through", /RLS/.test(SENT[SENT.length - 1].html));

await post(action, { action: "pipeline.invoiceReceived", data: { done: true } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("student confirms the invoices themselves — RBLP emails those to them", m.pipeline.current.key === "ca_submitted");

// CA is filed by uploading on the branch's own portal, and RBLP maintains the walkthrough.
// The step has to hand the student that link — telling them to "send it to their CA office"
// describes something they never do.
const caStep = m.pipeline.steps.find((st) => st.key === "ca_submitted");
check("the CA step describes uploading to the portal, not posting to an office",
  /upload/i.test(caStep.title + " " + caStep.blurb) && !/send .*office/i.test(caStep.title + " " + caStep.blurb),
  caStep.title);
check("the CA step points at RBLP's instructions for their branch", /instructions/i.test(caStep.blurb));
check("the student payload carries the branch-specific CA instructions link",
  /rblp\.com\/follow-these-steps-to-use-army/.test(m.funding.guidance.link), m.funding.guidance.link);
const caPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
const guidanceCA = (await import(`file://${R}/_lib/classroom.js`)).fundingGuidance("army_ca").body;
check("the page renders the instructions link as a button", /Read the step-by-step/.test(caPage));
check("and still flags selecting RLS as the training company",
  /When it asks for the training company, select RLS/.test(caPage));
// Two company names on a funding request reads as a scam if nobody explains it. Say who RLS
// is and why they're on the form — a Soldier who hesitates here doesn't file.
check("the step explains WHY it's RLS, not just that it is",
  /Authorized Training Partner and the approved vendor/.test(caPage) && /in partnership with RLS/.test(caPage));
check("RLS is spelled out, not left as an acronym", /Resilient Leadership Solutions \(RLS\)/.test(caPage));
check("it separates who gets paid from who teaches",
  /who the government pays/.test(JSON.stringify(guidanceCA)) && /instructor of record/.test(caPage));
check("it warns the same name appears on the certificate, so that isn't a surprise",
  /completion\s*\n?\s*'? ?\+? ?'?certificate as well/.test(caPage) || /certificate as well/.test(caPage));
check("the explanation stands on its own, without an escalation footnote",
  !/education counselor/i.test(caPage));

const noDate = await post(action, { action: "pipeline.caSubmitted", data: {} }, student.cookie);
check("filing with CA requires the date — the 45-day clock runs from it", noDate.status === 400);
await post(action, { action: "pipeline.caSubmitted", data: { date: "2026-09-20" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("the CA submission date is recorded", m.profile.caSubmittedOn === "2026-09-20", m.profile.caSubmittedOn);
check("now the ball is with their CA office", m.pipeline.current.key === "ca_approved" && m.pipeline.current.owner === "ca");
check("STILL locked — nobody does the prep work before the funding is real", m.worksheets.unlocked === false);

// Nothing may read as "approved" while the student is still waiting on it. A card that says
// "Your CA funding is approved" to someone who hasn't been approved is worse than no card.
const pendingCa = m.pipeline.steps.find((st) => st.key === "ca_approved");
check("while pending, the CA step does not claim approval",
  pendingCa.done === false && !/approved/i.test(pendingCa.title) && !/approved/i.test(pendingCa.blurb),
  pendingCa.title);
check("while pending, it reads as waiting", /waiting/i.test(pendingCa.title), pendingCa.title);
check("no unfinished step anywhere states a completed fact about funding or certification",
  m.pipeline.steps.filter((st) => !st.done).every((st) => !/\b(is approved|received|certified|issued|complete)\b/i.test(st.title)),
  m.pipeline.steps.filter((st) => !st.done && /\b(is approved|received|certified|issued|complete)\b/i.test(st.title)).map((st) => st.title));

await advance("ca_approved", boss.cookie);
m = await (await get(me, student.cookie)).json();
check("CA approval is what unlocks the prep work", m.worksheets.unlocked === true);
const approvedCa = m.pipeline.steps.find((st) => st.key === "ca_approved");
check("once marked, it says so plainly", approvedCa.done && /approved/i.test(approvedCa.title), approvedCa.title);
check("and the student is told, with the next action", /prep work is open/.test(SENT[SENT.length - 1].subject));

// Self-pay and Affirm skip the whole CA line — they pay and take the next cohort.
const payer = await signIn("selfpay@example.com");
await post(action, { action: "profile.save", data: { display_name: "Casey", track: "RBLP" } }, payer.cookie);
await post(action, { action: "funding.choose", data: { source: "self_pay" } }, payer.cookie);
let pm = await (await get(me, payer.cookie)).json();
check("a self-pay student is on the shorter route", pm.pipeline.route === "Normal" && pm.pipeline.total < m.pipeline.total, [pm.pipeline.total, m.pipeline.total]);
check("they are never asked about invoices or CA", !pm.pipeline.steps.some((st) => ["invoice", "ca_submitted", "ca_approved"].includes(st.key)));
await post(action, { action: "pipeline.confirmApplied", data: { applied: true } }, payer.cookie);
await advance2(boss.cookie, DB.pl_students.find((x) => x.email === "selfpay@example.com").id, "rblp_received");
pm = await (await get(me, payer.cookie)).json();
check("their next move is simply to pay", pm.pipeline.current.key === "paid" && pm.pipeline.current.owner === "you", pm.pipeline.current.key);
check("paying is still not done by them clicking a box", pm.worksheets.unlocked === false);
await advance2(boss.cookie, DB.pl_students.find((x) => x.email === "selfpay@example.com").id, "paid");
pm = await (await get(me, payer.cookie)).json();
check("payment unlocks their prep work too", pm.worksheets.unlocked === true);
check("and they're told they go into the next cohort", /Payment received/.test(SENT[SENT.length - 1].subject));

async function advance2(cookie, id, step) {
  return post(action, { action: "student.advance", data: { id, step } }, cookie);
}

// ---------------------------------------------------------------- CA copy
section("Acceptance: Army/AF CA copy names RLS and PLS");
const g = m.funding.guidance;
const gtext = g.body.join(" ");
check("guidance mentions RLS as the CA filing company", /\bRLS\b/.test(gtext), gtext);
check("guidance mentions Promote and Lead Solutions, LLC (PLS) for RBLP", /Promote and Lead Solutions, LLC \(PLS\)/.test(gtext));
check("guidance tells them to continue after approval", /approved/i.test(gtext));
const afRes = await post(action, { action: "funding.choose", data: { source: "af_ca" } }, student.cookie);
check("air force CA accepted", afRes.ok);

// ---------------------------------------------------------------- tracks
section("Acceptance: worksheets list the right modules per track");
await post(action, { action: "profile.save", data: { track: "RBLP" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("RBLP → modules 1,2,3 (21 tasks)", m.worksheets.modules.map(x=>x.num).join()==="1,2,3" && m.worksheets.progress.required === 21, m.worksheets.progress.required);
await post(action, { action: "profile.save", data: { track: "RBLP-C" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("RBLP-C → modules 1–4 (25 tasks)", m.worksheets.modules.map(x=>x.num).join()==="1,2,3,4" && m.worksheets.progress.required === 25, m.worksheets.progress.required);
await post(action, { action: "profile.save", data: { track: "RBLP-T" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("RBLP-T → modules 1–5 (29 tasks)", m.worksheets.modules.map(x=>x.num).join()==="1,2,3,4,5" && m.worksheets.progress.required === 29, m.worksheets.progress.required);
check("required hours follow the track (T = 5)", m.hours.requiredHours === 5, m.hours);

// ---------------------------------------------------------------- profile + settings
section("Acceptance: their own details, email locked");
m = await (await get(me, student.cookie)).json();
check("the payload carries the name for the greeting", m.profile.displayName === "Pat Jones", m.profile.displayName);
check("and the email that identifies the account", m.profile.email === "pat.jones@example.com");

// The email is the login identity and the key everything hangs off — a rename here would
// orphan the account rather than move it. Nothing in the API may change it.
const emailBefore = DB.pl_students[0].email;
await post(action, { action: "profile.save", data: { display_name: "Pat Jones", email: "someone.else@example.com" } }, student.cookie);
check("profile.save ignores an email in the payload", DB.pl_students[0].email === emailBefore, DB.pl_students[0].email);
const settingsPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the settings form renders email read-only", /<input value="' \+ esc\(p\.email\) \+ '" disabled>/.test(settingsPage));
check("and tells them how to actually change it", /move your account across/.test(settingsPage));

check("the greeting uses the first name only", /function firstName/.test(settingsPage) && /"Hi, " \+ esc\(firstName/.test(settingsPage));

// Funding decides the route, so it must not be editable once the money is confirmed.
check("funding is locked in settings once confirmed", /fundingLocked = ME\.pipeline\.fundingConfirmed/.test(settingsPage));

// ---------------------------------------------------------------- worksheets
section("Worksheets save + progress");
const bad = await post(action, { action: "worksheet.save", data: { task_key: "m9_not_real", story: "x" } }, student.cookie);
check("unknown task key rejected", bad.status === 400);
await post(action, { action: "worksheet.save", data: { task_key: "m1_earn_trust", what: "Competence + integrity", why: "People work harder", life: "My team", story: "When I took over the shop…", status: "ready" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
const saved = m.worksheets.responses.m1_earn_trust;
check("response saved and returned", saved && saved.story.startsWith("When I took over"));
check("progress counts it ready", m.worksheets.progress.ready === 1 && m.worksheets.progress.started === 1);
check("module_num derived from task key", DB.pl_worksheet_responses[0].module_num === 1);
await post(action, { action: "worksheet.save", data: { task_key: "m1_earn_trust", what: "v2", status: "draft" } }, student.cookie);
check("re-save upserts (still one row)", DB.pl_worksheet_responses.length === 1 && DB.pl_worksheet_responses[0].what_text === "v2");

// ---------------------------------------------------------------- research-backed facts
section("Acceptance: exam mechanics from rblp.com, not folklore");
m = await (await get(me, student.cookie)).json();
const facts = m.study.examFacts;
check("results timing is stated", /third business day/i.test(facts.results), facts.results);
check("start times are stated — they collide with a duty day", /09:00 or 11:00/.test(facts.starts), facts.starts);
check("a phone is ruled out", /not a phone/i.test(facts.format), facts.format);
check("scoring is per domain, not an average", /every domain/i.test(facts.scoring), facts.scoring);
check("not passing is addressed honestly", /30 days/.test(facts.retake.detail) && /90 days/.test(facts.retake.detail));
check("and we offer to go back over the missed domains", /included/i.test(facts.retake.ours));
// An old policy page still circulating describes a 180-day wait. Don't let it back in.
check("the withdrawn 180-day retake rule is not used", !/180/.test(JSON.stringify(m.study)));

check("booking is a sequence, not a link", m.study.booking.length >= 7 && m.study.booking.every((b) => b.do && b.why));
check("it warns that logging in first prevents checkout errors",
  m.study.booking.some((b) => /log in/i.test(b.do) && /checkout/i.test(b.why)));
check("it names the completion certificate as a hard gate",
  m.study.booking.some((b) => /certificate/i.test(b.do) && /no exam date|hard gate/i.test(b.why)));
check("it warns about double-clicking add to cart",
  m.study.booking.some((b) => /once/i.test(b.do)));

// Every CA warning exists because RBLP or the Army publish a "don't do this" about it.
check("CA students get the packet warnings", m.funding.caWarnings && m.funding.caWarnings.length >= 5);
check("including the vendor-name mismatch that bounces packets",
  m.funding.caWarnings.some((w) => /vendor name/i.test(w.rule) && /RLS/.test(w.detail)));
check("and not paying out of pocket to hold a seat",
  m.funding.caWarnings.some((w) => /out of pocket/i.test(w.rule)));
const selfPayMe = await (await get(me, payer.cookie)).json();
check("non-CA students aren't shown CA packet warnings", selfPayMe.funding.caWarnings === null);

// The worksheet has to cover what the oral actually tests.
await post(action, { action: "worksheet.save", data: { task_key: "m1_respect", what: "a", why: "b", life: "c", story: "d", notdo: "Interrupting people", plan: "Listen fully in my next 1:1", status: "ready" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
const resp = m.worksheets.responses.m1_respect;
check("the worksheet captures Evaluate — what a leader gets wrong", resp.notdo === "Interrupting people", resp.notdo);
check("and Create — what I'd do with this team", resp.plan === "Listen fully in my next 1:1", resp.plan);
const wsPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("both appear on the printed exam packet", /Not this:/.test(wsPage) && /My plan:/.test(wsPage));

// The instructor is shown how to push, because the exam does.
const mock = (await (await get(consoleEp, boss.cookie)).json()).mockExaminer;
check("the instructor gets mock-examiner follow-ups", mock && mock.prompts.length >= 5);
check("and the line that settles nervous students", /introvert/i.test(mock.anxiety), mock.anxiety);

// Navy/USMC/CG COOL funds the exam, not the class. Saying otherwise costs a student money.
check("the site does not imply COOL covers the training for every branch",
  /fund the <strong[^>]*>exam<\/strong>, not the exam prep|exam<\/strong>, not the exam prep training/.test(
    (await import("node:fs")).readFileSync(ROOT + "index.html", "utf8")));

// ---------------------------------------------------------------- cohort
section("Acceptance: cohort card — Teams link + hours");
const cohortId = randomUUID();
DB.pl_cohorts = [{ id: cohortId, name: "Feb 2026", slug: "26-002", teams_url: "https://teams.microsoft.com/l/meetup-join/abc", classroom_status: "open", instructor_email: "instructor@promoteandlead.com", created_at: new Date().toISOString() }];
DB.pl_cohort_members = [{ id: randomUUID(), cohort_id: cohortId, email: "pat.jones@example.com", name: "Pat Jones", rblp_type: "RBLP-C", status: "applied", created_at: new Date().toISOString() }];
const sess1 = randomUUID(), sess2 = randomUUID();
DB.pl_cohort_sessions = [
  { id: sess1, cohort_id: cohortId, label: "Saturday session", starts_at: "2026-03-07T15:00:00Z", ends_at: "2026-03-07T20:30:00Z", instructional_minutes: 240 },
  { id: sess2, cohort_id: cohortId, label: "Make-up", starts_at: "2026-03-14T15:00:00Z", ends_at: null, instructional_minutes: 60 }
];
DB.pl_module_passwords = [{ year_month: new Date().toISOString().slice(0,7), password: "LEADFEB26" }];

m = await (await get(me, student.cookie)).json();
check("cohort card shows slug 26-002", m.cohort && m.cohort.slug === "26-002");
check("cohort card shows Teams URL", m.cohort.teamsUrl === "https://teams.microsoft.com/l/meetup-join/abc");
check("roster rblp_type overrides self-selected track", m.profile.track === "RBLP-C" && m.profile.trackLocked === true);
check("worksheets follow the cohort track (25 tasks)", m.worksheets.progress.required === 25);
check("required hours now 4 for RBLP-C", m.hours.requiredHours === 4);
check("month password surfaced", m.modulePassword.password === "LEADFEB26");
check("two sessions listed", m.cohort.sessions.length === 2);
check("pipeline: enrolled is done", m.pipeline.steps.find(s=>s.key==="enrolled").done === true);

// ---------------------------------------------------------------- instructor
section("Acceptance: instructor marks attendance and sees the roster");
DB.pl_students.push({ id: randomUUID(), email: "instructor@promoteandlead.com", display_name: "Coach", role: "instructor", created_at: new Date().toISOString() });
const instructor = await signIn("instructor@promoteandlead.com");
const cRes = await get(consoleEp, instructor.cookie);
check("instructor can open the console", cRes.ok);
let con = await cRes.json();
check("instructor sees only their cohort", con.cohorts.length === 1 && con.cohorts[0].slug === "26-002");
check("roster row present with track + worksheet %", con.cohorts[0].roster.length === 1 && con.cohorts[0].roster[0].track === "RBLP-C");
check("roster shows worksheet completion, not answers", JSON.stringify(con).includes("When I took over") === false);
check("roster surfaces RBLP-applied flag", con.cohorts[0].roster[0].rblpApplied === true);

const att = await post(action, { action: "attendance.mark", data: { cohort_id: cohortId, session_id: sess1, student_email: "pat.jones@example.com", present: true, minutes: 240 } }, instructor.cookie);
check("attendance marked", att.ok);
m = await (await get(me, student.cookie)).json();
check("student sees 4.0 of 4 hours", m.hours.attendedHours === 4 && m.hours.percent === 100, m.hours);
check("pipeline: attend now done", m.pipeline.steps.find(s=>s.key==="attend").done === true);

// ---------------------------------------------------------------- certificate
section("Acceptance: CA completion certificate");
m = await (await get(me, student.cookie)).json();
check("certificate withheld until the step is done", m.certificate.available === false, m.certificate);

// Tommy's CRM marks the member certified; that's what issues it.
DB.pl_cohort_members[0].certified_on = "2026-03-07";
await post(action, { action: "profile.save", data: { display_name: "Pat Jones" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
const cert = m.certificate;
check("certificate available once certified with a name on file", cert.available === true, cert);
check("certificate names the student", cert.name === "Pat Jones");
check("certificate carries the track the student actually took", cert.track === "RBLP-C" && cert.modules === 4, [cert.track, cert.modules]);
check("certificate states the contact hours for that track", cert.hours === 4, cert.hours);
check("certificate shows the cohort", cert.cohortSlug === "26-002", cert.cohortSlug);
check("certificate is dated the day it was issued, not today", cert.issuedOn === "2026-03-07", cert.issuedOn);

// Which company is named decides whether a CA claim matches the paperwork.
check("CA student's certificate names RLS", cert.org.short === "RLS" && cert.org.name === "Resilient Leadership Solutions", cert.org);
await post(action, { action: "funding.choose", data: { source: "af_ca" } }, student.cookie);
check("Air Force CA also names RLS", (await (await get(me, student.cookie)).json()).certificate.org.short === "RLS");
await post(action, { action: "funding.choose", data: { source: "self_pay" } }, student.cookie);
m = await (await get(me, student.cookie)).json();
check("self-pay student's certificate names PLS", m.certificate.org.short === "PLS" && m.certificate.org.name === "Promote and Lead Solutions, LLC", m.certificate.org);
await post(action, { action: "funding.choose", data: { source: "navy_cool" } }, student.cookie);
check("COOL student's certificate names PLS (COOL pays the exam, not us)", (await (await get(me, student.cookie)).json()).certificate.org.short === "PLS");
await post(action, { action: "funding.choose", data: { source: "army_ca" } }, student.cookie);

// Levels: the module count on the certificate is the whole point of this change.
const CERT_LEVELS = { RBLP: [3, 3], "RBLP-C": [4, 4], "RBLP-T": [5, 5] };
for (const [trk, [mods, hrs]] of Object.entries(CERT_LEVELS)) {
  DB.pl_cohort_members[0].rblp_type = trk;
  const cm = (await (await get(me, student.cookie)).json()).certificate;
  check(`${trk} certificate reads ${mods} modules / ${hrs} hours`, cm.track === trk && cm.modules === mods && cm.hours === hrs, [cm.track, cm.modules, cm.hours]);
}
DB.pl_cohort_members[0].rblp_type = "RBLP-C";

// A certificate with no name on it is useless to a CA office.
const priorName = DB.pl_students[0].display_name;
DB.pl_students[0].display_name = "";
m = await (await get(me, student.cookie)).json();
check("no name on file: certificate withheld and the student is told why", m.certificate.available === false && m.certificate.needsName === true, m.certificate);
DB.pl_students[0].display_name = priorName;

// A certificate dated a day early is a rejected CA claim. certified_on is a bare calendar
// date, and Date() reads those as UTC midnight, so formatting in America/Chicago used to roll
// them back a day. Pull the real formatter out of the page and hold it to the line.
const certJs = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8")
  .match(/<script>([\s\S]*?)<\/script>/)[1];
const grabFn = (n) => {
  const i = certJs.indexOf("function " + n + "(");
  let depth = 0;
  for (let k = certJs.indexOf("{", i); k < certJs.length; k++) {
    if (certJs[k] === "{") depth++;
    else if (certJs[k] === "}" && --depth === 0) return certJs.slice(i, k + 1);
  }
};
const fmt = new Function(
  certJs.match(/var DATE_ONLY[\s\S]*?var MONTHS = \[[^\]]*\];/)[0] + grabFn("fmtCertDay") + "; return fmtCertDay;"
)();
check("certificate date is not shifted a day by the timezone", fmt("2026-03-07") === "7 March 2026", fmt("2026-03-07"));
check("certificate date reads day-month-year like the template", fmt("2026-10-03") === "3 October 2026", fmt("2026-10-03"));
check("new year's day doesn't roll back into the previous year", fmt("2026-01-01") === "1 January 2026", fmt("2026-01-01"));

// The certificate page ships the assets it references, and the licence guard still holds.
const certFs = await import("node:fs");
const certPage = certFs.readFileSync(ROOT + "classroom/index.html", "utf8");
check("certificate assets referenced by the page exist in the repo",
  ["/assets/cert/rls-logo.png", "/assets/logo-full.png", "/assets/cert/rblp-atp-seal.jpg"].every(
    (a) => certFs.existsSync(ROOT + a.slice(1))) && certPage.includes("/assets/cert/rblp-atp-seal.jpg"));
check("the letterhead logo matches the organisation named in the body",
  certificateOrg("army_ca").logo === "/assets/cert/rls-logo.png" &&
  certificateOrg("self_pay").logo === "/assets/logo-full.png");
check("the internal build-out guides are not committed (Pages would serve them publicly)",
  execSyncCert("git ls-files 'Classroom resources'", { cwd: ROOT }).toString().trim() === "");
check("the PowerPoint template itself is not committed (Pages would serve it publicly)",
  execSyncCert("git ls-files 'Cert templates'", { cwd: ROOT }).toString().trim() === "");

// ---------------------------------------------------------------- study aids
section("Acceptance: study aids + exam facts");
m = await (await get(me, student.cookie)).json();
check("every module the student sees carries its self-check",
  m.worksheets.modules.every((mm) => mm.study && mm.study.selfCheck.length >= 3 && mm.study.success), m.worksheets.modules.map((x) => x.num));
check("study habits and the module arc reach the student",
  m.study.habits.terms.length && m.study.habits.stories.length && m.study.arc.length === 5);
check("exam-day mindset and prep checklist reach the student",
  m.study.exam.mindset.length >= 4 && m.study.exam.checklist.length >= 6);
check("we don't tell candidates what they may hold during the oral — RBLP's rules govern",
  /RBLP/.test(m.study.exam.note) && !m.study.exam.checklist.some((x) => /you may have|allowed to have/i.test(x)));

// We can't force the prep work, so the case for it has to be in front of them wherever they
// decide whether to bother — and the exam has to be described as what it is, or they prepare
// for the wrong thing.
check("the student is told what they get out of the prep work",
  m.study.whyPrep && m.study.whyPrep.chain.length === 3 && /put in/i.test(m.study.whyPrep.headline));
check("the chain runs prep -> session -> exam",
  m.study.whyPrep.chain.map((c) => c.at).join(" > ") === "Prep work > The live session > The exam",
  m.study.whyPrep.chain.map((c) => c.at));
const truth = m.study.whyPrep.examTruth;
check("the exam is explicitly not an essay or a box-ticking test",
  /essay/i.test(truth.isNot) && /(multiple choice|box)/i.test(truth.isNot), truth.isNot);
check("and is described as a conversation that probes understanding",
  /conversation/i.test(truth.is) && /understand/i.test(truth.is), truth.is);
check("it warns that memorised lines don't survive", /memoris|memoriz/i.test(truth.how), truth.how);

// RBLP publishes reflection hours per credential; naming the number makes prep a standard
// rather than a nag, and it must match what the marketing site advertises.
const REFLECTION = { RBLP: 6, "RBLP-C": 8, "RBLP-T": 10 };
check("each track carries its published reflection hours",
  Object.entries(REFLECTION).every(([t, h]) => m.tracks[t].reflectionHours === h),
  Object.entries(m.tracks).map(([t, v]) => t + "=" + v.reflectionHours));
const siteSrc = (await import("node:fs")).readFileSync(ROOT + "index.html", "utf8");
check("the site advertises the same reflection hours",
  Object.entries(REFLECTION).every(([, h]) => siteSrc.includes(h + " hrs reflection")), "site/classroom mismatch");
const prepPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the case for prep appears on the prep page, the exam page and home",
  (prepPage.match(/whyPrepHtml\(/g) || []).length >= 4, (prepPage.match(/whyPrepHtml\(/g) || []).length);

// The oral is a different length per credential. This was hardcoded to the Trainer's 2.5h,
// which told every RBLP candidate to expect an hour more than they'll actually sit.
const EXAM_HOURS = { RBLP: 1.5, "RBLP-C": 2, "RBLP-T": 2.5 };
check("each track carries its own operational oral length",
  Object.entries(EXAM_HOURS).every(([t, h]) => m.tracks[t].examHours === h),
  Object.entries(m.tracks).map(([t, v]) => t + "=" + v.examHours));
check("the exam page no longer hardcodes the Trainer length for everyone",
  !/RBLP-T orals run about/.test((await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8")));

// Saturday windows and payback hours are the academy-locked shapes; the withdrawn 8h Trainer
// figure must not creep back in.
check("track windows match the locked academy day shapes",
  m.tracks.RBLP.window === "09:00–12:30" && m.tracks["RBLP-C"].window === "09:00–14:30" && m.tracks["RBLP-T"].window === "09:00–15:30");
check("payback hours still 3 / 4 / 5",
  m.tracks.RBLP.paybackHours === 3 && m.tracks["RBLP-C"].paybackHours === 4 && m.tracks["RBLP-T"].paybackHours === 5);

// The step says "upload on your branch's site", so it has to give them that site. RBLP's page
// explains HOW; the portal is WHERE. Both, numbered, in that order.
const gArmy = (await import(`file://${R}/_lib/classroom.js`)).fundingGuidance("army_ca");
const gAf = (await import(`file://${R}/_lib/classroom.js`)).fundingGuidance("af_ca");
check("Army students get ArmyIgnitED, on an army.mil domain",
  gArmy.portal.name === "ArmyIgnitED" && /^https:\/\/www\.armyignited\.army\.mil\//.test(gArmy.portal.url), gArmy.portal);
check("Air Force students get AFVEC, on an af.mil domain",
  gAf.portal.name === "AFVEC" && /af\.mil/.test(gAf.portal.url), gAf.portal);
check("the branches don't get each other's portal", gArmy.portal.url !== gAf.portal.url);
check("AFVEC tells them where AF COOL actually sits", /Education Programs/.test(gAf.portal.hint));
check("the instructions still point at RBLP's guide per branch",
  /rblp\.com\/follow-these-steps-to-use-army/.test(gArmy.link) && /air-force/.test(gAf.link));
const portalPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the step offers instructions then portal, numbered",
  /1\. Read the step-by-step/.test(portalPage) && /2\. Open ' \+ esc\(g\.portal\.name\)/.test(portalPage));
check("non-CA funding has no portal to open", !(await import(`file://${R}/_lib/classroom.js`)).fundingGuidance("self_pay").portal);

// ---------------------------------------------------------------- who to chase
section("Acceptance: chase the right people");
m = await (await get(me, student.cookie)).json();
check("RBLP's own support details reach the student",
  m.rblpSupport && /@rblp\.com$/.test(m.rblpSupport.email) && m.rblpSupport.phone, m.rblpSupport);
const chasePage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
// Invoices are RBLP's to raise; routing the chase through us just adds a day.
check("missing invoices send the student to RBLP, not to us",
  /Nothing after a week\?<\/b> RBLP raise these/.test(chasePage) &&
  /mailto:' \+ esc\(r\.email\)/.test(chasePage));
check("but we still ask to be told, so it shows up as stalled",
  /Tell us too/.test(chasePage) && /info@promoteandlead\.com/.test(chasePage));
check("the old 'email us and we'll chase it' copy is gone",
  !/Email <a href="mailto:info@promoteandlead\.com">info@promoteandlead\.com<\/a> and we\\'ll chase it/.test(chasePage));

// ---------------------------------------------------------------- run of day
section("Acceptance: one cohort day, planned for Trainers");
const CURRIC = await import(`file://${R}/_lib/curriculum.js`);
const { runOfDay, dayFor, COHORT_DAY, addMinutes, TRACKS: CURRIC_TRACKS } = CURRIC;
const mins = (t) => { const [h, mm2] = t.split(":").map(Number); return h * 60 + mm2; };

check("there is one shared day, not a day per track",
  COHORT_DAY.filter((b) => b.kind === "module").map((b) => b.module).join() === "1,2,3,4,5");
check("the day runs 09:00 to 15:30 — the Trainer window",
  COHORT_DAY[0].at === "09:00" &&
  addMinutes(COHORT_DAY[COHORT_DAY.length - 1].at, COHORT_DAY[COHORT_DAY.length - 1].minutes) === "15:30");
check("the blocks are contiguous — no gaps, no overlaps",
  COHORT_DAY.every((b, i) => i === 0 || mins(b.at) === mins(addMinutes(COHORT_DAY[i - 1].at, COHORT_DAY[i - 1].minutes))));
check("every module gets an equal 60-minute slot",
  COHORT_DAY.filter((b) => b.kind === "module").every((b) => b.minutes === 60));
check("two 15-minute breaks and one hour of lunch",
  COHORT_DAY.filter((b) => b.kind === "break").length === 2 &&
  COHORT_DAY.filter((b) => b.kind === "break").every((b) => b.minutes === 15) &&
  COHORT_DAY.filter((b) => b.kind === "lunch").length === 1 &&
  COHORT_DAY.find((b) => b.kind === "lunch").minutes === 60);
check("no break sits inside a module, and no two run back to back",
  COHORT_DAY.every((b, i) => b.kind === "module" || i === 0 || COHORT_DAY[i - 1].kind === "module"));

// Each credential takes what it claims, and lands inside its published window.
for (const [trk, cfg] of Object.entries(CURRIC_TRACKS)) {
  const d = dayFor(trk);
  check(`${trk}: taught minutes equal the credential hours the ATP claims`,
    d.taughtMinutes === cfg.paybackHours * 60, [d.taughtMinutes, cfg.paybackHours * 60]);
  check(`${trk}: finishes within its published window`,
    mins(d.end) <= mins(cfg.window.split("–")[1]), [d.end, cfg.window]);
  check(`${trk}: everybody starts together at 09:00`, d.start === "09:00");
  check(`${trk}: sees every module of its track and none beyond`,
    runOfDay(trk).filter((b) => b.mine && b.kind === "module").map((b) => b.module).join() === cfg.modules.join());
}

// THE constraint: a student's last module must be followed by a break or lunch, so they leave
// at a natural stopping point rather than packing up mid-session. If the breaks ever move,
// this is what must not break.
for (const trk of ["RBLP", "RBLP-C"]) {
  const last = CURRIC_TRACKS[trk].modules[CURRIC_TRACKS[trk].modules.length - 1];
  const i = COHORT_DAY.findIndex((b) => b.kind === "module" && b.module === last);
  const next = COHORT_DAY[i + 1];
  check(`${trk} students leave into a break, not out of a session`,
    !!next && next.kind !== "module", next && next.kind);
}
check("Trainers finish at the end of the day", dayFor("RBLP-T").end === "15:30");

// A mixed cohort means one session row whose instructional_minutes is the WHOLE Trainer day.
// Ticking "present" must credit the student's own track, or a P banks 5 hours for a 3-hour day
// and the ATP claim is overstated.
const fullDay = [{ id: "sx", instructional_minutes: 300 }];
const presentNoMinutes = [{ session_id: "sx", present: true, minutes: null }];
for (const [trk, hrs] of [["RBLP", 3], ["RBLP-C", 4], ["RBLP-T", 5]]) {
  const h = (await import(`file://${R}/_lib/classroom.js`)).hoursProgress(trk, fullDay, presentNoMinutes);
  check(`${trk} marked present on the full day banks ${hrs}h, not the room's 5h`,
    h.attendedHours === hrs && h.percent === 100, h);
}
// The instructor only ever presses Present or Absent — no minutes box, because a typed number
// on something that feeds a CA claim is a number waiting to be wrong.
const attPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the attendance table has no minutes input", !/data-min=/.test(attPage));
check("marking attendance sends no minutes", !/attendance\.mark", \{ cohort_id: c\.id, session_id: p\[0\], student_email: p\[1\], present: p\[2\] === "1", minutes/.test(attPage));

// A stale or mis-entered session length must never cap or inflate what a credential claims.
const shortRow = [{ id: "sy", instructional_minutes: 240 }];
const trainerOnShortRow = (await import(`file://${R}/_lib/classroom.js`))
  .hoursProgress("RBLP-T", shortRow, [{ session_id: "sy", present: true }]);
check("a Trainer still banks 5h even if the session row says 4",
  trainerOnShortRow.attendedHours === 5, trainerOnShortRow);
const rblpOnLongRow = (await import(`file://${R}/_lib/classroom.js`))
  .hoursProgress("RBLP", [{ id: "sy", instructional_minutes: 300 }], [{ session_id: "sy", present: true }]);
check("an RBLP still banks only 3h on the full Trainer day", rblpOnLongRow.attendedHours === 3, rblpOnLongRow);

const earlyExit = (await import(`file://${R}/_lib/classroom.js`))
  .hoursProgress("RBLP-C", fullDay, [{ session_id: "sx", present: true, minutes: 150 }]);
check("an explicitly recorded figure still wins over the track default",
  earlyExit.attendedMinutes === 150 && earlyExit.percent === 63, earlyExit);

// The student sees the whole day with their own part marked — the rest stays visible so they
// know why their neighbour is still sitting there.
m = await (await get(me, student.cookie)).json();
check("the student gets the full cohort day, not just their slice", m.day.blocks.length === COHORT_DAY.length);
check("their own blocks are marked, and the later ones are not",
  m.day.blocks.some((b) => b.mine) && m.day.blocks.some((b) => !b.mine));
check("exactly one block is flagged as where they finish",
  m.day.blocks.filter((b) => b.finish).length === 1);
check("RBLP-C finishes after module 4 at 14:15",
  m.profile.track === "RBLP-C" && m.day.mine.end === "14:15" && m.day.mine.taughtMinutes === 240, m.day.mine);

check("the per-module teach sequences fit the 60 minutes they actually have",
  Object.values(CURRIC.MODULE_TEACHING)
    .every((mt) => Number(mt.sequence[mt.sequence.length - 1][0].split("–")[1]) === 60));

// ---------------------------------------------------------------- onboarding
section("Acceptance: a new account knows what it's choosing, and where to go next");
m = await (await get(me, student.cookie)).json();
check("every level explains who it's for", Object.values(m.tracks).every((t) => t.who && t.about && t.experience && t.covers),
  Object.entries(m.tracks).filter(([, t]) => !t.who).map(([k]) => k));
check("the level descriptions match the marketing site's wording",
  /First-line and aspiring supervisors/.test(m.tracks.RBLP.who) && /Senior managers/.test(m.tracks["RBLP-T"].who));
check("warrant officers are pointed at Coach and Trainer, where RBLP puts them",
  /W1–W3/.test(m.tracks["RBLP-C"].who) && /W3–W5/.test(m.tracks["RBLP-T"].who));

const onboard = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the picker explains the selected level inline, not on hover",
  /function trackPicker/.test(onboard) && /track-why/.test(onboard) && !/title="[^"]*Typically/.test(onboard));
check("and lets them compare all three", /Compare all three/.test(onboard));
check("both the journey step and settings use the same picker",
  (onboard.match(/trackPicker\(/g) || []).length >= 3, (onboard.match(/trackPicker\(/g) || []).length);

// A new account used to be sent to Settings, fill the form, and sit there.
check("a nameless new student is sent into the journey, not settings",
  /data-go="pipeline">Get started<\/button>/.test(onboard) && !/data-go="settings">Add my details/.test(onboard));
check("saving from settings during onboarding carries them to the journey",
  /wasOnboarding/.test(onboard) && /ACTIVE = "pipeline"/.test(onboard));

// ---------------------------------------------------------------- teaching guide
section("Acceptance: instructor teaching guide");
const guide = await (await get(consoleEp, instructor.cookie)).json();
const guideTasks = guide.outline.flatMap((mm) => mm.tasks);
check("every leader task has coaching for the instructor", guideTasks.length === 29 && guideTasks.every((t) => t.coaching), guideTasks.filter((t) => !t.coaching).map((t) => t.key));
check("each task gives an opening, an example to model, and a question to ask",
  guideTasks.every((t) => t.coaching.open && t.coaching.model && t.coaching.ask));
check("every module has an opening frame", guide.outline.every((mm) => mm.opening));
// The SOP's own model prompt is an imperative ("Talk about climate in a job you had…"), so
// accept that form alongside a straight question — what matters is that it's one applied
// prompt to put to the room, not a list to read out.
check("each prompt is a single applied question or 'talk about' opener",
  guideTasks.every((t) => (/\?$/.test(t.coaching.ask) || /^Talk about /.test(t.coaching.ask)) && !t.coaching.ask.includes("\n")),
  guideTasks.filter((t) => !(/\?$/.test(t.coaching.ask) || /^Talk about /.test(t.coaching.ask))).map((t) => t.key));
check("the modelled example is attributed, so nobody reads it out as their own",
  guideTasks.every((t) => /^Tommy:/.test(t.coaching.model)));

// Tommy's stories and coaching are instructor material. Students get their own worksheets.
const studentPayload = JSON.stringify(await (await get(me, student.cookie)).json());
check("every module gives the instructor a timebox, workplace translations, misses and oral angles",
  guide.outline.every((mm) => mm.teaching && mm.teaching.sequence.length && mm.teaching.civilian.length &&
    mm.teaching.misses.length && mm.teaching.angles.length), guide.outline.filter((mm) => !mm.teaching).map((mm) => mm.num));
check("the instructor gets the one shared day, with each track's departure marked",
  guide.day.blocks.length === 8 && guide.day.blocks.filter((b) => b.finishes).length === 3);
check("the instructor is told when each track leaves and how long it's taught",
  Object.keys(CURRIC_TRACKS).every((t) => guide.day.tracks[t] && guide.day.tracks[t].end));
check("the instructor is warned the room shrinks after lunch", /after lunch/i.test(guide.day.notes.instructor));
check("the session rhythm and facilitation cards are on the console",
  guide.rhythm.length === 5 && guide.cards.length >= 5 && !!guide.mixedCohorts);
check("oral angles are framed as coverage, not an answer key",
  guide.outline.every((mm) => mm.teaching.angles.every((a) => a.length < 90)));
check("coaching never reaches the student payload",
  !studentPayload.includes("Ask the room") && !guideTasks.some((t) => studentPayload.includes(t.coaching.model)));
check("instructor guide is gated with the rest of the console (student gets 403)",
  (await get(consoleEp, student.cookie)).status === 403);

// An instructor who isn't enrolled has no pipeline, worksheets or exam of their own.
const tabSrc = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8")
  .match(/<script>([\s\S]*?)<\/script>/)[1];
const tabFn = (state) => {
  const src = tabSrc.slice(tabSrc.indexOf("function tabList()"));
  const end = src.indexOf("\n}") + 2;
  return new Function("ME", "CONSOLE", src.slice(0, end) + "; return tabList();")(state.ME, state.CONSOLE);
};
const keysOf = (tabs) => tabs.map((t) => t[0]);
const staffTabs = keysOf(tabFn({ ME: { cohort: null, profile: { role: "instructor" } }, CONSOLE: { role: "instructor" } }));
check("unenrolled instructor doesn't get the student tabs",
  !staffTabs.some((k) => ["home", "pipeline", "worksheets", "cohort", "exam"].includes(k)), staffTabs);
check("unenrolled instructor does get the teaching guide and console",
  staffTabs.includes("teaching") && staffTabs.includes("instructor"), staffTabs);
const enrolledStaff = keysOf(tabFn({ ME: { cohort: { slug: "26-002" }, profile: { role: "admin" } }, CONSOLE: { role: "admin" } }));
check("an instructor who IS enrolled keeps their own student tabs",
  ["home", "pipeline", "worksheets", "cohort", "exam", "teaching", "instructor", "admin"].every((k) => enrolledStaff.includes(k)), enrolledStaff);
const plainStudent = keysOf(tabFn({ ME: { cohort: null, profile: { role: "student" } }, CONSOLE: null }));
check("a student with no cohort yet still sees their own journey",
  plainStudent.includes("home") && plainStudent.includes("pipeline") && !plainStudent.includes("teaching"), plainStudent);

// ---------------------------------------------------------------- module access
section("Acceptance: the door and the key together");
// The password rotates monthly and the classroom is the only reliable place to find the
// current one, so the email must not send people to rblp.com ahead of it.
const caEmail = SENT.filter((x) => /prep work is open/.test(x.subject)).pop();
check("the CA-approved email exists", !!caEmail);
check("it sends them to the classroom, not to rblp.com",
  /promoteandlead\.com\/classroom/.test(caEmail.html) && !/>rblp\.com</.test(caEmail.html), caEmail.html.match(/href="[^"]*"/g));
check("and says the classroom carries the password and the link",
  /Start in your classroom/.test(caEmail.html) && /password/.test(caEmail.html));

// The password shown is whichever month it is now, from the admin's stored list.
const { monthKey: mk } = await import(`file://${R}/_lib/classroom.js`);
DB.pl_module_passwords = [
  { year_month: mk(), password: "THISMONTH" },
  { year_month: "2020-01", password: "ANCIENT" }
];
m = await (await get(me, student.cookie)).json();
check("the student sees this month's password, not an old one",
  m.modulePassword.password === "THISMONTH" && m.modulePassword.yearMonth === mk(), m.modulePassword);
DB.pl_module_passwords = [{ year_month: "2020-01", password: "ANCIENT" }];
m = await (await get(me, student.cookie)).json();
check("a month with nothing loaded shows no password rather than a stale one",
  m.modulePassword.password === null, m.modulePassword);

const accessPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the prep page puts the password and the RBLP link together",
  /function modulesAccessHtml/.test(accessPage) &&
  /rblp\.com\/exam-prep-training/.test(accessPage) && /id="mpCopy"/.test(accessPage));
check("it points at the exam prep page, not RBLP's front door",
  !/href="https:\/\/rblp\.com\/"/.test(accessPage));

// ---------------------------------------------------------------- referrals
section("Acceptance: who brought this student");
// Making someone an instructor issues their share link — referral pay needs a mechanism.
const instId = DB.pl_students.find((x) => x.email === "instructor@promoteandlead.com").id;
await post(action, { action: "student.role", data: { id: instId, role: "instructor" } }, boss.cookie);
const instRow = DB.pl_students.find((x) => x.id === instId);
check("becoming an instructor issues a referral code", !!instRow.referral_code, instRow.referral_code);
const { referralLink: mkLink } = await import(`file://${R}/_lib/classroom.js`);
check("the link is a real classroom URL carrying the code",
  /^https:\/\/promoteandlead\.com\/classroom\/\?ref=/.test(mkLink(instRow.referral_code)));

// The link path: the code rides to account creation and is stamped there.
const viaLink = await (async () => {
  await post(auth, { action: "request-code", email: "via.link@example.com" });
  const c = /\b(\d{6})\b/.exec(SENT[SENT.length - 1].subject)[1];
  const r = await post(auth, { action: "verify-code", email: "via.link@example.com", code: c, ref: instRow.referral_code });
  return { cookie: r.headers.get("set-cookie").split(";")[0] };
})();
const linkStudent = DB.pl_students.find((x) => x.email === "via.link@example.com");
check("a student arriving on the link is attributed to that instructor",
  linkStudent.referred_by === instId && linkStudent.referred_via === "link", linkStudent.referred_via);

// A bogus code must attribute to nobody rather than erroring or guessing.
await post(auth, { action: "request-code", email: "bad.ref@example.com" });
const bc = /\b(\d{6})\b/.exec(SENT[SENT.length - 1].subject)[1];
await post(auth, { action: "verify-code", email: "bad.ref@example.com", code: bc, ref: "not-a-real-code" });
check("an unknown code attributes to nobody", !DB.pl_students.find((x) => x.email === "bad.ref@example.com").referred_by);

// The fallback, for anyone who signed up without the link.
const noLink = await signIn("no.link@example.com");
let nlMe = await (await get(me, noLink.cookie)).json();
check("a student with no attribution is offered the instructor list", Array.isArray(nlMe.instructors) && nlMe.instructors.length >= 1);
check("naming an instructor records it",
  (await post(action, { action: "referral.name", data: { instructor_id: instId } }, noLink.cookie)).ok &&
  DB.pl_students.find((x) => x.email === "no.link@example.com").referred_via === "named");
check("but only once — it decides who gets paid",
  (await post(action, { action: "referral.name", data: { instructor_id: instId } }, noLink.cookie)).status === 400);
nlMe = await (await get(me, noLink.cookie)).json();
check("and once set, the list stops being offered", nlMe.instructors === null);
check("a student can't be attributed to a non-instructor",
  (await post(action, { action: "referral.name", data: { instructor_id: DB.pl_students[0].id } }, (await signIn("self.ref@example.com")).cookie)).status === 400);

// Corrections move money, so they're admin-only.
check("a student cannot reassign their own referrer",
  (await post(action, { action: "student.referral", data: { id: linkStudent.id, instructor_id: null } }, noLink.cookie)).status === 403);
check("an admin can", (await post(action, { action: "student.referral", data: { id: linkStudent.id, instructor_id: instId } }, boss.cookie)).ok);

// The instructor sees their own link and pipeline; the admin sees and can change attribution.
const instCon = await (await get(consoleEp, instructor.cookie)).json();
check("the instructor gets their link", instCon.referrals && /ref=/.test(instCon.referrals.link || ""), instCon.referrals);
check("and the students it brought", instCon.referrals.students.some((r) => r.email === "via.link@example.com"),
  instCon.referrals.students.map((r) => r.email));
const adminRef = await (await get(consoleEp, boss.cookie)).json();
check("the admin can pick a referrer per student", (adminRef.admin.instructorList || []).length >= 1);
// (the admin reassignment just above rewrites that student's `via` to "admin", by design)
check("and sees how each attribution was made",
  adminRef.admin.students.filter((x) => x.referredBy).every((x) => ["link", "named", "admin"].includes(x.referredVia)),
  adminRef.admin.students.filter((x) => x.referredBy).map((x) => x.referredVia));
check("reassigning by hand is recorded as such",
  adminRef.admin.students.some((x) => x.referredVia === "admin"));

// ---------------------------------------------------------------- placing students
section("Acceptance: the admin can actually run cohorts");
const placeMe = await signIn("place.me@example.com");
await post(action, { action: "profile.save", data: { display_name: "Pat Place", track: "RBLP-T" } }, placeMe.cookie);
await post(action, { action: "funding.choose", data: { source: "army_ca" } }, placeMe.cookie);
const placeId = DB.pl_students.find((x) => x.email === "place.me@example.com").id;

let pm2 = await (await get(me, placeMe.cookie)).json();
check("before placement the student has no cohort", pm2.cohort === null);

const cohortsBefore = DB.pl_cohorts.length;
check("admin can create a cohort from the classroom",
  (await post(action, { action: "cohort.create", data: { name: "Nov 2026", slug: "26-004", session_date: "2026-11-07", capacity: 6 } }, boss.cookie)).ok &&
  DB.pl_cohorts.length === cohortsBefore + 1);
check("a cohort needs a name", (await post(action, { action: "cohort.create", data: { slug: "x" } }, boss.cookie)).status === 400);
const newCohort = DB.pl_cohorts.find((c) => c.slug === "26-004");

// A cohort IS its Saturday — asking for the date at creation and again under Sessions was the
// same question twice.
const madeSessions = DB.pl_cohort_sessions.filter((x) => x.cohort_id === newCohort.id);
check("creating a cohort with a date creates its session", madeSessions.length === 1, madeSessions.length);
const cs = madeSessions[0];
const inChicago = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false, hour: "2-digit", minute: "2-digit" });
check("the session runs 09:00 to 15:30 Central, whatever the admin's own timezone",
  inChicago(cs.starts_at) === "09:00" && inChicago(cs.ends_at) === "15:30", [inChicago(cs.starts_at), inChicago(cs.ends_at)]);
check("with the taught minutes from the day shape, not typed in", cs.instructional_minutes === 300, cs.instructional_minutes);

// Extra sittings still possible, same shape, date only.
check("an extra session can be added by date alone",
  (await post(action, { action: "session.addStandard", data: { cohort_id: newCohort.id, date: "2026-11-14" } }, boss.cookie)).ok &&
  DB.pl_cohort_sessions.filter((x) => x.cohort_id === newCohort.id).length === 2);
check("a session needs a real date",
  (await post(action, { action: "session.addStandard", data: { cohort_id: newCohort.id, date: "soon" } }, boss.cookie)).status === 400);

// Three fields that could only ever be set wrong are gone from the cohort form.
const cohortForm = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("no manual start/end time entry", !/data-s="starts"/.test(cohortForm) && !/data-s="ends"/.test(cohortForm));
check("no tracks-allowed checkboxes — every cohort takes all three", !/data-track=/.test(cohortForm));
check("no module password month override — it follows the month", !/password_month_key/.test(cohortForm));
check("the instructor is chosen from the instructor accounts, not typed",
  /<select data-f="instructor_email">/.test(cohortForm));
check("and each instructor shows which cohorts they're on",
  /cohorts: cohorts\.filter/.test((await import("node:fs")).readFileSync(ROOT + "functions/api/classroom/console.js", "utf8")));

check("placing a student works", (await post(action, { action: "member.place", data: { student_id: placeId, cohort_id: newCohort.id } }, boss.cookie)).ok);
pm2 = await (await get(me, placeMe.cookie)).json();
check("and the student sees their cohort", pm2.cohort && pm2.cohort.slug === "26-004", pm2.cohort);
// Placement mirrors the classroom profile onto the roster so nothing is retyped.
const placedRow = DB.pl_cohort_members.find((mm) => mm.email === "place.me@example.com");
check("their track and funding carry across", placedRow.rblp_type === "RBLP-T" && placedRow.payment_type === "CA", placedRow);
check("so does their name", placedRow.name === "Pat Place");
check("the journey's enrolled step is now done",
  pm2.pipeline.steps.find((st) => st.key === "enrolled").done === true);

// Moving between cohorts must not leave them on two rosters.
const other = DB.pl_cohorts.find((c) => c.slug === "26-002") || DB.pl_cohorts[0];
await post(action, { action: "member.place", data: { student_id: placeId, cohort_id: other.id } }, boss.cookie);
check("moving cohorts doesn't duplicate the roster row",
  DB.pl_cohort_members.filter((mm) => mm.email === "place.me@example.com").length === 1);

await post(action, { action: "member.place", data: { student_id: placeId, cohort_id: null } }, boss.cookie);
check("and they can be removed", DB.pl_cohort_members.filter((mm) => mm.email === "place.me@example.com").length === 0);

check("only an admin can place students",
  (await post(action, { action: "member.place", data: { student_id: placeId, cohort_id: newCohort.id } }, placeMe.cookie)).status === 403);
check("and only an admin can create cohorts",
  (await post(action, { action: "cohort.create", data: { name: "nope" } }, instructor.cookie)).status === 403);

// There are no passwords; the equivalent is sending them a fresh one-time code.
const codeBefore = SENT.length;
const codeRes = await (await post(action, { action: "student.sendCode", data: { id: placeId } }, boss.cookie)).json();
check("admin can send a student a fresh sign-in code", codeRes.ok && SENT.length === codeBefore + 1);
check("the code goes to the student, never to the admin",
  SENT[SENT.length - 1].to === "place.me@example.com", SENT[SENT.length - 1].to);
check("it's a real usable code", /\b\d{6}\b/.test(SENT[SENT.length - 1].subject));

const adminUi = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the admin table offers a cohort dropdown per student", /data-place="/.test(adminUi));
check("and a send-code button", /data-code="/.test(adminUi));
check("and a cohort creation form", /id="ncSave"/.test(adminUi));

// ---------------------------------------------------------------- no duplicate notifications
section("Acceptance: marking a step twice doesn't email twice");
const dupStudent = await signIn("dup.check@example.com");
await post(action, { action: "profile.save", data: { display_name: "Dee Check", track: "RBLP" } }, dupStudent.cookie);
await post(action, { action: "funding.choose", data: { source: "army_ca" } }, dupStudent.cookie);
const dupId = DB.pl_students.find((x) => x.email === "dup.check@example.com").id;

const dupBefore = SENT.length;
const first = await (await post(action, { action: "student.advance", data: { id: dupId, step: "rblp_received" } }, boss.cookie)).json();
check("the first mark emails the student", first.emailed === true && SENT.length === dupBefore + 1, first);

const second = await (await post(action, { action: "student.advance", data: { id: dupId, step: "rblp_received" } }, boss.cookie)).json();
check("marking it again does NOT email again", second.emailed === false && SENT.length === dupBefore + 1, second);
check("and the API says why", second.alreadyDone === true);
check("the step is still marked done", !!DB.pl_pipeline_events.find((e) => e.student_id === dupId && e.step === "rblp_received"));

// Unmark then re-mark is a real correction, and should notify again.
await post(action, { action: "student.advance", data: { id: dupId, step: "rblp_received", done: false } }, boss.cookie);
const redo = await (await post(action, { action: "student.advance", data: { id: dupId, step: "rblp_received" } }, boss.cookie)).json();
check("unmarking and re-marking does email again — that's a genuine correction", redo.emailed === true, redo);

// Same class of bug on the student side: re-ticking "I already bought it" shouldn't re-notify.
const claimer = await signIn("dup.buyer@example.com");
const cBefore = SENT.length;
await post(action, { action: "pipeline.claimPurchase", data: {} }, claimer.cookie);
await post(action, { action: "pipeline.claimPurchase", data: {} }, claimer.cookie);
check("claiming a purchase twice only notifies once", SENT.length === cBefore + 1, SENT.length - cBefore);

const advPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the button also guards against a double-click", /if \(b\.disabled\) return;/.test(advPage));

// ---------------------------------------------------------------- admin is one person
section("Acceptance: only the company owner is admin");
const { effectiveRole: roleOf } = await import(`file://${R}/_lib/session.js`);
check("CLASSROOM_ADMINS grants admin", roleOf(env, { email: "tommy@promoteandlead.com", role: "student" }) === "admin");
check("a stored role of admin grants nothing on its own",
  roleOf(env, { email: "sneaky@example.com", role: "admin" }) === "student");
check("instructor still works from the column", roleOf(env, { email: "x@y.com", role: "instructor" }) === "instructor");
check("nobody can be promoted to admin through the API",
  (await post(action, { action: "student.role", data: { id: DB.pl_students[0].id, role: "admin" } }, boss.cookie)).status === 400);
check("but instructor can be assigned",
  (await post(action, { action: "student.role", data: { id: DB.pl_students[0].id, role: "instructor" } }, boss.cookie)).ok);
await post(action, { action: "student.role", data: { id: DB.pl_students[0].id, role: "student" } }, boss.cookie);
const rolePage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the role dropdown doesn't offer admin", !/\["student", "instructor", "admin"\]/.test(rolePage));

// ---------------------------------------------------------------- finishing a class
section("Acceptance: the instructor finishes the class");
DB.pl_cohort_members.forEach((mm) => { mm.certified_on = null; mm.status = "applied"; });
DB.pl_attendance = [];   // start the day fresh — nobody marked in yet
const noAttendance = await post(action, { action: "class.complete", data: { cohort_id: cohortId } }, instructor.cookie);
check("can't complete a class nobody is marked present for", noAttendance.status === 400, await noAttendance.text());

await post(action, { action: "attendance.mark", data: { cohort_id: cohortId, session_id: sess1, student_email: "pat.jones@example.com", present: true, minutes: 240 } }, instructor.cookie);
const completed = await post(action, { action: "class.complete", data: { cohort_id: cohortId } }, instructor.cookie);
const cbody = await completed.json();
check("completing the class certifies everyone who attended", completed.ok && cbody.completed === 1, cbody);
check("it records training completion, NOT passing the RBLP exam",
  DB.pl_cohort_members[0].status === "completed" && !!DB.pl_cohort_members[0].certified_on, DB.pl_cohort_members[0].status);

m = await (await get(me, student.cookie)).json();
check("the student's certificate is available straight after", m.certificate.available === true, m.certificate);
check("but they are NOT marked as RBLP certified by attending our class",
  m.pipeline.steps.find((st) => st.key === "certified").done === false);

// Tommy has to send these to RBLP before we can invoice, so he needs every one.
const adminNow = await (await get(consoleEp, boss.cookie)).json();
check("the admin gets a copy of every certificate issued",
  adminNow.admin.certificates.length >= 1 && adminNow.admin.certificates.every((r) => r.certificate.issuedOn),
  adminNow.admin.certificates.length);
check("each carries the right organisation for that student's funding",
  adminNow.admin.certificates.every((r) => ["RLS", "PLS"].includes(r.certificate.org.short)));
check("the admin page can print any of them",
  /printCertificateFor/.test(rolePage) && /data-cert=/.test(rolePage));

// Instructors are contractors; "when do I get paid" should be answered before it's asked.
check("the instructor console explains how pay works",
  adminNow.pay && adminNow.pay.basis && adminNow.pay.chain.length >= 4 && /after the class/.test(adminNow.pay.note));
check("pay is explained as per-student and funding-dependent",
  /per student/.test(adminNow.pay.basis) && /funded/.test(adminNow.pay.basis));

section("Authorization");
const studentConsole = await get(consoleEp, student.cookie);
check("student cannot open the instructor console (403)", studentConsole.status === 403);
const studentAttend = await post(action, { action: "attendance.mark", data: { cohort_id: cohortId, session_id: sess1, student_email: "pat.jones@example.com" } }, student.cookie);
check("student cannot mark attendance (403)", studentAttend.status === 403);
const studentAdmin = await post(action, { action: "password.set", data: { year_month: "2026-04", password: "hax" } }, student.cookie);
check("student cannot set the module password (403)", studentAdmin.status === 403);
const instructorAdmin = await post(action, { action: "student.role", data: { id: DB.pl_students[0].id, role: "admin" } }, instructor.cookie);
check("instructor cannot change roles (403)", instructorAdmin.status === 403);

const otherCohort = randomUUID();
DB.pl_cohorts.push({ id: otherCohort, name: "Other", slug: "26-003", instructor_email: "someone@else.com", created_at: new Date().toISOString() });
const crossCohort = await post(action, { action: "cohort.notes", data: { cohort_id: otherCohort, notes: "nope" } }, instructor.cookie);
check("instructor cannot touch another instructor's cohort (403)", crossCohort.status === 403);

const forged = "pl_classroom=" + encodeURIComponent(`${DB.pl_students[0].id}.pat.jones@example.com.${Date.now()+99999999}.badsignature`);
check("forged session cookie rejected", (await (await get(me, forged)).json()).signedIn === false);

// ---------------------------------------------------------------- admin
section("Admin");
DB.pl_students.push({ id: randomUUID(), email: "tommy@promoteandlead.com", display_name: "Tommy", role: "student", created_at: new Date().toISOString() });
const tommy = await signIn("tommy@promoteandlead.com");
check("CLASSROOM_ADMINS grants admin regardless of stored role", tommy.body.role === "admin");
const adminCon = await (await get(consoleEp, tommy.cookie)).json();
// Count the DB rather than a magic number — earlier sections create cohorts too.
check("admin sees every cohort", adminCon.cohorts.length === DB.pl_cohorts.length,
  [adminCon.cohorts.length, DB.pl_cohorts.length]);
// Where each student is, and how long they've been there — so Tommy can spot who's gone quiet
// instead of reading down a list of email addresses.
const roster = adminCon.admin.students;
check("every account carries its current stage", roster.every((x) => x.stage && x.stage.key && x.stage.ownerLabel), roster.filter((x) => !x.stage).map((x) => x.email));
check("the stage says how long they've sat there", roster.every((x) => x.stage.days === null || typeof x.stage.days === "number"));
check("and how far through they are", roster.every((x) => x.stage.total > 0 && x.stage.completed >= 0));
check("each one carries a dated timeline for the detail panel",
  roster.every((x) => Array.isArray(x.timeline) && x.timeline.length === x.stage.total));
check("the timeline records when a marked step actually landed",
  roster.some((x) => x.timeline.some((t) => t.done && t.at)), "no dated steps");
check("the console says how long counts as stalled", adminCon.admin.stalledAfterDays > 0);

// Instructors and admins aren't working toward a credential — they must not be mixed into the
// student table, and they certainly shouldn't get CA handoff buttons.
const adminPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the admin view splits students from staff",
  /renderLearnerTable/.test(adminPage) && /renderStaffTable/.test(adminPage) &&
  /s\.role === "student"/.test(adminPage));
check("staff get roles only, no journey", /don\\'t have a student journey/.test(adminPage));
check("roles shown are effective, so CLASSROOM_ADMINS shows as admin",
  roster.find((x) => x.email === "tommy@promoteandlead.com").role === "admin",
  roster.find((x) => x.email === "tommy@promoteandlead.com").role);
check("the instructor account is not listed as a student",
  roster.find((x) => x.email === "instructor@promoteandlead.com").role === "instructor");

check("admin payload includes students + passwords", !!adminCon.admin && adminCon.admin.students.length >= 3);
check("admin sees the facilitator outline (all 5 modules)", adminCon.outline.length === 5);

await post(action, { action: "password.set", data: { year_month: "2026-04", password: "LEADAPR26" } }, tommy.cookie);
check("admin set a month password", DB.pl_module_passwords.some(p => p.year_month === "2026-04"));
await post(action, { action: "cohort.classroom", data: { id: cohortId, slug: "26-002", teams_url: "https://teams.microsoft.com/x", tracks_allowed: ["RBLP-C","RBLP-T","BOGUS"] } }, tommy.cookie);
check("bogus track filtered out on save", DB.pl_cohorts[0].tracks_allowed.join() === "RBLP-C,RBLP-T");
await post(action, { action: "student.unlock", data: { id: DB.pl_students[0].id, step: "certificate", done: true } }, tommy.cookie);
m = await (await get(me, student.cookie)).json();
check("admin manual unlock marks the step done", m.pipeline.steps.find(s=>s.key==="certificate").done === true);
const badStep = await post(action, { action: "student.unlock", data: { id: DB.pl_students[0].id, step: "not_a_step" } }, tommy.cookie);
check("unknown pipeline step rejected", badStep.status === 400);

// ---------------------------------------------------------------- public site copy
section("Acceptance: the marketing site agrees with the classroom");
const site = (await import("node:fs")).readFileSync(ROOT + "index.html", "utf8");
const TO_12H = (hhmm) => {
  const [h, mi] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${ampm}`;
};
// The cohort card publishes each track's window. Students book their Saturday off work around
// these, so a stale figure here is worse than a stale figure anywhere else on the site.
for (const [trk, cfg] of Object.entries(CURRIC_TRACKS)) {
  const [start, end] = cfg.window.split("–");
  const want = `${TO_12H(start)} &ndash; ${TO_12H(end)}`;
  check(`site publishes ${trk} as ${want}`, site.includes(want), want);
  check(`site publishes ${trk}'s ${cfg.paybackHours} instructional hours`,
    site.includes(`${cfg.paybackHours} instructional hours`));
}
// The withdrawn end times the Teaching Guide flagged as stale site copy.
for (const stale of ["12:00 PM", "4:30 PM", "16:30"]) {
  check(`site no longer shows the withdrawn ${stale} end time`, !site.includes(stale));
}
check("site states the oral exam length for each track",
  Object.values(CURRIC_TRACKS).every((c) => site.includes(`${c.examHours}-hour oral exam`)),
  Object.values(CURRIC_TRACKS).map((c) => c.examHours));
// Cohort dates. Every one has to be a Saturday — the whole day shape assumes it.
const SITE_COHORTS = [...site.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"/g)].map((x) => x[1]);
check("the site lists the announced cohorts", SITE_COHORTS.length >= 3, SITE_COHORTS);
check("every advertised cohort falls on a Saturday",
  SITE_COHORTS.every((d) => new Date(d + "T12:00:00Z").getUTCDay() === 6),
  SITE_COHORTS.filter((d) => new Date(d + "T12:00:00Z").getUTCDay() !== 6));
check("cohort dates are listed in order", SITE_COHORTS.join() === [...SITE_COHORTS].sort().join());

// The CA lead time on the public site has to match the one the CRM places students with, or
// the site promises a cohort the admin tool then refuses to put them in.
const adminSrc = (await import("node:fs")).readFileSync(ROOT + "admin/index.html", "utf8");
const windowsOf = (src) => {
  const m = /CA_WINDOW_DAYS\s*=\s*\{([^}]*)\}/.exec(src);
  return m ? m[1].replace(/["\s]/g, "") : null;
};
check("the site and the CRM agree on the CA lead time",
  windowsOf(site) && windowsOf(site) === windowsOf(adminSrc), [windowsOf(site), windowsOf(adminSrc)]);
check("Army is 45 days and Air Force 30", /Army:45/.test(windowsOf(site)) && /AirForce:30/.test(windowsOf(site).replace(/-/g, "")), windowsOf(site));

// Army CA was shut for the fiscal rollover; don't advertise it as open before it reopens.
const reopens = (/CA_REOPENS\s*=\s*"(\d{4}-\d{2}-\d{2})"/.exec(site) || [])[1];
check("the site knows when Army CA reopens", reopens === "2026-09-14", reopens);
check("the CA banner's default wording is the pre-reopen one (correct with JS off)",
  /Army CA reopens 14 September 2026/.test(site));

// With a 45-day lead from the reopening, the first reachable cohort is 26-004 on 7 November.
const plus = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
check("the first CA-fundable cohort after the reopening is 7 November",
  SITE_COHORTS.filter((d) => d >= plus(reopens, 45))[0] === "2026-11-07",
  SITE_COHORTS.filter((d) => d >= plus(reopens, 45)));

// Two doors, both obvious: sign in if you have an account, get started if you don't. The nav
// used to offer neither — "Cohort Prep" jumped to a section the classroom now replaces.
check("the nav has a real sign-in button", /class="btn btn-ghost btn-sm" href="\/classroom">Sign In</.test(site));
check("mobile gets one too", /mm-signin" href="\/classroom">Sign in to my classroom</.test(site));
check("the dead Cohort Prep nav link is gone", !/href="#prep">Cohort Prep</.test(site));
check("the prep section now sends enrolled students to their classroom",
  /Already signed up\? Everything lives in your classroom/.test(site) &&
  /Sign In to My Classroom/.test(site));
// The classroom issues the month password itself; telling people to email for it invites the
// support tickets the research flagged.
check("the site no longer tells students to ask us for the module password",
  !/haven't received your module password/.test(site) && /password is in your classroom/i.test(site));

// Sign-up is account-first now: we own the walkthrough, RBLP owns the credential. Every primary
// CTA has to land on the classroom, not bounce someone to rblp.com to work it out alone.
check("the primary calls to action start an account", /Create Your Free Account/.test(site) && /href="\/classroom"/.test(site));
check("the old apply-first framing is gone",
  !/Apply for RBLP first, then check out/.test(site) && !/must be completed <strong[^>]*>before<\/strong> you purchase/.test(site));
// Buying without an account leaves someone paid-up with no prep work and no idea what's next.
// The cards lead to the account only; the recovery route is for people who bought elsewhere.
check("the certification cards don't send people off to buy without an account",
  !/Already applied\? Buy prep at RBLP/.test(site));
check("but someone who already bought is told what to do",
  /Already bought your exam prep through RBLP/.test(site) && /pay twice/.test(site));

// We never take payment — RBLP collects and pays us. Copy implying otherwise sends people
// looking for an invoice we don't issue.
check("the site says purchasing runs through RBLP", /Everything is purchased through RBLP/.test(site));
check("Affirm is attributed to RBLP's checkout, with terms set by Affirm",
  /at RBLP&rsquo;s checkout/.test(site) && /set by Affirm/.test(site));
check("financing figures are qualified rather than promised", /subject to approval/.test(site));
const guidance = (await import(`file://${R}/_lib/classroom.js`)).fundingGuidance;
check("self-pay guidance points at rblp.com, not an invoice from us",
  /rblp\.com/.test(guidance("self_pay").body.join(" ")) && !/invoice/i.test(guidance("self_pay").body.join(" ")));
check("and says plainly that we don't handle the money",
  /never handle/i.test(guidance("self_pay").body.join(" ")));

// Anyone can buy from RBLP's public storefront without seeing our site, so students arrive
// already paid. They flag it, we confirm — they can't self-mark paid, because that's money.
const orphan = await signIn("bought.first@example.com");
await post(action, { action: "profile.save", data: { display_name: "Jo Bought", track: "RBLP" } }, orphan.cookie);
await post(action, { action: "funding.choose", data: { source: "self_pay" } }, orphan.cookie);
// A real orphan has already applied and been confirmed — you can't buy prep otherwise.
await post(action, { action: "pipeline.confirmApplied", data: { applied: true } }, orphan.cookie);
await post(action, { action: "student.advance", data: { id: DB.pl_students.find((x) => x.email === "bought.first@example.com").id, step: "rblp_received" } }, boss.cookie);
const mailBefore = SENT.length;
const claim = await post(action, { action: "pipeline.claimPurchase", data: {} }, orphan.cookie);
check("a student can say they already bought it", claim.ok);
const om = await (await get(me, orphan.cookie)).json();
check("the claim is recorded and shown back to them", !!om.profile.purchaseClaimedAt);
check("but it does NOT unlock their prep work — money is confirmed, not claimed",
  om.worksheets.unlocked === false && om.pipeline.current.key === "paid");
check("and it tells Tommy to check with RBLP",
  SENT.length > mailBefore && /already purchased/i.test(SENT[SENT.length - 1].subject), SENT[SENT.length - 1] && SENT[SENT.length - 1].subject);
const adminSees = await (await get(consoleEp, boss.cookie)).json();
check("the admin list flags them for confirmation",
  adminSees.admin.students.some((x) => x.email === "bought.first@example.com" && x.purchase_claimed_at));
const classroomSrc = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the sign-in page says this is also how you create an account",
  /This is also how you create your account/.test(classroomSrc));

// CA is an enlisted benefit; rank bands describe experience. An officer shouldn't build a
// timeline around funding they can't get.
// Army CA eligibility changed on 19 Mar 2026: commissioned officers O1-O10 are out, warrant
// officers W1-W5 and enlisted are still in. Calling it "an enlisted benefit" writes off every
// warrant officer — and RBLP's own Coach/Trainer bands are largely warrant officers.
check("the site separates experience bands from funding eligibility", /not funding eligibility/.test(site));
check("warrant officers are told they ARE eligible for Army CA",
  /Warrant officers W1&ndash;W5 are eligible/.test(site));
check("commissioned officers are told they are not, with the date",
  /O1&ndash;O10 became ineligible for new goals on 19 March 2026/.test(site));
check("the site no longer writes CA off as enlisted-only", !/enlisted benefit/.test(site));
check("Air Force is described on its own terms, not Army's",
  /AF COOL is a Total Force/.test(site) && /E7&ndash;E9/.test(site));

// Army rank rules must not be shown to an Air Force student, and vice versa.
const warn = (await import(`file://${R}/_lib/curriculum.js`)).caWarningsFor;
const army = warn("army_ca"), af = warn("af_ca");
check("Army students get the O1–O10 / W1–W5 rule",
  army.some((w) => /W1–W5/.test(w.detail) && /O1–O10/.test(w.detail)));
check("Air Force students do NOT get Army rank language",
  !JSON.stringify(af).includes("W1–W5") && !JSON.stringify(af).includes("O1–O10") &&
  !JSON.stringify(af).includes("ArmyIgnitED"), af.map((w) => w.rule));
check("Air Force students get their own enlisted / SNCO framing",
  af.some((w) => /enlisted/i.test(w.detail) && /E7–E9/.test(w.detail)));
check("both still get the shared packet warnings",
  ["Two separate requests", "The vendor name has to match exactly"].every((r) =>
    army.some((w) => w.rule === r) && af.some((w) => w.rule === r)));
check("non-CA students get none of it", warn("self_pay") === null);

// GI Bill reimburses the EXAM fee, not the prep training. A badge saying "GI Bill eligible"
// beside a $395 prep price reads as coverage it doesn't have.
check("the site doesn't imply the GI Bill pays for prep training",
  !/GI Bill&reg; eligible/.test(site) && /GI Bill&reg; exam reimbursement/.test(site));
// The one public critique of RBLP prep anyone made was that reflection time is under-sold.
check("the site is honest about the reflection hours up front",
  /hours of personal reflection/.test(site) && /underestimate/.test(site));
// Two accounts, two organisations — a support-ticket generator if nobody says it.
check("the site explains the two-account split", /two accounts/i.test(site) && /personal email address/i.test(site));
// Army's own "don't do this" list, on the page where people decide to file.
check("the site warns what bounces a CA packet",
  /bounces a packet|what bounces/i.test(site) && /vendor name/i.test(site) && /out of pocket/i.test(site));

// September in Chicago is CDT, not CST — "Central" is right all year round.
check("site doesn't label Central time as CST year-round", !/\bCST\b/.test(site));

// ---------------------------------------------------------------- licence
section("Acceptance: no RBLP curriculum body text republished");
const fs = await import("node:fs");
const shipped = [ROOT + "classroom/index.html", ROOT + "functions/_lib/curriculum.js"].map(p=>fs.readFileSync(p,"utf8")).join("\n");
check("every module deep-links to rblp.com", [1,2,3,4,5].every(n => shipped.includes(`rblp.com/exam-prep-training/module-${n}-`)));
const packDir = ROOT + "P-and-L-classroom-CC-pack";
const { execSync } = await import("node:child_process");
const tracked = execSync("git ls-files P-and-L-classroom-CC-pack", { cwd: ROOT }).toString().trim();
check("the content pack is not committed (Pages would serve it publicly)", tracked === "", tracked.split("\n").slice(0, 2));
if (fs.existsSync(packDir)) {
  const packProse = fs.readFileSync(packDir + "/classroom-content/module-01-team-climate.md", "utf8")
    .split("\n").filter(l => l.startsWith("- ") && l.length > 60).map(l => l.replace(/^- /, "").trim());
  const leaked = packProse.filter(line => shipped.includes(line));
  check("no coach-note prose lines copied into the app", leaked.length === 0, leaked.slice(0, 3));
} else {
  console.log("  - pack not present locally; prose-leak check skipped");
}

console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
