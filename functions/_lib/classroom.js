// Classroom domain logic shared by /api/classroom/me, /action and /console.

import { TRACKS, MODULES, modulesForTrack, tasksForTrack } from "./curriculum.js";

export const FUNDING = {
  army_ca:   { label: "Army Credentialing Assistance (CA)", branch: "Army",        paymentType: "CA" },
  af_ca:     { label: "Air Force Credentialing Assistance (CA)", branch: "Air Force", paymentType: "CA" },
  navy_cool: { label: "Navy COOL",     branch: "Navy",         paymentType: "Normal" },
  usmc_cool: { label: "Marine Corps COOL", branch: "USMC",     paymentType: "Normal" },
  cg_cool:   { label: "Coast Guard COOL", branch: "Coast Guard", paymentType: "Normal" },
  self_pay:  { label: "Self-pay",      branch: null,           paymentType: "Normal" },
  affirm:    { label: "Affirm (0% financing)", branch: null,   paymentType: "Affirm" },
  other:     { label: "Something else / not sure yet", branch: null, paymentType: null }
};

// ---------------------------------------------------------------- the journey
//
// One visible path from "I'm interested" to "I'm certified". Most of our students fund this
// with Army Credentialing Assistance, so the CA route is the main line, not a branch.
//
// Every step says whose court the ball is in. Five of these steps are handoffs to people who
// don't work here — RBLP, the student's CA office — and a student staring at a checkbox that
// isn't moving needs to know whether to chase someone or just wait. `owner` drives that.
//
//   you   — the student acts next
//   pls   — Promote & Lead acts next
//   rblp  — waiting on RBLP
//   ca    — waiting on their CA office
//
// `only` narrows a step to one funding route: CA students file invoices and wait for approval,
// self-pay and Affirm students simply pay and take the next cohort.
export const OWNERS = {
  you:  { label: "Your move",            hint: "This one's on you." },
  pls:  { label: "With Promote & Lead",  hint: "We're on it — nothing for you to do." },
  rblp: { label: "With RBLP",            hint: "Waiting on RBLP. We'll tell you the moment it moves." },
  ca:   { label: "With your CA office",  hint: "Waiting on your Credentialing Assistance office." }
};

export const JOURNEY = [
  {
    phase: "Get started",
    steps: [
      { key: "account",     owner: "you",  title: "Create your free Promote & Lead account", titleDone: "Account created",
        blurb: "Done — you're here." },
      { key: "profile",     owner: "you",  title: "Tell us your credential and how you're paying", titleDone: "Credential and funding chosen",
        blurb: "Which certification you're going for, and how it's being funded. Everything after this is shaped by your answers." }
    ]
  },
  {
    phase: "Get funded",
    steps: [
      { key: "rblp_apply",    owner: "you",  title: "Apply free at RBLP", titleDone: "You've applied at RBLP",
        blurb: "The RBLP application is free and takes about ten minutes. When it asks for your instructor, choose Promote and Lead Solutions, LLC." },
      { key: "rblp_received", owner: "rblp", title: "Waiting on RBLP to confirm your application", titleDone: "RBLP has your application",
        blurb: "RBLP tells us once your application is in. We'll email you the moment they do." },
      { key: "invoice",       owner: "rblp", title: "Watch for your training invoice from RBLP", titleDone: "Training invoice received", only: "CA",
        blurb: "One invoice, for the exam prep training. The exam is invoiced separately later — RBLP raise that one once your completion certificate shows you've finished the course." },
      { key: "ca_submitted",  owner: "you",  title: "File your CA request for the training", titleDone: "Training request filed", only: "CA",
        blurb: "Just the training. CA funds the course and the exam as two separate goals, and you can't have both open at once — the exam request comes after you've finished the course and your grade posts. RBLP keeps the step-by-step instructions for your branch; open them first." },
      { key: "ca_approved",   owner: "ca",   title: "Waiting on your CA decision", titleDone: "Your CA funding is approved", only: "CA",
        blurb: "Your CA office reviews the request. RBLP lets us know the moment it clears, and your prep work opens then — we'll email you." },
      { key: "paid",          owner: "you",  title: "Buy your exam prep on rblp.com", titleDone: "Payment received", only: "Normal",
        blurb: "Purchase on RBLP's site, naming Promote and Lead Solutions as your instructor — they collect payment for both the prep and the exam. Once they confirm it with us, your prep work opens and you go into the next available cohort. No waiting period." }
    ]
  },
  {
    phase: "Train",
    steps: [
      { key: "enrolled",    owner: "pls", title: "We put you in a cohort", titleDone: "You're in a cohort",
        blurb: "We place you in the next cohort you're eligible for and send you the date and the Teams link." },
      { key: "prep",        owner: "you", title: "Do your prep work", titleDone: "Prep work complete",
        blurb: "Read the modules and draft your own answer and story for every leader task. Your credential expects hours of personal reflection before the session — this is where they go, and it's the part that decides how the exam goes." },
      { key: "attend",      owner: "you", title: "Attend your live cohort session", titleDone: "You attended your session",
        blurb: "One Saturday online. You'll expand the answers you already drafted." },
      { key: "certificate", owner: "pls", title: "Get your training certificate", titleDone: "Training certificate issued",
        blurb: "We issue your completion certificate — the document your CA office asks for." }
    ]
  },
  {
    phase: "Get certified",
    steps: [
      // CA funds the course and the exam as two separate goals, and the second can only be
      // opened once the first has a posted grade. Students who don't know that assume their
      // funding covered everything, then discover the exam isn't paid for.
      { key: "ca_exam",   owner: "you",  title: "File your second CA request — for the exam", titleDone: "Exam funding requested", only: "CA",
        blurb: "With your certificate issued, RBLP can invoice for the exam — and your training grade posting is what lets you open the second CA goal. Two separate requests by design; they could never have been filed together." },
      { key: "exam",      owner: "you",  title: "Schedule and sit your RBLP oral exam", titleDone: "Exam scheduled",
        blurb: "The exam is with RBLP, not with us. Your prepared answers stay here for you to rehearse from." },
      { key: "certified", owner: "rblp", title: "Waiting on RBLP to award your credential", titleDone: "You're RBLP certified",
        blurb: "That's it — you're certified." }
    ]
  }
];

