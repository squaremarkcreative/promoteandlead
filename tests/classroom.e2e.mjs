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
check("the CA step is filed on the portal, not posted to an office",
  !/send .*office|mail/i.test(caStep.title + " " + caStep.blurb), caStep.title);
// Two goals, sequential — the exam request can't be opened until the course grade posts.
check("the CA step is explicitly the TRAINING request only",
  /training/i.test(caStep.title) && /separate goals?/i.test(caStep.blurb), caStep.title);
const caExam = m.pipeline.steps.find((st) => st.key === "ca_exam");
check("there's a later step for the exam funding request", !!caExam, m.pipeline.steps.map((x) => x.key));
check("and it sits after the training certificate",
  m.pipeline.steps.findIndex((x) => x.key === "ca_exam") > m.pipeline.steps.findIndex((x) => x.key === "certificate"));
check("non-CA students never see it",
  !(await import(`file://${R}/_lib/classroom.js`)).stepsForRoute("Normal")
    .flatMap((ph) => ph.steps).some((x) => x.key === "ca_exam"));
// RBLP only invoice for the exam once the certificate proves the course happened.
const invStep = m.pipeline.steps.find((st) => st.key === "invoice");
check("the invoice step expects ONE invoice, for the training",
  /training invoice/i.test(invStep.title) && !/two invoices/i.test(invStep.title), invStep.title);
check("and explains why the exam invoice isn't there yet", /completion certificate/i.test(invStep.blurb));
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
// The ArmyIgnitED company field presents as a dropdown but is a search box, and the list is
// truncated alphabetically so RLS is never visible. This is the step people abandon on.
const armyWarn = (await import(`file://${R}/_lib/classroom.js`)).fundingGuidance("army_ca");
const armyRules = (await import(`file://${R}/_lib/curriculum.js`)).caWarningsFor("army_ca");
check("Army students are told the company field is a search box",
  armyRules.some((w) => /search box/i.test(w.rule) && /\btyp/i.test(w.detail)),
  armyRules.filter((w) => /search box/i.test(w.rule)).map((w) => w.rule));
check("the step itself says it, not just the warnings list",
  /looks like a dropdown\. It is actually a search box/.test(caPage));
// The vendor is listed under its full name, so searching the acronym returns nothing — the
// obvious thing to type is the thing that fails.
check("it says to type the full name, not the acronym",
  /type <b>Resilient Leadership Solutions<\/b>/.test(caPage) && /Searching for &ldquo;RLS&rdquo; finds nothing/.test(caPage));
check("and the warning list agrees",
  armyRules.some((w) => /full name/i.test(w.rule) && /Searching "RLS" also finds nothing/.test(w.detail)),
  armyRules.filter((w) => /search box/i.test(w.rule)).map((w) => w.detail));
