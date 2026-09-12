// GET /api/classroom/me — everything the signed-in student's classroom needs in one payload:
// profile, pipeline, cohort card, worksheets, module deep-links + month password.

import { sb, json } from "../../_lib/db.js";
import { currentStudent } from "../../_lib/session.js";
import {
  MODULES, TRACKS, FUNDING, modulesForTrack, normalizeTrack,
  loadMembership, loadSessions, loadAttendance, loadResponses, loadPipelineEvents,
  currentModulePassword, worksheetProgress, hoursProgress, buildPipeline, fundingGuidance, routeFor,
  certificateData
} from "../../_lib/classroom.js";
import { FACILITATION, SOP_CHECKLIST, STORY_SOURCES, MODULE_STUDY, MODULE_ARC, STUDY_HABITS, EXAM_PREP, EXAM_FACTS, EXAM_BOOKING, caWarningsFor, CA_STAGES, eligibleCourseDates, runOfDay, dayFor, DAY_NOTES, WHY_PREP, RBLP_SUPPORT } from "../../_lib/curriculum.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const db = sb(env);
  if (!db.enabled) return json({ error: "The classroom isn't configured yet." }, 503);

  const student = await currentStudent(request, env, db);
  if (!student) return json({ signedIn: false }, 200);

  try {
    const membership = await loadMembership(db, student.email);
    const cohort = membership && membership.cohort;
    const track = normalizeTrack((membership && membership.rblp_type) || student.track);

    const sessions = await loadSessions(db, cohort && cohort.id);
    const attendance = await loadAttendance(db, student.email, sessions.map((s) => s.id));
    const responses = await loadResponses(db, student.id);
    const events = await loadPipelineEvents(db, student.id);
    const modulePassword = await currentModulePassword(db, cohort);

    const worksheets = worksheetProgress(track, responses);
    const hours = hoursProgress(track, sessions, attendance);
    const pipeline = buildPipeline({ student, membership, events, worksheets, hours });
    const certificate = certificateData({ student, membership, track, sessions, attendance, hours, pipeline });

    const attendanceBySession = {};
    for (const a of attendance) attendanceBySession[a.session_id] = { present: a.present, minutes: a.minutes };

    // Only the modules for this student's track — RBLP-C never sees module 5's worksheet.
    const trackModules = modulesForTrack(track);
    const responsesByKey = {};
    for (const r of responses) {
      responsesByKey[r.task_key] = {
        what: r.what_text || "", why: r.why_text || "", life: r.life_text || "",
        story: r.story_text || "", notdo: r.notdo_text || "", plan: r.plan_text || "",
        status: r.status || "empty", updatedAt: r.updated_at
      };
    }

    return json({
      signedIn: true,
      profile: {
        id: student.id,
        email: student.email,
        displayName: student.display_name || "",
        role: student.role,
        track,
        trackLocked: !!(membership && membership.rblp_type),
        paymentSource: student.payment_source || null,
        branch: student.branch || null,
        rblpAppliedAt: student.rblp_applied_at || null,
        caSubmittedOn: student.ca_submitted_on || null,
        purchaseClaimedAt: student.purchase_claimed_at || null,
        referredBy: student.referred_by || null,
        referredVia: student.referred_via || null
      },
      pipeline,
      funding: {
        options: Object.entries(FUNDING).map(([k, v]) => ({ key: k, label: v.label })),
        guidance: student.payment_source ? fundingGuidance(student.payment_source) : null,
        // Only for the CA route — everyone else has no packet to bounce.
        // Branch-specific: Army and Air Force have genuinely different rules.
        caWarnings: caWarningsFor(student.payment_source),
        // What's happening during the wait — otherwise it reads as nothing happening.
        caStages: routeFor(student.payment_source) === "CA" ? CA_STAGES : null,
        // The form wants a start date they can't know yet — hand them valid ones.
        courseDates: routeFor(student.payment_source) === "CA" ? eligibleCourseDates() : null
      },
      cohort: cohort
        ? {
            id: cohort.id,
            slug: cohort.slug || cohort.name,
            name: cohort.name,
            teamsUrl: cohort.teams_url || null,
            status: cohort.classroom_status || cohort.status,
            memberStatus: membership.status,
            certifiedOn: membership.certified_on || null,
            sessions: sessions.map((s) => ({
              id: s.id, label: s.label, startsAt: s.starts_at, endsAt: s.ends_at,
              instructionalMinutes: s.instructional_minutes,
              attendance: attendanceBySession[s.id] || null
            }))
          }
        : null,
      hours,
      certificate,
      worksheets: {
        unlocked: pipeline.worksheetsUnlocked,
        progress: worksheets,
        storySources: STORY_SOURCES,
        modules: MODULES.filter((m) => trackModules.includes(m.num)).map((m) => ({
          num: m.num, title: m.title, url: m.url, theme: m.theme, glossary: m.glossary,
          study: MODULE_STUDY[m.num] || null,
          tasks: m.tasks.map((t) => ({ ...t, response: responsesByKey[t.key] || null }))
        })),
        responses: responsesByKey
      },
      modulePassword,
      // How to study, how the modules build, and what exam day asks of them.
      rblpSupport: RBLP_SUPPORT,
      // Only shown when they haven't already been attributed, so they can name who sent them.
      instructors: student.referred_by || student.referred_via
        ? null
        : (await db.select("pl_students", "select=id,display_name,email&role=eq.instructor&order=display_name&limit=100"))
            .map((i) => ({ id: i.id, name: i.display_name || i.email.split("@")[0] })),
      study: { habits: STUDY_HABITS, arc: MODULE_ARC, exam: EXAM_PREP, whyPrep: WHY_PREP,
               examFacts: EXAM_FACTS, booking: EXAM_BOOKING },
      // The whole cohort day, marked up for this student: which blocks are theirs, and where
      // they finish. They see the rest greyed rather than hidden — the room keeps going, and
      // it's worth them knowing why the person beside them is staying.
      day: { blocks: runOfDay(track), mine: dayFor(track), shape: DAY_NOTES.shape, departures: DAY_NOTES.departures },
      tracks: TRACKS,
      instructorNotes: student.role === "instructor" || student.role === "admin"
        ? { facilitation: FACILITATION, sop: SOP_CHECKLIST }
        : null
    });
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  return onRequestGet(context);
}