export const PIPELINE_STEPS = JOURNEY.flatMap((p) => p.steps.map((s) => s.key));

// CA students walk the invoice/approval line; everyone else just pays.
export function routeFor(paymentSource) {
  const f = FUNDING[paymentSource];
  return f && f.paymentType === "CA" ? "CA" : "Normal";
}

export function stepsForRoute(route) {
  return JOURNEY.map((p) => ({
    phase: p.phase,
    steps: p.steps.filter((s) => !s.only || s.only === route)
  }));
}

export function normalizeTrack(t) {
  return TRACKS[t] ? t : "RBLP";
}

// The cohort roster is the existing admin CRM table (pl_cohort_members), matched on email —
// so Tommy keeps one roster, not two. `rblp_type` there wins over the student's self-selection.
export async function loadMembership(db, email) {
  const rows = await db.select(
    "pl_cohort_members",
    `select=*,cohort:pl_cohorts(*)&email=eq.${encodeURIComponent(email)}&order=created_at.desc`
  );
  return rows.find((r) => r.status !== "dropped" && r.cohort) || rows[0] || null;
}

export async function loadSessions(db, cohortId) {
  if (!cohortId) return [];
  return db.select("pl_cohort_sessions", `select=*&cohort_id=eq.${cohortId}&order=starts_at.asc`);
}

export async function loadAttendance(db, studentEmail, sessionIds) {
  if (!sessionIds.length) return [];
  return db.select(
    "pl_attendance",
    `select=*&student_email=eq.${encodeURIComponent(studentEmail)}&session_id=in.(${sessionIds.join(",")})`
  );
}

export function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Month-rotated ATP Academy password for the official modules — one per month, not per student.
export async function currentModulePassword(db, cohort) {
  const key = (cohort && cohort.password_month_key) || monthKey();
  const rows = await db.select("pl_module_passwords", `select=*&year_month=eq.${encodeURIComponent(key)}&limit=1`);
  return rows.length ? { yearMonth: key, password: rows[0].password } : { yearMonth: key, password: null };
}

export async function loadResponses(db, studentId) {
  return db.select("pl_worksheet_responses", `select=*&student_id=eq.${studentId}`);
}

export async function loadPipelineEvents(db, studentId) {
  const rows = await db.select("pl_pipeline_events", `select=*&student_id=eq.${studentId}`);
  const map = {};
  for (const r of rows) map[r.step] = r.completed_at;
  return map;
}

