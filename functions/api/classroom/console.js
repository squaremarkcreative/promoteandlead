// GET /api/classroom/console — instructor + admin data. Instructors see only their cohorts.
//
// Student worksheet TEXT is never returned here — instructors see completion percentages only
// (the MVP cut in the brief). Students' own words stay theirs.

import { sb, json } from "../../_lib/db.js";
import { currentStudent, effectiveRole } from "../../_lib/session.js";
import {
  MODULES, TRACKS, normalizeTrack, loadSessions, worksheetProgress, hoursProgress, monthKey, routeFor,
  buildPipeline, certificateForMember
} from "../../_lib/classroom.js";
import {
  FACILITATION, SOP_CHECKLIST, COACHING, MODULE_OPENINGS, MODULE_TEACHING,
  SESSION_RHYTHM, FACILITATION_CARDS, MIXED_COHORT_NOTE, MODULE_ARC,
  runOfDay, dayFor, DAY_NOTES, INSTRUCTOR_PAY, MOCK_EXAMINER
} from "../../_lib/curriculum.js";

// The handoffs Tommy marks — each one emails the student. Order is the order they happen in.
// How long someone can sit on one step before it's worth a nudge. Not a hard rule — it just
// surfaces them, so Tommy decides whether to reach out.
const STALLED_AFTER_DAYS = 14;

