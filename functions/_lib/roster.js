// Every student's journey in one pass: the admin tab's student list and the daily digest both
// read from this, so they can never disagree about where someone is or how long they've been there.

import { buildPipeline, normalizeTrack, worksheetProgress, hoursProgress } from "./classroom.js";
import { effectiveRole } from "./session.js";

// How long someone can sit on one step before it's worth a nudge. Not a hard rule — it surfaces
// them so Tommy decides whether to reach out.
export const STALLED_AFTER_DAYS = 14;

const DAY_MS = 86400000;

// When a student last moved. Several moves are recorded on the student row or elsewhere rather
// than as pipeline events — applying at RBLP, filing CA, claiming a purchase, being placed or
// certified, and above all writing prep work. Counting only events made a student who was
// writing every day look like they'd gone quiet.
export function lastMovedAt({ student, events, membership, lastWorksheetAt }) {
  const stamps = [
    ...Object.values(events || {}),
    student.rblp_applied_at,
    student.ca_submitted_on,
    student.purchase_claimed_at,
    membership && membership.created_at,
    membership && membership.certified_on,
    lastWorksheetAt
  ].filter(Boolean).map(String).sort();
  // ISO dates and timestamps sort correctly as strings; the latest is last.
  return stamps.length ? stamps[stamps.length - 1] : student.created_at || null;
}

export function daysSince(iso, now) {
  if (!iso) return null;
  return Math.max(0, Math.floor(((now || Date.now()) - new Date(iso).getTime()) / DAY_MS));
}

// Five bulk queries for everyone, not five per student.
export async function loadJourneys(db, env, { now } = {}) {
  const students = await db.select("pl_students",
    "select=id,email,display_name,role,track,payment_source,ca_submitted_on,purchase_claimed_at,rblp_applied_at," +
    "referral_code,referred_by,referred_via,created_at,last_login_at&order=created_at.desc&limit=500");
  const evRows = await db.select("pl_pipeline_events", "select=student_id,step,completed_at&limit=5000");
  const members = await db.select("pl_cohort_members", "select=*,cohort:pl_cohorts(*)&limit=1000");
  const sessions = await db.select("pl_cohort_sessions", "select=*&limit=1000");
  const responses = await db.select("pl_worksheet_responses", "select=student_id,task_key,status,updated_at&limit=20000");
  const attendance = await db.select("pl_attendance", "select=student_email,session_id,present,minutes&limit=5000");

  const eventsBy = {};
  for (const e of evRows) {
    if (!e.completed_at) continue;
    (eventsBy[e.student_id] || (eventsBy[e.student_id] = {}))[e.step] = e.completed_at;
  }
  const memberBy = {};
  for (const m of members) memberBy[(m.email || "").toLowerCase()] = m;
  const respBy = {};
  for (const r of responses) (respBy[r.student_id] || (respBy[r.student_id] = [])).push(r);
  const attBy = {};
  for (const a of attendance) {
    const k = (a.student_email || "").toLowerCase();
    (attBy[k] || (attBy[k] = [])).push(a);
  }

  return {
    members,
    journeys: students.map((student) => {
      const email = (student.email || "").toLowerCase();
      const events = eventsBy[student.id] || {};
      const membership = memberBy[email] || null;
      const track = normalizeTrack((membership && membership.rblp_type) || student.track);
      const cohortSessions = membership && membership.cohort_id
        ? sessions.filter((x) => x.cohort_id === membership.cohort_id) : [];
      const mine = respBy[student.id] || [];
      const worksheets = worksheetProgress(track, mine);
      const hours = hoursProgress(track, cohortSessions, attBy[email] || []);
      const pipeline = buildPipeline({ student, membership, events, worksheets, hours });
      const lastWorksheetAt = mine.map((r) => r.updated_at).filter(Boolean).sort().pop() || null;
      const since = lastMovedAt({ student, events, membership, lastWorksheetAt });
      return {
        student, role: effectiveRole(env, student), events, membership, track,
        sessions: cohortSessions, pipeline, since, days: daysSince(since, now)
      };
    })
  };
}