// Worksheet progress for the student's track only (RBLP-C isn't graded on module 5).
export function worksheetProgress(track, responses) {
  const required = tasksForTrack(track);
  const byKey = {};
  for (const r of responses) byKey[r.task_key] = r;
  const ready = required.filter((k) => {
    const r = byKey[k];
    return r && (r.status === "ready" || r.status === "expanded");
  });
  const started = required.filter((k) => {
    const r = byKey[k];
    return r && (r.life_text || r.story_text || r.what_text || r.why_text);
  });
  return {
    required: required.length,
    started: started.length,
    ready: ready.length,
    percent: required.length ? Math.round((ready.length / required.length) * 100) : 0
  };
}

export function hoursProgress(track, sessions, attendance) {
  const requiredHours = TRACKS[normalizeTrack(track)].paybackHours;
  const byId = {};
  for (const a of attendance) byId[a.session_id] = a;

  // Hours follow the CREDENTIAL, not the length of the room. A cohort is one Trainer-shaped day
  // and students leave as their credential completes — an RBLP sits 3 hours of it, a Coach 4, a
  // Trainer 5 — so "present" credits exactly what that student's certificate is allowed to
  // claim. The session's own instructional_minutes is the whole day and must not cap a Trainer
  // or inflate an RBLP.
  //
  // An explicitly recorded figure still wins, for the rare partial attendance the CRM records
  // by hand. The total is capped at the credential either way: we can't claim more hours than
  // the certificate carries.
  const trackMinutes = requiredHours * 60;
  let minutes = 0;
  let presentWithoutFigure = false;
  for (const s of sessions) {
    const a = byId[s.id];
    if (!a || !a.present) continue;
    if (a.minutes != null) minutes += a.minutes;
    else presentWithoutFigure = true;
  }
  if (presentWithoutFigure) minutes = Math.max(minutes, trackMinutes);
  minutes = Math.min(minutes, trackMinutes);
  return {
    requiredHours,
    attendedHours: Math.round((minutes / 60) * 10) / 10,
    attendedMinutes: minutes,
    percent: requiredHours ? Math.min(100, Math.round((minutes / 60 / requiredHours) * 100)) : 0
  };
}

// Works out where the student actually is. A row in pl_pipeline_events always counts as done —
// that's Tommy's manual override, and it's also how the admin-only steps (RBLP confirmed, CA
// approved, payment received) get marked, since those facts reach us by email, not by API.
//
// Prep work stays shut until the money is confirmed. That's deliberate: the prep work is what
// we sell, and it comes with the month password into RBLP's own material — nobody starts it
// before their funding is real.
export function buildPipeline({ student, membership, events, worksheets, hours }) {
  const done = (step) => !!events[step];
  const cohort = membership && membership.cohort;
  const route = routeFor(student.payment_source);

  const applied = done("rblp_apply") || !!student.rblp_applied_at;
  const state = {
    account: true,
    profile: done("profile") || !!(student.track && student.payment_source),
    rblp_apply: applied,
    rblp_received: done("rblp_received"),
    invoice: done("invoice"),
    ca_submitted: done("ca_submitted") || !!student.ca_submitted_on,
    ca_approved: done("ca_approved"),
    paid: done("paid"),
    enrolled: done("enrolled") || !!cohort,
    attend: done("attend") || hours.attendedMinutes > 0,
    certificate: done("certificate") || !!(membership && membership.certified_on),
    exam: done("exam"),
    // Only the admin marking it. Completing our training is `certificate`; this is RBLP's award.
    certified: done("certified")
  };

  // The gate. CA students wait for approval; everyone else for their payment to land.
  const funded = route === "CA" ? state.ca_approved : state.paid;
  state.prep = done("prep") || (funded && worksheets.required > 0 && worksheets.ready >= worksheets.required);

  const phases = stepsForRoute(route).map((p) => ({
    phase: p.phase,
    steps: p.steps.map((s) => ({
      key: s.key,
      // A step that hasn't happened must never read as though it has. "Your CA funding is
      // approved" on a student who is still waiting is worse than useless — it's misleading.
      title: state[s.key] ? (s.titleDone || s.title) : s.title,
      blurb: s.blurb,
      owner: s.owner,
      ownerLabel: OWNERS[s.owner].label,
      ownerHint: OWNERS[s.owner].hint,
      done: !!state[s.key],
      // Prep is the one step with a hard lock — everything else is simply "not there yet".
      locked: s.key === "prep" && !funded
    }))
  }));

  const flat = phases.flatMap((p) => p.steps.map((s) => ({ ...s, phase: p.phase })));
  // The current step is the first one not finished. Done-ness runs in order, so this is also
  // the thing to put in front of the student.
  const current = flat.find((s) => !s.done) || flat[flat.length - 1];

  return {
    route,
    phases,
    steps: flat,
    currentStep: current.key,
    current,
    fundingConfirmed: !!funded,
    worksheetsUnlocked: !!funded,
    completed: flat.filter((s) => s.done).length,
    total: flat.length
  };
}