check("it's shown only to Army — the Air Force portal is different",
  /p\.paymentSource === "army_ca"/.test(caPage));

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
// Teaching live, the only question is "what haven't I covered". Done sinks a task to the
// bottom of its module so what's left stays at the top.
const tgPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("every task has a Done control", /data-cover="/.test(tgPage) && /"Covered"|&#10003; Covered/.test(tgPage));
check("covered tasks sort to the bottom of their module",
  /todo\.concat\(done\)/.test(tgPage));
// Marking Done re-renders to re-sort the tasks, and the open module was hardcoded to module 1,
// so an instructor teaching module 3 had it collapse under them mid-session.
check("the module they're teaching stays open across a Done",
  /var isOpen = TG_OPEN \? TG_OPEN\.indexOf\(m\.num\) >= 0 : m\.num === 1/.test(tgPage));
check("every teaching module is addressable by number", /class="mod tg" data-mod="/.test(tgPage));
check("what they expanded is remembered, not reset to a default",
  /addEventListener\("toggle", function \(\) \{ TG_OPEN = tgOpenModules\(el\)/.test(tgPage));
check("Done lands on the next task still to cover", /spotlight\(stillToCover\)/.test(tgPage));
// Ticking task 7 of 7 used to leave for the next module immediately, skipping the misses and
// oral angles — the part that actually costs students marks in the oral.
check("finishing a module stops at the wrap-up instead of leaving",
  /\$\(".tg-extra", mod\) \|\| \$\(".tg-wrap", mod\)/.test(tgPage));
check("and says why it stopped there", /go over the misses, then move on/.test(tgPage));
check("the finished module carries a gate to the next one", /data-tgnext="/.test(tgPage));
check("the gate only appears once every task in the module is ticked",
  /m\.tasks\.every\(function \(t\) \{ return COVERED\[t\.key\]; \}\)/.test(tgPage));
check("the gate sits under the misses and angles, so the two read together",
  tgPage.indexOf('tgList("Likely oral angles"') < tgPage.indexOf('data-tgnext='));
check("moving on is a second, deliberate click", /tgAdvance\(el, Number\(b\.dataset\.tgnext\)\)/.test(tgPage));
check("a collapsed next module is opened before scrolling, or there's nothing to scroll to",
  /if \(!d\.open\) d\.open = true/.test(tgPage));
check("the last module says the guide is finished rather than offering a next",
  /That is the whole guide covered/.test(tgPage));
check("only a genuinely finished guide falls back to holding position",
  /That's every module covered/.test(tgPage));

// The instructor asked for the same jump bar the students got.
check("the teaching guide has a jump button per module", /data-tgjump="/.test(tgPage));
check("counted the way an instructor reads it — what's still to cover",
  /still to cover"/.test(tgPage) && /left \? "btn-ghost" : "btn-green"/.test(tgPage));
check("jumping opens the module even when collapsed", /d\.open = true;\n      scrollUnderBars\(d\)/.test(tgPage));
// Two sticky bars sit above the content, so a plain scrollIntoView hides what you asked for.
check("scrolling clears both sticky bars rather than tucking the target under them",
  /function scrollUnderBars/.test(tgPage) &&
  /\(hdr \? hdr\.offsetHeight : 0\) \+ \(bar \? bar\.offsetHeight : 0\)/.test(tgPage));
check("the student module jump clears them too", /if \(task\) spotlight\(task\); else scrollUnderBars\(d\)/.test(tgPage));
check("the jump bar and the accordions render from one filtered module list",
  /var mods = CONSOLE\.outline\.filter/.test(tgPage) && /tgJumpHtml\(mods\)/.test(tgPage));
// Back from a break, the job is to jump to where the room left off — not to scroll past the
// run of day first. So the bar is the first thing in the panel, and sticks from there down.
check("the teaching jump bar is the first thing on the page",
  /el\.innerHTML =\s*(\/\/[^\n]*\n\s*)*tgJumpHtml\(mods\)/.test(tgPage));

// The teaching guide is about one cohort. Summing every cohort's roster put a phantom coach in
// a trainer-only room, because a leftover draft cohort was counted in too.
section("Teaching guide totals describe one cohort");
check("track totals come from the cohort being taught, not every cohort",
  /\(\(teaching && teaching\.roster\) \|\| \[\]\)\.forEach/.test(tgPage) &&
  !/CONSOLE\.cohorts\.forEach\(function \(c\) \{ \(c\.roster/.test(tgPage));
check("a draft cohort never becomes the default — an admin sees every cohort",
  /list\.filter\(function \(c\) \{ return c\.classroomStatus !== "draft"; \}\)\[0\]/.test(tgPage));
check("the Instructor tab and the teaching guide agree on which cohort",
  /var pick = activeCohort\(\)/.test(tgPage));
check("coverage is scoped by the same cohort choice", /var c = activeCohort\(\);/.test(tgPage));
check("the run of day names the cohort its counts describe",
  /esc\(teaching\.slug \|\| teaching\.name\)/.test(tgPage));
// A trainer sits through the coach material without stopping there.
check("the day reads as who finishes at each point, not who is in the room",
  /' finishes' : ' finish'\) \+ ' here/.test(tgPage) && /nobody finishes here/.test(tgPage));
check("and the old roster-count wording is gone", !/on this roster<\/span>/.test(tgPage));
check("the next task is found by skipping covered ones",
  /\$\(".tg-task:not\(\.covered\)", d\)/.test(tgPage));
check("finishing a module says so", /Module " \+ modNum \+ " covered/.test(tgPage));
check("un-ticking holds their place instead of moving them",
  /Un-ticking is a correction, not progress/.test(tgPage) && /window\.scrollTo\(0, y\)/.test(tgPage));
check("their original numbering is kept, so you can still refer to task 3",
  /x\.n \+ "\. " \+ esc\(t\.title\)/.test(tgPage));
check("each module shows how many are left", /still to cover/.test(tgPage));
check("and can be reset without reloading", /data-uncover="/.test(tgPage));
// This state was per-browser once. It is the instructor's record of their own teaching, so it
// is per cohort and server-held — it must survive a new laptop.
check("state is per cohort and held on the server, not in a browser",
  /COVERED_COHORT/.test(tgPage) && !/pl_covered_/.test(tgPage) &&
  /case "coverage\.mark"/.test(
    (await import("node:fs")).readFileSync(ROOT + "functions/api/classroom/action.js", "utf8")));

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

// During a live session the answers are what get worked on, so a student shouldn't have to
// leave the cohort tab to sharpen one while the instructor drives it out.
section("Cohort: prep work to hand, without leaving the room");
const cnPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the cohort tab opens their own notes", /function cohortNotesHtml/.test(cnPage) &&
  /cohortNotesHtml\(\);/.test(cnPage));
check("one module at a time, picked by button", /data-cnote="' \+ m\.num/.test(cnPage));
check("with the same ready count as everywhere else", /'<span class="jump-n">' \+ ready \+ "\/"/.test(cnPage));
check("the open module is marked out from the rest",
  /m\.num === COHORT_MOD \? "btn-gold"/.test(cnPage));
check("nothing is open until they pick one", /Pick a module above to open your notes/.test(cnPage));
check("and it can be closed again", /data-cnote="0">Close/.test(cnPage));
check("the notes are the real editable task cards, so they autosave",
  /shown\.tasks\.map\(function \(t\) \{ return taskHtml\(t\); \}\)/.test(cnPage) &&
  /\$\$\("\.task", el\)\.forEach\(wireTask\)/.test(cnPage));
check("locked prep work isn't offered here either", /if \(!ME\.worksheets\.unlocked\) return ""/.test(cnPage));
check("the notebar isn't a second sticky bar competing with the header",
  /\.notebar\{display:flex/.test(cnPage) && !/\.notebar\{position:sticky/.test(cnPage));

// Two bugs this surfaced, both about a redraw showing something other than the truth.
check("autosave updates the in-memory copy, so switching module shows what was just typed",
  /cacheResponse\(payload\)/.test(cnPage) && /function cacheResponse/.test(cnPage));
check("marking a module ready from the cohort tab moves to the next module there",
  /COHORT_MOD = next\.num;/.test(cnPage));
check("the module footer appears under the notes here too",
  /taskHtml\(t\); \}\)\.join\(""\) \+ moduleReadyHtml\(shown\)/.test(cnPage));

// Readiness is set for a whole module in one call. It must move the status and nothing else —
// a student may be typing in one of those very boxes as they press it.
section("Worksheets: readiness is a per-module decision");
await post(action, { action: "worksheet.save", data: { task_key: "m1_analyze_climate", what: "Shared perception", story: "My shop", status: "draft" } }, student.cookie);
const modReady = await post(action, { action: "worksheet.moduleStatus", data: { module_num: 1, status: "ready" } }, student.cookie);
check("a student can mark a whole module ready", modReady.ok);
let mr = await (await get(me, student.cookie)).json();
const mod1 = mr.worksheets.modules.find((x) => x.num === 1);
check("every task in the module is ready, including untouched ones",
  mod1.tasks.every((t) => t.response && t.response.status === "ready"),
  mod1.tasks.map((t) => t.response && t.response.status));
check("the answers they had already written are untouched",
  mod1.tasks.find((t) => t.key === "m1_analyze_climate").response.what === "Shared perception");
check("and so is the rest of that row", 
  mod1.tasks.find((t) => t.key === "m1_analyze_climate").response.story === "My shop");
check("a module they didn't touch is left alone",
  mr.worksheets.modules.find((x) => x.num === 2).tasks.every((t) => !t.response || t.response.status === "empty"));

const reopened = await post(action, { action: "worksheet.moduleStatus", data: { module_num: 1, status: "draft" } }, student.cookie);
check("reopening a module puts it back to draft", reopened.ok);
mr = await (await get(me, student.cookie)).json();
check("without losing the answers",
  mr.worksheets.modules.find((x) => x.num === 1).tasks.every((t) => t.response.status === "draft") &&
  mr.worksheets.modules.find((x) => x.num === 1).tasks.find((t) => t.key === "m1_analyze_climate").response.what === "Shared perception");
const badMod = await post(action, { action: "worksheet.moduleStatus", data: { module_num: 9, status: "ready" } }, student.cookie);
check("an unknown module is refused", badMod.status === 400);

// ---------------------------------------------------------------- teaching coverage
// The instructor's Done ticks used to live in localStorage, so they were stranded on whichever
// device did the ticking. They belong to the instructor, not to the room: students never see them.
section("Acceptance: teaching coverage follows the instructor, not the browser");
DB.pl_cohort_coverage = [];
let cov = await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_earn_trust" } }, instructor.cookie);
check("instructor can tick a task off", cov.ok);
con = await (await get(consoleEp, instructor.cookie)).json();
check("the tick comes back from the server, not the browser",
  con.cohorts[0].covered.includes("m1_earn_trust"), con.cohorts[0].covered);
check("it records who ticked it", DB.pl_cohort_coverage[0].covered_by === "instructor@promoteandlead.com");

await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_respect" } }, instructor.cookie);
con = await (await get(consoleEp, instructor.cookie)).json();
check("a second tick is added rather than replacing the first", con.cohorts[0].covered.length === 2);

// Ticking the same task twice must not duplicate the row — the primary key is (cohort, task).
await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_respect" } }, instructor.cookie);
con = await (await get(consoleEp, instructor.cookie)).json();
check("re-ticking the same task doesn't duplicate it", con.cohorts[0].covered.length === 2, con.cohorts[0].covered);

await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_respect", covered: false } }, instructor.cookie);
con = await (await get(consoleEp, instructor.cookie)).json();
check("un-ticking removes it", con.cohorts[0].covered.join() === "m1_earn_trust", con.cohorts[0].covered);

const resetKeys = ["m1_earn_trust", "m1_analyze_climate"];
await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_analyze_climate" } }, instructor.cookie);
const rst = await post(action, { action: "coverage.reset", data: { cohort_id: cohortId, task_keys: resetKeys } }, instructor.cookie);
check("resetting a module clears its ticks in one call", rst.ok);
con = await (await get(consoleEp, instructor.cookie)).json();
check("and the module comes back empty", con.cohorts[0].covered.length === 0, con.cohorts[0].covered);

// Same gate as attendance: a cohort you don't teach is not yours to annotate.
const badKey = await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m9_not_real" } }, instructor.cookie);
check("an unknown task key is refused", badKey.status === 400);
const stuCov = await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_respect" } }, student.cookie);
check("a student cannot tick anything off", stuCov.status === 403, stuCov.status);
DB.pl_students.push({ id: randomUUID(), email: "other.coach@promoteandlead.com", display_name: "Other", role: "instructor", created_at: new Date().toISOString() });
const otherCoach = await signIn("other.coach@promoteandlead.com");
const foreign = await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_respect" } }, otherCoach.cookie);
check("an instructor cannot tick off a cohort that isn't theirs", foreign.status === 403, foreign.status);
const emptyReset = await post(action, { action: "coverage.reset", data: { cohort_id: cohortId, task_keys: [] } }, instructor.cookie);
check("a reset with no valid keys is refused rather than clearing everything", emptyReset.status === 400);

// The point the instructor made: ticking Done is a note to self, not a signal to the room.
await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_respect" } }, instructor.cookie);
const stuView = await (await get(me, student.cookie)).json();
// Task keys appear in a student's payload legitimately — they're their own worksheet answers —
// so the thing to assert is that no `covered` field exists anywhere in it.
const hasKey = (o, name) => !!o && typeof o === "object" &&
  (!Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, name) ||
   Object.values(o).some((v) => hasKey(v, name)));
check("coverage never reaches the student payload", !hasKey(stuView, "covered"));
check("and that check isn't vacuous — the instructor console does carry it",
  hasKey(await (await get(consoleEp, instructor.cookie)).json(), "covered"));
await post(action, { action: "coverage.mark", data: { cohort_id: cohortId, task_key: "m1_respect", covered: false } }, instructor.cookie);

const tgSrc = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the browser no longer stores coverage at all",
  !/pl_covered_/.test(tgSrc) && !/coveredKey/.test(tgSrc));
check("ticks are read from the server payload", /\(c\.covered \|\| \[\]\)\.forEach/.test(tgSrc));
check("the tick is optimistic so a live room never waits on a round trip",
  /Tick first, save second/.test(tgSrc));
check("a failed write is put back rather than left looking saved",
  /Couldn't save that tick/.test(tgSrc) && /if \(was\) COVERED\[key\] = 1; else delete COVERED\[key\]/.test(tgSrc));
check("teaching opened without picking a cohort falls back rather than silently dropping ticks",
  /Pick a cohort on the Instructor tab first/.test(tgSrc));

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
// A certified student had no way to reach their certificate: it rendered only inside its own
// pipeline step card, so once the journey moved past that step it was unreachable.
section("Acceptance: a certified student can reach their certificate");
// Exactly what the instructor console does: certify the roster row.
const certified = await post(action, { action: "member.certify", data: { cohort_id: cohortId, member_id: DB.pl_cohort_members[0].id, certified_on: "2026-03-07" } }, instructor.cookie);
check("the instructor console can certify the roster row", certified.ok);
const certStu = await (await get(me, student.cookie)).json();
check("the certificate is available once the roster row is certified", certStu.certificate.available === true,
  certStu.certificate);
const cohPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("it has a home of its own, not only a pipeline step", /function certificateCardHtml/.test(cohPage) &&
  /certificateCardHtml\(\) \+/.test(cohPage));
// Nobody scrolls to the foot of a page looking for their own certificate.
check("the way in sits directly under the cohort heading, above the hours and the Teams link",
  cohPage.indexOf("certOpenerHtml() +") < cohPage.indexOf("Join on Microsoft Teams"));
check("the certificate itself opens in place, right below that box",
  cohPage.indexOf("certificateCardHtml() +") < cohPage.indexOf("<h3>My hours</h3>"));
check("it stays closed until asked for", /id="certCard"' \+ \(CERT_OPEN \? "" : " hidden"\)/.test(cohPage));
check("the button says which way it goes", /CERT_OPEN \? "Hide my certificate" : "My certificate"/.test(cohPage));
check("opening it scrolls clear of the sticky header", /if \(CERT_OPEN\) scrollUnderBars\(card\)/.test(cohPage));
check("and it stays open across a redraw", /var CERT_OPEN = false/.test(cohPage));

// The signature block was hardcoded and ignored the data it was handed.
check("the signature is rendered from the data, not hardcoded",
  /esc\(sg\.name\)/.test(cohPage) && /esc\(sg\.company\)/.test(cohPage) &&
  !/<div class="nm">Thomas Hendler<\/div>/.test(cohPage));
const signer = (await import("node:fs")).readFileSync(ROOT + "functions/_lib/classroom.js", "utf8");
check("it carries the registered company name, not the trading shorthand",
  /company: "Promote and Lead Solutions, LLC"/.test(signer) &&
  !/Instructor \/ Promote and Lead"/.test(signer));
check("one signer definition feeds both the student and the admin certificate",
  (signer.match(/instructor: CERT_SIGNER/g) || []).length === 2);
check("the registered name gets its own line so it can't wrap inside the signature block",
  /\.cert-sig \.ti \.co\{display:block;font-size:12pt;white-space:nowrap\}/.test(cohPage));
// The organization that delivered the training is a separate fact from who signed it.
check("the training provider is still the funded vendor for a CA student",
  /paymentType === "CA" \? CERT_ORGS\.RLS : CERT_ORGS\.PLS/.test(signer));
check("with one print path shared by both places", !/id="cPrint"/.test(cohPage) &&
  (cohPage.match(/data-certprint/g) || []).length >= 3);
check("the button says what it actually does", /Save or print my certificate/.test(cohPage));
check("and explains that Save as PDF is how you keep a copy", /Save as PDF/.test(cohPage));
check("it names the issuing organization on the card", /issued by " \+ esc\(c\.org\.name\)/.test(cohPage));
check("a CA student is told the organization has to match their funding",
  /has to match the vendor your funding was/.test(cohPage));
check("a missing name is a prompt to add it, not a dead end", /data-go="settings">Add my name/.test(cohPage));

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
check("the step offers instructions, then COOL, then the portal — numbered",
  /1\. Read the step-by-step/.test(portalPage) && /2\. Find it on Army COOL/.test(portalPage) &&
  /Open " \+ esc\(g\.portal\.name\)/.test(portalPage));
check("non-CA funding has no portal to open", !(await import(`file://${R}/_lib/classroom.js`)).fundingGuidance("self_pay").portal);

// ---------------------------------------------------------------- who to chase
section("Acceptance: chase the right people");
m = await (await get(me, student.cookie)).json();
check("RBLP's own support details reach the student",
  m.rblpSupport && /@rblp\.com$/.test(m.rblpSupport.email) && m.rblpSupport.phone, m.rblpSupport);
const chasePage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
// Invoices are RBLP's to raise; routing the chase through us just adds a day.
check("missing invoices send the student to RBLP, not to us",
  /Nothing after a week\?<\/b> RBLP issues these/.test(chasePage) &&
  /mailto:' \+ esc\(r\.email\)/.test(chasePage));
check("but we still ask to be told, so it shows up as stalled",
  /Tell us too/.test(chasePage) && /info@promoteandlead\.com/.test(chasePage));
// US military audience — British spellings and idiom read as foreign and sloppy.
const fsMod = await import("node:fs");
const allCopy = ["functions/_lib/curriculum.js", "functions/_lib/classroom.js", "classroom/index.html", "index.html"]
  .map((f) => fsMod.readFileSync(ROOT + f, "utf8")).join("\n");
check("no British spellings in the copy",
  !/\bprogramme\b|\borganis[a-z]*|\brecognis[a-z]*|\bwhilst\b|\bamongst\b/i.test(allCopy),
  (allCopy.match(/\bprogramme\b|\borganis[a-z]*|\brecognis[a-z]*|\bwhilst\b|\bamongst\b/gi) || []).slice(0, 5));
check("invoices are issued or sent, never 'raised'", !/RBLP raise|raise (an |the )?invoice/i.test(allCopy));
// Spelling isn't the whole problem — idiom gives it away just as fast.
const briticisms = [
  [/\bsit (the|an|your|for the) exam/i, "sit the exam (US: take the exam)"],
  [/\bstraight away\b/i, "straight away (US: right away)"],
  [/\bsort it\b/i, "sort it (US: fix it)"],
  [/\bkicked back\b/i, "kicked back (US: sent back / rejected)"],
  [/\bwhilst\b|\bamongst\b|\bfortnight\b|\bmaths\b/i, "assorted"]
];
const found = briticisms.filter(([re]) => re.test(allCopy)).map(([, label]) => label);
check("no British idiom in the copy — the audience is US military", found.length === 0, found);

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

// ---------------------------------------------------------------- instructor funnel
section("Acceptance: Trainers get invited to instruct");
// RBLP-T is RBLP's own bar for an ATP instructor, so the invitation is for Trainers only.
const trainer = await signIn("new.trainer@example.com");
const trainerId = DB.pl_students.find((x) => x.email === "new.trainer@example.com").id;
DB.pl_cohort_members.push({ id: randomUUID(), cohort_id: cohortId, email: "new.trainer@example.com", rblp_type: "RBLP-T", status: "applied" });
await post(action, { action: "student.advance", data: { id: trainerId, step: "certified" } }, boss.cookie);
const tMail = SENT[SENT.length - 1];
check("a Trainer's certification email invites them to instruct",
  /certified/.test(tMail.subject) && /eligible to instruct/.test(tMail.html), tMail.subject);
check("it says why they're eligible", /RBLP-T is the qualification/.test(tMail.html));
check("it sets the expectation — one Saturday a month, paid per student",
  /one Saturday a month/.test(tMail.html) && /paid per student/.test(tMail.html));
check("and it nods at referral pay without quoting rates",
  /more for the ones you bring/.test(tMail.html) && !/60%|40%|percent/.test(tMail.html));
check("the plain-text version carries it too", /qualifies you to instruct/.test(tMail.text));

// A Coach or base graduate can't instruct, so must not be invited.
const coachGrad = await signIn("coach.grad@example.com");
const coachId = DB.pl_students.find((x) => x.email === "coach.grad@example.com").id;
DB.pl_cohort_members.push({ id: randomUUID(), cohort_id: cohortId, email: "coach.grad@example.com", rblp_type: "RBLP-C", status: "applied" });
await post(action, { action: "student.advance", data: { id: coachId, step: "certified" } }, boss.cookie);
const cMail = SENT[SENT.length - 1];
check("an RBLP-C graduate is congratulated but NOT invited to instruct",
  /certified/.test(cMail.subject) && !/eligible to instruct/.test(cMail.html), cMail.subject);
check("they still get the review ask", /share a short review/.test(cMail.html));

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

section("Security: escalation and cross-user writes");
// Anything the browser sends that isn't on the whitelist must be ignored, silently.
const before2 = { role: DB.pl_students[0].role, email: DB.pl_students[0].email };
await post(action, { action: "profile.save", data: { display_name: "Pat Jones", role: "admin", email: "hijack@example.com", referred_by: DB.pl_students[0].id } }, student.cookie);
check("profile.save ignores a smuggled role", DB.pl_students[0].role === before2.role, DB.pl_students[0].role);
check("profile.save ignores a smuggled email", DB.pl_students[0].email === before2.email);
check("profile.save ignores a smuggled referrer", !DB.pl_students[0].referred_by || DB.pl_students[0].referred_by !== DB.pl_students[0].id);

// The student id always comes from the signed cookie, never the request body.
await post(action, { action: "worksheet.save", data: { task_key: "m1_fun", what: "mine", student_id: DB.pl_students[1].id } }, student.cookie);
check("worksheet writes land on the session owner, not a supplied id",
  DB.pl_worksheet_responses.filter((r) => r.task_key === "m1_fun").every((r) => r.student_id === DB.pl_students[0].id));

// Every privileged action, attempted by a plain student.
for (const [act, data] of [
  ["student.role", { id: DB.pl_students[0].id, role: "admin" }],
  ["student.advance", { id: DB.pl_students[0].id, step: "ca_approved" }],
  ["student.unlock", { id: DB.pl_students[0].id, step: "prep" }],
  ["student.sendCode", { id: DB.pl_students[1].id }],
  ["student.referral", { id: DB.pl_students[0].id, instructor_id: null }],
  ["password.set", { year_month: "2026-09", password: "x" }],
  ["cohort.create", { name: "pwned" }],
  ["member.place", { student_id: DB.pl_students[0].id, cohort_id: cohortId }],
  ["session.addStandard", { cohort_id: cohortId, date: "2026-11-07" }],
  ["cohort.classroom", { id: cohortId, slug: "hax" }]
]) {
  check(`a student cannot ${act}`, (await post(action, { action: act, data }, student.cookie)).status === 403, act);
}

// User-supplied ids go into PostgREST filter strings, so they must be encoded.
const actSrc = (await import("node:fs")).readFileSync(ROOT + "functions/api/classroom/action.js", "utf8");
const rawFilters = [...actSrc.matchAll(/`[^`]*\$\{data\.[a-zA-Z_]+\}/g)].map((x) => x[0]);
check("no user input is interpolated raw into a query filter", rawFilters.length === 0, rawFilters.slice(0, 3));

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

// The CA form demands a course start date the student can't know — they aren't placed until
// funding lands. So hand them valid dates and say plainly it isn't a commitment.
const { eligibleCourseDates: eligible, CA_WINDOW: win } = await import(`file://${R}/_lib/curriculum.js`);
const dates = eligible("2026-09-12");
check("every suggested date is a Saturday",
  dates.saturdays.every((d) => new Date(d + "T12:00:00Z").getUTCDay() === 6), dates.saturdays);
check("none is sooner than the lead time", dates.saturdays.every((d) => d >= dates.earliest), [dates.earliest, dates.saturdays[0]]);
check("none is beyond the outer limit", dates.saturdays.every((d) => d <= dates.latest));
check("the window is the published 45 to 90 days", win.minDays === 45 && win.maxDays === 90);
// Calendar days, settled — so every suggested date is simply valid, with no hedging.
check("the window is calendar days, stated", win.unit === "calendar days");
check("no date needs a caveat", dates.tightUntil === undefined);
check("CA students get the list", Array.isArray(m.funding.courseDates && m.funding.courseDates.saturdays));
check("non-CA students don't", (await (await get(me, payer.cookie)).json()).funding.courseDates === null);
const datePage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("and it says outright the date isn't their cohort",
  /will not be your cohort date/.test(datePage) && /not a commitment/.test(datePage));

// The wait between filing and funding is the longest dead stretch in the journey. Naming the
// stages turns "nothing is happening" into "here is where it is".
check("CA students are shown what happens during the wait",
  Array.isArray(m.funding.caStages) && m.funding.caStages.length >= 3, m.funding.caStages);
const armyRulesNow = (await import(`file://${R}/_lib/curriculum.js`)).caWarningsFor("army_ca");
check("the supervisor step is named as a first-line leader, not a commander",
  armyRulesNow.some((w) => /first-line leader/i.test(w.detail) && /does not have to go to your commander/i.test(w.detail)),
  armyRulesNow.map((w) => w.rule));
// Name it the way the portal does, or the student won't match the status to the step.
check("the credentialing office is named as the portal shows it",
  m.funding.caStages.some((x) => /\bACO\b/.test(x.stage)) &&
  !m.funding.caStages.some((x) => /ACAPO/.test(x.stage) || /ACAPO/.test(x.who)),
  m.funding.caStages.map((x) => x.stage));
check("approved and funded are separated, with the observed lag",
  m.funding.caStages.some((x) => /two and a half weeks/i.test(x.note) && /still not funded/i.test(x.note)));
// The step people stall on forever: approval doesn't release money, you have to go back and
// ask for it — and nobody chases you.
check("requesting the funding is shown as a separate step, and as the student's own",
  m.funding.caStages.some((x) => /request the funding/i.test(x.stage) && x.yours === true));
check("it says plainly that approval releases nothing",
  m.funding.caStages.some((x) => /releases no money/i.test(x.note)));
// A student can check whether they already did it: the button greys out once used.
check("and gives them a way to tell if they've already done it",
  m.funding.caStages.some((x) => /greyed out/i.test(x.note) && /already done it/i.test(x.note)));
check("creating the goal is distinguished from requesting funding",
  m.funding.caStages.some((x) => /create the goal/i.test(x.stage) && /not yet a funding request/i.test(x.note)));
check("and ArmyIgnitED's uninformative emails are called out",
  /you have a new message/i.test(m.funding.caNotifications || ""), m.funding.caNotifications);
const waitPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("and the waiting step leads with the step people miss",
  /Approval does not release the money\. You have to go back and ask for it\./.test(waitPage));
check("the student's own steps are marked as theirs in the list", /x\.yours \? "mine" : ""/.test(waitPage));
check("non-CA students get no stages", (await (await get(me, payer.cookie)).json()).funding.caStages === null);

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
  ["Two requests, one after the other", "The vendor name has to match exactly"].every((r) =>
    army.some((w) => w.rule === r) && af.some((w) => w.rule === r)),
  army.map((w) => w.rule));
// Consequences a student can't discover any other way until it costs them.
// Army COOL is the catalog of approved credentials; ArmyIgnitED is where the request is filed.
// People conflate them, so the step names which is which and deep-links the right credential.
const { armyCoolUrl: coolFor } = await import(`file://${R}/_lib/curriculum.js`);
check("each track deep-links its own Army COOL credential page",
  ["RBLP", "RBLP-C", "RBLP-T"].every((t) => /cool\.osd\.mil\/army\/credential\/.*cert=/.test(coolFor(t))) &&
  new Set(["RBLP", "RBLP-C", "RBLP-T"].map(coolFor)).size === 3,
  ["RBLP", "RBLP-C", "RBLP-T"].map(coolFor));
check("Army students get the COOL link", /cool\.osd\.mil/.test(m.funding.coolUrl || ""), m.funding.coolUrl);
check("it's Army-only — an Air Force student gets no COOL step",
  (await (async () => {
    const af = await signIn("af.cool@example.com");
    await post(action, { action: "funding.choose", data: { source: "af_ca" } }, af.cookie);
    return (await (await get(me, af.cookie)).json()).funding.coolUrl;
  })()) === null);
const coolPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("the step says COOL is a reference, not a form",
  /Army COOL is a reference, not a form/.test(coolPage));
check("and gives a fallback if the deep link ever breaks",
  /search Army COOL for/.test(coolPage) && /Resilience-Building Leadership Professional/.test(coolPage));
check("the three actions are numbered in the order they happen",
  /1\. Read the step-by-step/.test(coolPage) && /2\. Find it on Army COOL/.test(coolPage));

// FY26 caps, researched: $2,000 CA a year from a combined $4,500 TA+CA pool. RBLP-T at $1,590
// uses most of it, which a student should know before committing, not after.
const { caBudgetFor: budget, TRACKS: PRICED } = await import(`file://${R}/_lib/curriculum.js`);
check("every track carries its prep price and exam fee",
  Object.values(PRICED).every((t) => t.prepPrice > 0 && t.examFee > 0),
  Object.entries(PRICED).map(([k, t]) => `${k}:${t.prepPrice}/${t.examFee}`));
check("all three fit inside the $2,000 annual cap",
  Object.keys(PRICED).every((t) => budget(t).remaining >= 0),
  Object.keys(PRICED).map((t) => `${t}:${budget(t).total}`));
check("Trainer is flagged as using most of the year's allowance",
  budget("RBLP-T").tight === true && budget("RBLP").tight === false,
  [budget("RBLP-T").total, budget("RBLP").total]);
check("the combined TA+CA ceiling is stated", budget("RBLP").combinedCap === 4500);
check("CA students see the budget", !!m.funding.caBudget && m.funding.caBudget.yearCap === 2000);
check("non-CA students don't", (await (await get(me, payer.cookie)).json()).funding.caBudget === null);
check("the warnings carry the cap and the career limit",
  army.some((w) => /\$2,000/.test(w.rule)) &&
  army.some((w) => /three credentials per ten years/i.test(w.detail)));
check("and that CA spending eats into tuition assistance",
  army.some((w) => /same \$4,500 pool/.test(w.detail) && /reduces what's left for tuition/.test(w.detail)));

// Army CA Policy (11 Dec 2024): recoupment on day 181 after the passing training grade posts,
// and the trigger is failing to SUBMIT the exam funding request — not failing to take the exam.
check("Army students get the 180-day clock, measured from the grade posting",
  army.some((w) => /180 days/.test(w.rule) && /grade is entered/i.test(w.detail) && /not the day of the class/i.test(w.detail)),
  army.filter((w) => /180/.test(w.rule)).map((w) => w.detail));
check("and it's clear day 181 means recoupment",
  army.some((w) => /day 181/.test(w.detail)));
check("recoupment is explained as repaying the training",
  army.some((w) => /Recoupment/i.test(w.rule) && /takes back what it paid/i.test(w.detail)));
check("failing the course or exam is named as a trigger too",
  army.some((w) => /Failing the course or the exam/i.test(w.detail)));
check("and the 12-month suspension for two recoupments",
  army.some((w) => /12 months/.test(w.detail)));
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

// Students write long, personal answers here. Losing a tab used to lose everything typed
// since the last button press, so the work is now backed up locally on every keystroke and
// pushed to the server once they pause.
section("Worksheets: nothing typed can be lost");
const asPage = (await import("node:fs")).readFileSync(ROOT + "classroom/index.html", "utf8");
check("typing is captured, not just button presses", /addEventListener\("input"/.test(asPage));
check("every keystroke is backed up on the device", /localStorage\.setItem\(draftKey/.test(asPage));
check("the server save is debounced rather than fired per character",
  /SAVE_TIMERS\[key\] = setTimeout/.test(asPage));
check("leaving a field flushes it instead of waiting out the timer",
  /addEventListener\("blur"/.test(asPage));
check("closing the tab mid-sentence warns first", /beforeunload/.test(asPage));
// A student watching the status badge top-right saw nothing change and assumed autosave was
// dead. The save signal has to be where they are already looking, and on screen at any scroll.
check("the save state sits beside the status badge, where they look",
  /task-head-state">' \+ badge \+ '<span class="save-state"/.test(asPage));
check("and by the buttons too, so either end of a long task shows it",
  (asPage.match(/class="save-state"/g) || []).length >= 2);
check("every indicator in a task updates, not just the first",
  /\$\$\(".save-state", node\)\.forEach/.test(asPage));
check("the sticky bar carries an always-visible save state", /id="jumpSave"/.test(asPage));
check("it distinguishes saving from saved", /"Saving…" : SAVED_ONCE \? "All work saved"/.test(asPage));
check("in-flight saves are counted, so it can't read saved mid-request",
  /IN_FLIGHT\+\+/.test(asPage) && /IN_FLIGHT--/.test(asPage));
// Autosave can't re-render (it would drop the cursor), so the badge is corrected in place.
check("a first-ever autosave stops the badge claiming Not started",
  /refreshBadge\(node, payload\.status\)/.test(asPage));
check("the badge keeps ready and expanded rather than flattening them to draft",
  /status === "expanded" \? "Expanded after session" : status === "ready" \? "Ready" : "Draft"/.test(asPage));
check("autosave records the new server time for the stale-stash guard",
  /node\.dataset\.updated = new Date\(\)\.toISOString\(\)/.test(asPage));
check("a failed save says the work is still safe locally",
  /your work is safe on this device/.test(asPage));
check("work stranded by a failed save is restored on return",
  /Restored unsaved work from this device/.test(asPage));
// The trap: worksheet.save defaults a missing status to "draft", so an autosave that omitted
// it would silently un-ready a task the student had already marked ready for cohort.
check("autosave carries the task's existing status", /payload\.status = currentStatus\(node\)/.test(asPage));
check("the saved status is on the task node for autosave to read", /data-status="/.test(asPage));
// Readiness is one judgement about a module, not seven about its tasks, so the per-task status
// buttons are gone. Autosave was already doing the saving they appeared to do.
check("tasks no longer carry their own status buttons", !/data-save="/.test(asPage));
check("there is one ready control per module instead", /data-modready="/.test(asPage));
check("it reads as a decision about the whole module", /Mark module " \+ m\.num \+ " ready/.test(asPage));
check("and can be undone", /Reopen module " \+ m\.num/.test(asPage));
check("the module status is set in one call, not one per task",
  /api\("worksheet\.moduleStatus", \{ module_num: num, status: all \? "draft" : "ready" \}\)/.test(asPage));
check("anything still being typed is flushed and awaited before the status changes",
  /await flushPending\(\)/.test(asPage) && /await Promise\.all\(jobs\)/.test(asPage));

// Restoring is a write, so a wrong restore destroys good work. Both guards matter: a stash
// older than the server loses, and a restore fills empty fields but never empties full ones.
check("a stash older than the server's copy is discarded, not restored",
  /stashed\.at > serverAt/.test(asPage));
check("the server's save time is available to compare against", /data-updated="/.test(asPage));
check("an empty stashed value never blanks what the server holds",
  /typeof v === "string" && v && v !== ta\.value/.test(asPage));
check("a stash that has nothing to contribute is cleared rather than left to rot",
  (asPage.match(/localStorage\.removeItem\(draftKey/g) || []).length >= 3);

// Modules are collapsed accordions, so reviewing module 4 meant scrolling past everything
// before it.
section("Worksheets: reaching a module without scrolling");
check("there is a jump button per module", /data-jump="' \+ m\.num/.test(asPage));
check("each module is addressable by number", /data-mod="' \+ m\.num/.test(asPage));
check("the jump bar carries each module's ready count", /jump-n">' \+ ready \+ "\/"/.test(asPage));
check("the bar pins below the header while they scroll", /\.jump\{position:sticky;top:var\(--hdr/.test(asPage));
check("the header's real height is measured, not guessed (it wraps on a phone)",
  /--hdr", h\.offsetHeight/.test(asPage) && /addEventListener\("resize", syncHeaderOffset\)/.test(asPage));
check("jumping opens the module even when collapsed", /d\.open = true/.test(asPage));

// Marking a module ready should carry them onward, which is what keeps them with the instructor.
check("marking a module ready moves to the next module with work left",
  /x\.num > num && readyCount\(x\) < x\.tasks\.length/.test(asPage));
check("reopening a module deliberately does not move them", /if \(all\) return;/.test(asPage));
check("the target is spotlit so they can see where they landed", /classList\.add\("spotlight"\)/.test(asPage));
check("a fully ready module says so rather than nagging",
  /is ready for your cohort/.test(asPage));
// The instructor sinks covered tasks because they only care what's left to teach. A student
// reviewing before the oral must not have their own answers shuffled under them.
check("the student's tasks stay in module order, unlike the teaching view",
  /m\.tasks\.map\(function \(t\) \{ return taskHtml\(t\); \}\)/.test(asPage)
  && !/todo\.concat\(done\)[\s\S]{0,400}taskHtml/.test(asPage));

// Prove the server half: saving content with status "ready" keeps it ready.
await post(action, { action: "worksheet.save", data: { task_key: "m1_respect", what: "Treating people as people", status: "ready" } }, student.cookie);
let wsm = await (await get(me, student.cookie)).json();
check("a task marked ready is stored as ready", wsm.worksheets.responses.m1_respect.status === "ready",
  wsm.worksheets.responses.m1_respect.status);
await post(action, { action: "worksheet.save", data: { task_key: "m1_respect", what: "Treating people as people, even when it costs me", status: "ready" } }, student.cookie);
wsm = await (await get(me, student.cookie)).json();
check("an autosave replaying that status does not demote it to draft",
  wsm.worksheets.responses.m1_respect.status === "ready", wsm.worksheets.responses.m1_respect.status);
check("and the newly typed text is what was kept",
  /even when it costs me/.test(wsm.worksheets.responses.m1_respect.what));

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