// Each label states what YOU are confirming, not what the student hopes is true. Nothing says
// "approved" anywhere the student can see until the matching button here has been pressed.
const ADMIN_HANDOFFS = [
  { step: "rblp_received", label: "RBLP has their application", hint: "RBLP told you the application is in", route: "any" },
  { step: "ca_approved",   label: "RBLP confirmed funding",     hint: "RBLP gave you the CA thumbs-up — this unlocks their prep work and emails them", route: "CA" },
  { step: "paid",          label: "RBLP confirmed payment",      hint: "RBLP told you their payment landed — this unlocks their prep work and emails them", route: "Normal" },
  { step: "certified",     label: "Passed the exam",            hint: "RBLP awarded their credential", route: "any" }
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = sb(env);
  if (!db.enabled) return json({ error: "The classroom isn't configured yet." }, 503);

  const me = await currentStudent(request, env, db);
  if (!me) return json({ error: "Please sign in again." }, 401);
  if (me.role !== "instructor" && me.role !== "admin") return json({ error: "You don't have access to that." }, 403);

  try {
    const isAdmin = me.role === "admin";
    const cohorts = await db.select(
      "pl_cohorts",
      isAdmin
        ? "select=*&order=created_at.desc"
        : `select=*&instructor_email=eq.${encodeURIComponent(me.email)}&order=created_at.desc`
    );

    const out = [];
    for (const c of cohorts) {
      const members = await db.select("pl_cohort_members", `select=*&cohort_id=eq.${c.id}&order=name.asc`);
      const sessions = await loadSessions(db, c.id);
      const sessionIds = sessions.map((s) => s.id);

      const attendance = sessionIds.length
        ? await db.select("pl_attendance", `select=*&session_id=in.(${sessionIds.join(",")})`)
        : [];

      const emails = members.map((m) => (m.email || "").toLowerCase()).filter(Boolean);
      const students = emails.length
        ? await db.select("pl_students", `select=id,email,display_name,role,track,payment_source,rblp_applied_at&email=in.(${emails.map(encodeURIComponent).join(",")})`)
        : [];
      const studentByEmail = {};
      for (const s of students) studentByEmail[s.email.toLowerCase()] = s;

      const ids = students.map((s) => s.id);
      const responses = ids.length
        ? await db.select("pl_worksheet_responses", `select=student_id,task_key,status&student_id=in.(${ids.join(",")})`)
        : [];
      const responsesByStudent = {};
      for (const r of responses) (responsesByStudent[r.student_id] ||= []).push(r);

      out.push({
        id: c.id,
        slug: c.slug || c.name,
        name: c.name,
        teamsUrl: c.teams_url || null,
        instructorEmail: c.instructor_email || null,
        tracksAllowed: c.tracks_allowed || null,
        classroomStatus: c.classroom_status || c.status,
        passwordMonthKey: c.password_month_key || null,
        notes: c.instructor_notes || "",
        sessions: sessions.map((s) => ({
          id: s.id, label: s.label, startsAt: s.starts_at, endsAt: s.ends_at,
          instructionalMinutes: s.instructional_minutes
        })),
        roster: members.map((m) => {
          const email = (m.email || "").toLowerCase();
          const s = studentByEmail[email];
          const track = normalizeTrack(m.rblp_type || (s && s.track));
          const mine = attendance.filter((a) => (a.student_email || "").toLowerCase() === email);
          return {
            memberId: m.id,
            studentId: s ? s.id : null,
            name: m.name || (s && s.display_name) || null,
            email: m.email,
            hasAccount: !!s,
            track,
            paymentType: m.payment_type || null,
            paymentSource: s ? s.payment_source : null,
            branch: m.branch || null,
            status: m.status,
            certifiedOn: m.certified_on || null,
            rblpApplied: !!(s && s.rblp_applied_at),
            // Percentage only — never the student's written answers.
            worksheets: worksheetProgress(track, s ? (responsesByStudent[s.id] || []) : []),
            hours: hoursProgress(track, sessions, mine),
            attendance: mine.reduce((acc, a) => { acc[a.session_id] = { present: a.present, minutes: a.minutes }; return acc; }, {})
          };
        })
      });
    }

    const payload = {
      role: me.role,
      cohorts: out,
      facilitation: FACILITATION,
      sop: SOP_CHECKLIST,
      // The facilitator outline is the same task list the students filled in — same sheet of music.
      // The facilitator outline doubles as the teaching guide: the same task list the students
      // filled in, plus how to open each one, an example to model, and the question to ask.
      // Instructor-only by virtue of living on this endpoint — it never enters /me.
      outline: MODULES.map((m) => ({
        num: m.num,
        title: m.title,
        theme: m.theme,
        opening: MODULE_OPENINGS[m.num] || null,
        tasks: m.tasks.map((t) => ({ key: t.key, title: t.title, coaching: COACHING[t.key] || null })),
        glossary: m.glossary,
        teaching: MODULE_TEACHING[m.num] || null
      })),
      rhythm: SESSION_RHYTHM,
      pay: INSTRUCTOR_PAY,
      mockExaminer: MOCK_EXAMINER,
      // One day for the whole cohort, planned for Trainers. The instructor needs to see where
      // each track leaves — that's who's still in the room after lunch.
      day: {
        blocks: runOfDay("RBLP-T"),
        notes: DAY_NOTES,
        tracks: Object.fromEntries(Object.keys(TRACKS).map((t) => [t, dayFor(t)]))
      },
      cards: FACILITATION_CARDS,
      mixedCohorts: MIXED_COHORT_NOTE,
      arc: MODULE_ARC,
      tracks: TRACKS
    };

    if (isAdmin) {
      const students = await db.select("pl_students", "select=id,email,display_name,role,track,payment_source,ca_submitted_on,purchase_claimed_at,rblp_applied_at,created_at,last_login_at&order=created_at.desc&limit=500");
      // Which handoffs have already been marked, so the admin buttons show state instead of
      // Tommy having to remember whether he already told someone their CA came through.
      const evs = await db.select("pl_pipeline_events", "select=student_id,step,completed_at&limit=5000");
      const byStudent = {};
      for (const e of evs) {
        if (!e.completed_at) continue;
        (byStudent[e.student_id] || (byStudent[e.student_id] = {}))[e.step] = e.completed_at;
      }
      // Everything needed to place each student on their journey, in four bulk queries rather
      // than four per student.
      const allMembers = await db.select("pl_cohort_members", "select=*,cohort:pl_cohorts(*)&limit=1000");
      const allSessions = await db.select("pl_cohort_sessions", "select=*&limit=1000");
      const allResponses = await db.select("pl_worksheet_responses", "select=student_id,task_key,status&limit=20000");
      const allAttendance = await db.select("pl_attendance", "select=student_email,session_id,present,minutes&limit=5000");

      const memberByEmail = {};
      for (const mm of allMembers) memberByEmail[(mm.email || "").toLowerCase()] = mm;
      const respByStudent = {};
      for (const r of allResponses) (respByStudent[r.student_id] || (respByStudent[r.student_id] = [])).push(r);
      const attByEmail = {};
      for (const a of allAttendance) {
        const k = (a.student_email || "").toLowerCase();
        (attByEmail[k] || (attByEmail[k] = [])).push(a);
      }

      const withStage = students.map((s) => {
        const evs = byStudent[s.id] || {};
        const membership = memberByEmail[(s.email || "").toLowerCase()] || null;
        const track = normalizeTrack((membership && membership.rblp_type) || s.track);
        const sessions = membership && membership.cohort_id
          ? allSessions.filter((x) => x.cohort_id === membership.cohort_id) : [];
        const worksheets = worksheetProgress(track, respByStudent[s.id] || []);
        const hours = hoursProgress(track, sessions, attByEmail[(s.email || "").toLowerCase()] || []);
        const jp = buildPipeline({ student: s, membership, events: evs, worksheets, hours });

        // How long they've sat where they are: the clock starts at the most recent thing that
        // moved — a marked step, or the day they signed up if nothing has yet.
        const stamps = Object.values(evs).filter(Boolean).sort();
        const since = stamps.length ? stamps[stamps.length - 1] : s.created_at;
        const days = since ? Math.floor((Date.now() - new Date(since).getTime()) / 86400000) : null;

        return {
          ...s,
          // Effective role, not the stored one — anyone in CLASSROOM_ADMINS is an admin whatever
          // the column says, and showing Tommy to himself as a "student" is just confusing.
          role: effectiveRole(env, s),
          storedRole: s.role,
          route: jp.route,
          steps: evs,
          stage: {
            key: jp.current.key, title: jp.current.title, phase: jp.current.phase,
            owner: jp.current.owner, ownerLabel: jp.current.ownerLabel,
            since, days, completed: jp.completed, total: jp.total
          },
          // The whole journey with the date each step landed, for the detail panel.
          timeline: jp.steps.map((st) => ({
            key: st.key, title: st.title, phase: st.phase, owner: st.owner,
            ownerLabel: st.ownerLabel, done: st.done, at: evs[st.key] || null
          }))
        };
      });

      // Every training certificate we've issued. These go to RBLP to trigger our invoice, so the
      // company admin needs them all in one place rather than chasing students for copies.
      const studentByEmail = {};
      for (const st of students) studentByEmail[(st.email || "").toLowerCase()] = st;
      const certificates = allMembers
        .filter((mm) => mm.certified_on)
        .sort((x, y) => String(y.certified_on).localeCompare(String(x.certified_on)))
        .map((mm) => ({
          memberId: mm.id,
          email: mm.email,
          cohort: mm.cohort ? mm.cohort.slug || mm.cohort.name : null,
          paymentType: mm.payment_type || null,
          certificate: certificateForMember(mm, studentByEmail[(mm.email || "").toLowerCase()] || null)
        }));

      payload.admin = {
        students: withStage,
        certificates,
        stalledAfterDays: STALLED_AFTER_DAYS,
        handoffs: ADMIN_HANDOFFS,
        passwords: await db.select("pl_module_passwords", "select=*&order=year_month.desc&limit=24"),
        currentMonth: monthKey()
      };
    }

    return json(payload);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  return onRequestGet(context);
}