// ---------------------------------------------------------------- certificate
//
// The completion certificate students hand in with a Credentialing Assistance claim.
// Mirrors "Cert templates/CA Pay Cert Template.pptx" — the same wording, laid out in HTML so
// the level, hours and date come from the student's record instead of being retyped each time.
//
// Which organisation is named matters for reimbursement: CA money is processed by RLS, the
// government-approved ATP, so a CA student's certificate has to say RLS or the claim doesn't
// match the paperwork. Everyone else is taught and certified by PLS directly. Keyed off
// FUNDING[...].paymentType so a future CA source is picked up without touching this.
// The letterhead follows the named organisation — an RLS-headed certificate that credits PLS
// in its body reads as a mistake to whoever is checking the claim.
export const CERT_ORGS = {
  RLS: { name: "Resilient Leadership Solutions", short: "RLS", logo: "/assets/cert/rls-logo.png" },
  PLS: { name: "Promote and Lead Solutions, LLC", short: "PLS", logo: "/assets/logo-full.png" }
};

export function certificateOrg(paymentSource) {
  const f = FUNDING[paymentSource];
  return f && f.paymentType === "CA" ? CERT_ORGS.RLS : CERT_ORGS.PLS;
}

// The date on the certificate: the day it was issued if the CRM recorded one, otherwise the
// last session the student actually sat in. Never "today" — a certificate reprinted in
// December must still read the day they completed the course.
export function certificateDate(membership, sessions, attendance) {
  if (membership && membership.certified_on) return membership.certified_on;
  const byId = {};
  for (const a of attendance || []) byId[a.session_id] = a;
  const attended = (sessions || [])
    .filter((s) => byId[s.id] && byId[s.id].present && s.starts_at)
    .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)));
  return attended.length ? attended[0].starts_at : null;
}

// The same certificate, built from a roster row rather than a signed-in student — so the admin
// can reprint anyone's. Tommy has to send these to RBLP to get paid, which means he needs a copy
// of every certificate issued, not just the ones students happen to download.
export function certificateForMember(member, student) {
  const track = normalizeTrack(member.rblp_type || (student && student.track));
  const name = ((student && student.display_name) || member.name || "").trim();
  const source = (student && student.payment_source) || null;
  // Fall back to the roster's payment_type when the student never chose one in the classroom.
  const org = source ? certificateOrg(source)
    : (member.payment_type === "CA" ? CERT_ORGS.RLS : CERT_ORGS.PLS);

  return {
    available: !!(member.certified_on && name),
    needsName: !!(member.certified_on && !name),
    name,
    track,
    modules: TRACKS[track].modules.length,
    hours: TRACKS[track].paybackHours,
    cohortSlug: member.cohort ? member.cohort.slug || member.cohort.name : null,
    issuedOn: member.certified_on,
    org,
    instructor: { name: "Thomas Hendler", title: "Instructor / Promote and Lead" }
  };
}

// Everything the certificate page prints. `available` gates the download: the certificate
// step has to be done, and there has to be a name to put on it.
export function certificateData({ student, membership, track, sessions, attendance, hours, pipeline }) {
  const t = normalizeTrack(track);
  const step = pipeline.steps.find((s) => s.key === "certificate");
  const name = (student.display_name || "").trim();
  const issuedOn = certificateDate(membership, sessions, attendance);
  const cohort = membership && membership.cohort;

  return {
    available: !!(step && step.done && name && issuedOn),
    needsName: !!(step && step.done && !name),
    name,
    track: t,
    modules: TRACKS[t].modules.length,
    hours: hours.requiredHours,
    cohortSlug: cohort ? cohort.slug || cohort.name : null,
    issuedOn,
    org: certificateOrg(student.payment_source),
    instructor: { name: "Thomas Hendler", title: "Instructor / Promote and Lead" }
  };
}

// The exact wording the brief requires for the CA path: file under RLS, but the
// instructor of record with RBLP is Promote and Lead Solutions, LLC.
export function fundingGuidance(source) {
  switch (source) {
    case "army_ca":
    case "af_ca":
      return {
        heading: "Filing Credentialing Assistance",
        // Two company names on one credential looks wrong if nobody explains it, and a Soldier
        // being asked to type an unfamiliar name into a funding request is right to hesitate.
        // Say who RLS is and why they're on the form, rather than just instructing.
        body: [
          "You'll see **two company names** during this, and that's normal — one is who the government pays, the other is who teaches you.",
          "**Resilient Leadership Solutions (RLS)** is an RBLP Authorized Training Partner and the approved vendor registered in the Credentialing Assistance system. CA pays RLS. Promote and Lead delivers your training in partnership with them, which is why RLS is the company name on your funding request.",
          "**Promote and Lead Solutions, LLC (PLS)** is your instructor of record with RBLP. That's the name to give RBLP, and it's who you'll actually be in the room with.",
          "You'll see RLS on your completion certificate too, for the same reason — that's the name your CA office is expecting to match against the request they funded.",
          "Once your CA request is approved, come back here and continue your enrollment."
        ],
        link: source === "army_ca"
          ? "https://rblp.com/follow-these-steps-to-use-army-cool-ca/"
          : "https://rblp.com/follow-these-steps-to-use-air-force-cool-ca/",
        // The step tells them to upload on their branch's site, so give them the actual door.
        // RBLP's page explains HOW; these are WHERE. Both, in that order.
        portal: source === "army_ca"
          ? { name: "ArmyIgnitED", url: "https://www.armyignited.army.mil/",
              hint: "Your CA request starts and finishes here. Since March 2026 it also routes your commander's approval." }
          : { name: "AFVEC", url: "https://afvec.us.af.mil",
              hint: "Sign in, then Education Programs → AF COOL." }
      };
    case "navy_cool":
      return {
        heading: "Navy COOL",
        body: ["Navy COOL pays for the **RBLP exam** through COOL. Exam prep training with Promote and Lead is paid out of pocket (or with another funding source)."],
        link: "https://rblp.com/follow-these-steps-to-use-navy-cool/"
      };
    case "usmc_cool":
      return {
        heading: "Marine Corps COOL",
        body: ["Marine Corps COOL pays for the **RBLP exam**. Exam prep training with Promote and Lead is paid out of pocket (or with another funding source)."],
        link: "https://rblp.com/follow-these-steps-to-use-marine-corps-cool/"
      };
    case "cg_cool":
      return {
        heading: "Coast Guard",
        body: ["Get your **Coast Guard COOL approval first**, then come back and continue your enrollment."],
        link: "https://rblp.com/leadership-certifications/apply/"
      };
    case "affirm":
      return {
        heading: "Affirm — spread the cost",
        body: [
          "You buy your exam prep on **rblp.com**, choosing **Promote and Lead Solutions, LLC** as your instructor. RBLP collects the payment — we never handle it.",
          "**Affirm** is offered at RBLP's checkout. The rate and length you're offered are decided by Affirm and shown to you there before you commit."
        ],
        link: null
      };
    case "self_pay":
      return {
        heading: "Paying for it yourself",
        body: [
          "You buy your exam prep on **rblp.com**, choosing **Promote and Lead Solutions, LLC** as your instructor. RBLP collects the payment — we never handle money directly, which is also why your receipt comes from them.",
          "Once RBLP tells us it's paid, we unlock your prep work and put you in the next available cohort. Stuck at checkout? Email info@promoteandlead.com."
        ],
        link: null
      };
    default:
      return {
        heading: "Not sure yet?",
        body: ["Tell us at info@promoteandlead.com and we'll help you work out which funding path fits — most students use military Credentialing Assistance or COOL."],
        link: null
      };
  }
}

export { TRACKS, MODULES, modulesForTrack, tasksForTrack };

// ---------------------------------------------------------------- referrals
//
// Instructors are paid more for a seat they brought than for one that was already in the room,
// so "who referred this student" is a money fact. It has to be recorded at the moment it
// happens and then left alone — reconstructing it later from memory is how people fall out.
//
// Two ways in. The link is the good one: an instructor hands out their own URL and the code
// rides along to account creation. The named fallback catches everyone who signed up without
// it. Either way the student sets it once; only an admin can change it afterwards.
export const REFERRAL_VIA = { link: "Referral link", named: "Named at signup", admin: "Set by admin" };

// Human-typeable, derived from their address so it's guessable in a good way — Mary can say
// "use my link" or read it out loud. Falls back to a suffix on collision.
export function referralCodeFor(email, taken) {
  const base = String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14) || "coach";
  if (!taken || !taken.includes(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.includes(base + i)) return base + i;
  return base + Date.now().toString(36).slice(-4);
}

export function referralLink(code) {
  return code ? `https://promoteandlead.com/classroom/?ref=${encodeURIComponent(code)}` : null;
}
