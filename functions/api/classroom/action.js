// POST /api/classroom/action — every classroom mutation, role-gated.
//
// Students may only ever touch their own row and their own worksheet responses; the student id
// comes from the signed session cookie, never from the request body. Instructors are scoped to
// cohorts they're assigned to. Admin (Tommy) can do everything.

import { sb, json } from "../../_lib/db.js";
import { currentStudent } from "../../_lib/session.js";
import { FUNDING, normalizeTrack, loadMembership, loadSessions, PIPELINE_STEPS, JOURNEY, routeFor, referralCodeFor } from "../../_lib/classroom.js";
import { transactionalEmail, sendEmail } from "../../_lib/email.js";
import { issueCode } from "../../_lib/session.js";
import { standardSession } from "../../_lib/curriculum.js";
import { allTaskKeys } from "../../_lib/curriculum.js";

const VALID_TASKS = new Set(allTaskKeys());
const VALID_STATUS = new Set(["empty", "draft", "ready", "expanded"]);

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = sb(env);
  if (!db.enabled) return json({ error: "The classroom isn't configured yet." }, 503);

  const me = await currentStudent(request, env, db);
  if (!me) return json({ error: "Please sign in again." }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }
  const { action, data = {} } = body || {};

  try {
    switch (action) {
      // ---------------------------------------------------------------- student
      case "profile.save": {
        const patch = {};
        if (data.display_name !== undefined) patch.display_name = String(data.display_name).trim().slice(0, 120) || null;
        // The cohort roster's rblp_type wins once enrolled, so this is only a pre-enrollment choice.
        if (data.track !== undefined) patch.track = normalizeTrack(data.track);
        await db.patch("pl_students", `id=eq.${me.id}`, patch);
        return json({ ok: true });
      }

      case "pipeline.confirmApplied": {
        // Step 3: "I submitted my free RBLP application and asked for Promote and Lead Solutions."
        const applied = data.applied !== false;
        await db.patch("pl_students", `id=eq.${me.id}`, {
          rblp_applied_at: applied ? new Date().toISOString() : null
        });
        return json({ ok: true });
      }

      case "pipeline.invoiceReceived": {
        // RBLP emails the two invoices straight to the student, so they're the one who knows.
        await setPipelineEvent(db, me.id, "invoice", data.done !== false);
        return json({ ok: true });
      }

      case "pipeline.caSubmitted": {
        // The date matters — the 45-day CA clock runs from here, and it can be back-dated.
        const on = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || "")) ? data.date : null;
        if (data.done === false) {
          await db.patch("pl_students", `id=eq.${me.id}`, { ca_submitted_on: null });
          await setPipelineEvent(db, me.id, "ca_submitted", false);
          return json({ ok: true });
        }
        if (!on) return json({ error: "Tell us the date you uploaded them — we need it for the 45-day clock." }, 400);
        await db.patch("pl_students", `id=eq.${me.id}`, { ca_submitted_on: on });
        await setPipelineEvent(db, me.id, "ca_submitted", true);
        return json({ ok: true });
      }

      // Anyone can buy prep straight from RBLP's storefront without ever seeing our site, so
      // students arrive already paid with no way to say so. They flag it; we confirm with RBLP.
      // They can't self-mark `paid` — that's still money, and money is confirmed, not claimed.
      case "pipeline.claimPurchase": {
        const when = data.done === false ? null : new Date().toISOString();
        const alreadyClaimed = !!me.purchase_claimed_at;
        await db.patch("pl_students", `id=eq.${me.id}`, { purchase_claimed_at: when });
        if (when && !alreadyClaimed) {
          await sendEmail(env, {
            to: env.NOTIFY_TO || "info@promoteandlead.com",
            subject: `Says they've already purchased — ${me.email}`,
            html: transactionalEmail(
              `<p style="margin:0 0 14px"><strong>${me.display_name || me.email}</strong> says they already bought their exam prep through RBLP.</p>` +
              `<p style="margin:0 0 14px">Check it with RBLP, then mark <strong>RBLP confirmed payment</strong> on their row in the classroom Admin tab. That unlocks their prep work and emails them.</p>` +
              `<p style="margin:0">${me.email}${me.track ? " &middot; " + me.track : ""}</p>`),
            text: `${me.email} says they already purchased exam prep. Confirm with RBLP, then mark it in the Admin tab.`
          });
        }
        return json({ ok: true });
      }

      // No link used? They can name the instructor who sent them, once. After that only an
      // admin can change it — this decides who gets paid, so it isn't a field to fiddle with.
      case "referral.name": {
        if (me.referred_by) return json({ error: "Your referral is already recorded. Email us if it's wrong." }, 400);
        if (!data.instructor_id) {
          await db.patch("pl_students", `id=eq.${me.id}`, { referred_via: "named", referred_by: null });
          return json({ ok: true, referredBy: null });
        }
        const inst = await db.select("pl_students",
          `select=id,role,display_name&id=eq.${data.instructor_id}&limit=1`);
        if (!inst.length || inst[0].role !== "instructor") return json({ error: "That isn't one of our instructors." }, 400);
        if (inst[0].id === me.id) return json({ error: "You can't refer yourself." }, 400);
        await db.patch("pl_students", `id=eq.${me.id}`, { referred_by: inst[0].id, referred_via: "named" });
        return json({ ok: true, referredBy: inst[0].display_name || null });
      }

      // Corrections are an admin job, because they move money.
      case "student.referral": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        if (!data.instructor_id) {
          await db.patch("pl_students", `id=eq.${data.id}`, { referred_by: null, referred_via: "admin" });
          return json({ ok: true });
        }
        const inst2 = await db.select("pl_students", `select=id,role&id=eq.${data.instructor_id}&limit=1`);
        if (!inst2.length || inst2[0].role !== "instructor") return json({ error: "Not an instructor." }, 400);
        if (inst2[0].id === data.id) return json({ error: "A student can't refer themselves." }, 400);
        await db.patch("pl_students", `id=eq.${data.id}`, { referred_by: inst2[0].id, referred_via: "admin" });
        return json({ ok: true });
      }

      case "funding.choose": {
        const key = String(data.source || "");
        if (!FUNDING[key]) return json({ error: "Pick one of the funding options." }, 400);
        await db.patch("pl_students", `id=eq.${me.id}`, {
          payment_source: key,
          branch: FUNDING[key].branch
        });
        // Mirror onto the CRM roster row so Tommy's admin view stays accurate.
        const membership = await loadMembership(db, me.email);
        if (membership && FUNDING[key].paymentType) {
          try {
            await db.patch("pl_cohort_members", `id=eq.${membership.id}`, {
              payment_type: FUNDING[key].paymentType,
              branch: FUNDING[key].branch
            });
          } catch (e) { /* CRM mirror is best-effort */ }
        }
        return json({ ok: true });
      }

      case "worksheet.save": {
        const taskKey = String(data.task_key || "");
        if (!VALID_TASKS.has(taskKey)) return json({ error: "Unknown worksheet task." }, 400);
        const status = VALID_STATUS.has(data.status) ? data.status : "draft";
        const row = {
          student_id: me.id,
          task_key: taskKey,
          module_num: Number(String(taskKey).match(/^m(\d)/)?.[1] || 0),
          what_text: text(data.what, 4000),
          why_text: text(data.why, 4000),
          life_text: text(data.life, 4000),
          story_text: text(data.story, 8000),
          notdo_text: text(data.notdo, 4000),
          plan_text: text(data.plan, 4000),
          status,
          updated_at: new Date().toISOString()
        };
        await db.upsert("pl_worksheet_responses", row, "student_id,task_key");
        return json({ ok: true });
      }

      case "exam.scheduled": {
        await setPipelineEvent(db, me.id, "exam", data.done !== false);
        return json({ ok: true });
      }

      // ---------------------------------------------------------------- instructor
      case "attendance.mark": {
        const gate = await requireCohortAccess(env, db, me, data.cohort_id);
        if (gate) return gate;
        const sessionId = String(data.session_id || "");
        const email = String(data.student_email || "").toLowerCase();
        if (!sessionId || !email) return json({ error: "Missing session or student." }, 400);
        await db.upsert("pl_attendance", {
          session_id: sessionId,
          student_email: email,
          present: data.present !== false,
          minutes: data.minutes != null ? Number(data.minutes) : null,
          marked_by: me.email,
          updated_at: new Date().toISOString()
        }, "session_id,student_email");
        return json({ ok: true });
      }

      case "cohort.notes": {
        const gate = await requireCohortAccess(env, db, me, data.cohort_id);
        if (gate) return gate;
        await db.patch("pl_cohorts", `id=eq.${data.cohort_id}`, { instructor_notes: text(data.notes, 8000) });
        return json({ ok: true });
      }

      // Finishing OUR training, which is not the same as passing RBLP's exam. This used to write
      // status "passed", which now means the credential was awarded — it would have jumped people
      // to the end of their journey on the day of the class.
      case "member.certify": {
        const gate = await requireCohortAccess(env, db, me, data.cohort_id);
        if (gate) return gate;
        await db.patch("pl_cohort_members", `id=eq.${data.member_id}`, {
          certified_on: data.certified_on || new Date().toISOString().slice(0, 10),
          status: "completed"
        });
        return json({ ok: true });
      }

      // End of the day: complete everyone who actually attended, in one click. Their training
      // certificate is available the moment this lands — they just refresh.
      case "class.complete": {
        const gate = await requireCohortAccess(env, db, me, data.cohort_id);
        if (gate) return gate;
        const sessions = await loadSessions(db, data.cohort_id);
        const ids = sessions.map((x) => x.id);
        if (!ids.length) return json({ error: "This cohort has no sessions yet." }, 400);

        const att = await db.select("pl_attendance",
          `select=student_email,present&session_id=in.(${ids.map(encodeURIComponent).join(",")})`);
        const present = new Set(att.filter((a) => a.present).map((a) => (a.student_email || "").toLowerCase()));
        if (!present.size) return json({ error: "Mark attendance first — nobody is recorded as present." }, 400);

        const members = await db.select("pl_cohort_members", `select=*&cohort_id=eq.${data.cohort_id}`);
        const on = data.certified_on || new Date().toISOString().slice(0, 10);
        let completed = 0;
        for (const mem of members) {
          if (!present.has((mem.email || "").toLowerCase()) || mem.certified_on) continue;
          await db.patch("pl_cohort_members", `id=eq.${mem.id}`, { certified_on: on, status: "completed" });
          completed++;
        }
        return json({ ok: true, completed, skipped: present.size - completed });
      }

      // ---------------------------------------------------------------- admin
      case "cohort.classroom": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        const patch = {};
        for (const k of ["slug", "teams_url", "instructor_email", "password_month_key", "classroom_status"]) {
          if (data[k] !== undefined) patch[k] = text(data[k], 300) || null;
        }
        if (data.tracks_allowed !== undefined) {
          patch.tracks_allowed = Array.isArray(data.tracks_allowed)
            ? data.tracks_allowed.filter((t) => ["RBLP", "RBLP-C", "RBLP-T"].includes(t))
            : null;
        }
        await db.patch("pl_cohorts", `id=eq.${data.id}`, patch);
        return json({ ok: true });
      }

      // Pick the Saturday; the times come from the standard day shape. Typing 09:00 and 15:30
      // into a form by hand is how a cohort ends up an hour out, or in the wrong timezone.
      case "session.addStandard": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        if (!data.cohort_id) return json({ error: "Which cohort?" }, 400);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date || ""))) return json({ error: "Pick a date." }, 400);
        const std = standardSession(data.date);
        if (!std.starts_at) return json({ error: "That date didn't parse." }, 400);
        await db.insert("pl_cohort_sessions", {
          cohort_id: data.cohort_id,
          label: std.label,
          starts_at: std.starts_at,
          ends_at: std.ends_at,
          instructional_minutes: std.instructional_minutes
        });
        return json({ ok: true, window: std.window });
      }

      case "session.add": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        if (!data.cohort_id || !data.starts_at) return json({ error: "Cohort and start time are required." }, 400);
        await db.insert("pl_cohort_sessions", {
          cohort_id: data.cohort_id,
          label: text(data.label, 200) || null,
          starts_at: data.starts_at,
          ends_at: data.ends_at || null,
          instructional_minutes: data.instructional_minutes != null ? Number(data.instructional_minutes) : null
        });
        return json({ ok: true });
      }

      case "session.delete": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        await db.remove("pl_cohort_sessions", `id=eq.${data.id}`);
        return json({ ok: true });
      }

      case "password.set": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        const ym = String(data.year_month || "");
        if (!/^\d{4}-\d{2}$/.test(ym)) return json({ error: "Use YYYY-MM for the month." }, 400);
        await db.upsert("pl_module_passwords", {
          year_month: ym, password: text(data.password, 200), updated_at: new Date().toISOString()
        }, "year_month");
        return json({ ok: true });
      }

      case "student.role": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        // Only student and instructor are assignable. Admin is granted by CLASSROOM_ADMINS and
        // nothing else, so there's no path here to create a second company admin.
        if (!["student", "instructor"].includes(data.role)) {
          return json({ error: "Roles here are student or instructor. Admin is set in CLASSROOM_ADMINS." }, 400);
        }
        await db.patch("pl_students", `id=eq.${data.id}`, { role: data.role });
        // A new instructor needs a share link straight away, or referral pay has no mechanism.
        if (data.role === "instructor") {
          const who2 = await db.select("pl_students", `select=email,referral_code&id=eq.${data.id}&limit=1`);
          if (who2.length && !who2[0].referral_code) {
            const all = await db.select("pl_students", "select=referral_code&referral_code=neq.null&limit=500");
            const code = referralCodeFor(who2[0].email, all.map((x) => x.referral_code).filter(Boolean));
            await db.patch("pl_students", `id=eq.${data.id}`, { referral_code: code });
          }
        }
        return json({ ok: true });
      }

      // The three facts that only reach us by email — RBLP confirming an application, RBLP
      // giving us the CA thumbs-up, and a self-pay payment landing. Marking one moves the
      // student's journey on AND tells them, so nobody is left refreshing the page.
      case "student.advance": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        const step = String(data.step || "");
        if (!ADMIN_STEPS[step]) return json({ error: "Not a step we can mark." }, 400);
        const rows = await db.select("pl_students", `select=*&id=eq.${data.id}&limit=1`);
        if (!rows.length) return json({ error: "No such student." }, 404);
        const who = rows[0];

        // Marking a step that's ALREADY marked must not send the notification again. Two quick
        // clicks both read the button as "not yet done" — the re-render hasn't landed — and the
        // student gets the same congratulations twice. The guard lives here rather than in the
        // UI so it holds however the call arrives.
        const existing = await db.select("pl_pipeline_events",
          `select=completed_at&student_id=eq.${who.id}&step=eq.${encodeURIComponent(step)}&limit=1`);
        const alreadyDone = !!(existing.length && existing[0].completed_at);

        await setPipelineEvent(db, who.id, step, data.done !== false);

        let emailed = false;
        if (data.done !== false && data.notify !== false && !alreadyDone) {
          // The roster's rblp_type wins over the self-selected track, same as everywhere else.
          const mem = await loadMembership(db, who.email);
          const theirTrack = normalizeTrack((mem && mem.rblp_type) || who.track);
          const note = ADMIN_STEPS[step](who, theirTrack);
          emailed = await sendEmail(env, {
            to: who.email,
            subject: note.subject,
            html: transactionalEmail(note.html),
            text: note.text
          });
        }
        return json({ ok: true, emailed, alreadyDone });
      }

      // ---------------------------------------------------------------- cohorts + placement
      //
      // Placing a student was the one thing the journey promised ("We put you in a cohort")
      // that the classroom couldn't actually do — it lived in the separate CRM. The roster row
      // is the source of truth for enrollment, track and certification, so placing someone
      // mirrors their classroom profile onto it rather than asking Tommy to retype it.
      case "cohort.create": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        const name = text(data.name, 120).trim();
        if (!name) return json({ error: "Give the cohort a name." }, 400);
        const row = {
          name,
          slug: text(data.slug, 40).trim() || null,
          session_date: /^\d{4}-\d{2}-\d{2}$/.test(String(data.session_date || "")) ? data.session_date : null,
          capacity: Number(data.capacity) > 0 ? Number(data.capacity) : 6,
          status: "open",
          classroom_status: "draft"
        };
        await db.insert("pl_cohorts", row);

        // A cohort IS its Saturday. Asking for the date here and then again under Sessions is
        // the same question twice, so create the standard session straight away.
        if (row.session_date) {
          const made = await db.select("pl_cohorts",
            `select=id&name=eq.${encodeURIComponent(row.name)}&order=created_at.desc&limit=1`);
          const std = standardSession(row.session_date);
          if (made.length && std.starts_at) {
            await db.insert("pl_cohort_sessions", {
              cohort_id: made[0].id,
              label: std.label,
              starts_at: std.starts_at,
              ends_at: std.ends_at,
              instructional_minutes: std.instructional_minutes
            });
          }
        }
        return json({ ok: true });
      }

      case "member.place": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        const studentRows = await db.select("pl_students", `select=*&id=eq.${data.student_id}&limit=1`);
        if (!studentRows.length) return json({ error: "No such student." }, 404);
        const st = studentRows[0];
        const email = (st.email || "").toLowerCase();

        // Moving between cohorts, or removing entirely, is the same call with a different id.
        const existing = await db.select("pl_cohort_members", `select=*&email=eq.${encodeURIComponent(email)}`);
        if (!data.cohort_id) {
          for (const mm of existing) await db.remove("pl_cohort_members", `id=eq.${mm.id}`);
          return json({ ok: true, placed: false });
        }

        const cohorts = await db.select("pl_cohorts", `select=id&id=eq.${data.cohort_id}&limit=1`);
        if (!cohorts.length) return json({ error: "No such cohort." }, 404);

        const track = normalizeTrack(data.rblp_type || st.track);
        const fund = FUNDING[st.payment_source];
        const patch = {
          cohort_id: data.cohort_id,
          email,
          name: st.display_name || null,
          rblp_type: track,
          payment_type: fund ? fund.paymentType : null,
          branch: st.branch || (fund ? fund.branch : null)
        };
        if (existing.length) {
          await db.patch("pl_cohort_members", `id=eq.${existing[0].id}`, patch);
          for (const dupe of existing.slice(1)) await db.remove("pl_cohort_members", `id=eq.${dupe.id}`);
        } else {
          await db.insert("pl_cohort_members", { ...patch, status: "applied" });
        }
        return json({ ok: true, placed: true });
      }

      // There are no passwords to reset — sign-in is a one-time code to the student's own
      // address. This is the equivalent: send them a fresh one. It goes to them, never to us.
      case "student.sendCode": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        const rows2 = await db.select("pl_students", `select=email,display_name&id=eq.${data.id}&limit=1`);
        if (!rows2.length) return json({ error: "No such student." }, 404);
        const target = rows2[0];
        const { code, ttlMinutes } = await issueCode(env, db, target.email);
        const sent = await sendEmail(env, {
          to: target.email,
          subject: `${code} is your Promote & Lead classroom code`,
          html: transactionalEmail(
            `<p style="margin:0 0 14px">Here's a fresh sign-in code for the <strong>Promote &amp; Lead classroom</strong>:</p>` +
            `<p style="margin:0 0 14px;font-size:34px;letter-spacing:9px;font-weight:700;color:#0B2E6D;font-family:Arial,Helvetica,sans-serif">${code}</p>` +
            `<p style="margin:0 0 14px">It expires in ${ttlMinutes} minutes and can only be used once. There's no password to remember — this is how you sign in every time.</p>` +
            `<p style="margin:0">Still stuck? Just reply to this email.</p>`),
          text: `Your Promote & Lead classroom sign-in code is ${code}. It expires in ${ttlMinutes} minutes.`
        });
        return json({ ok: true, sent });
      }

      case "student.unlock": {
        if (me.role !== "admin") return json({ error: "Admins only." }, 403);
        if (!PIPELINE_STEPS.includes(data.step)) return json({ error: "Unknown pipeline step." }, 400);
        await setPipelineEvent(db, data.id, data.step, data.done !== false);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}

// What we say when each handoff lands. Plain, short, and it always names the next action —
// these go to people who are juggling a CA portal and an RBLP account and our classroom.
const ADMIN_STEPS = {
  rblp_received: (s) => ({
    subject: "RBLP has your application — here's what happens next",
    html: `<p style="margin:0 0 14px">Good news — <strong>RBLP has received your application</strong> and we're listed as your instructor.</p>` +
      (routeFor(s.payment_source) === "CA"
        ? `<p style="margin:0 0 14px">Next, RBLP emails you <strong>two invoices</strong> — one for the exam and one for the training. Watch for them.</p>` +
          `<p style="margin:0 0 14px">When they arrive, you upload <strong>both</strong> on your branch's Credentialing Assistance website. RBLP has step-by-step instructions for your branch — your classroom links straight to them, so start there.</p>` +
          `<p style="margin:0 0 14px">One thing to watch: when it asks for the training company, select <strong>RLS</strong>. That's the approved partner CA pays through.</p>`
        : `<p style="margin:0 0 14px">Next, buy your exam prep on rblp.com with Promote and Lead Solutions as your instructor — RBLP handles the payment. As soon as they confirm it, you go into the next available cohort.</p>`) +
      `<p style="margin:0">Sign in at <a href="https://promoteandlead.com/classroom">promoteandlead.com/classroom</a> to see where you are.</p>`,
    text: "RBLP has received your application. Sign in at promoteandlead.com/classroom to see your next step."
  }),
  ca_approved: (s) => ({
    subject: "Your CA funding is approved — your prep work is open",
    html: `<p style="margin:0 0 14px">Congratulations — <strong>your Credentialing Assistance funding is approved</strong>.</p>` +
      `<p style="margin:0 0 14px">Your prep work is now unlocked. <strong>Start in your classroom</strong> — it shows you this month's module password and takes you straight to the right page on RBLP's site, so there's nothing to hunt for.</p>` +
      `<p style="margin:0 0 14px">This is the part that wins the exam — students who come to the live session with drafts get far more out of the day.</p>` +
      `<p style="margin:0"><a href="https://promoteandlead.com/classroom">Open your classroom</a></p>`,
    text: "Your CA funding is approved and your prep work is unlocked. Sign in at promoteandlead.com/classroom."
  }),
  paid: () => ({
    subject: "Payment received — your prep work is open",
    html: `<p style="margin:0 0 14px">RBLP have confirmed <strong>your payment</strong>, and your prep work is unlocked.</p>` +
      `<p style="margin:0 0 14px"><strong>Start in your classroom</strong> — it shows you this month's module password and takes you straight to the right page on RBLP's site, so there's nothing to hunt for.</p>` +
      `<p style="margin:0 0 14px">You'll go into the next available cohort; we'll confirm the date and send your Teams link.</p>` +
      `<p style="margin:0"><a href="https://promoteandlead.com/classroom">Open your classroom</a></p>`,
    text: "Payment received — your prep work is unlocked at promoteandlead.com/classroom."
  }),
  // RBLP-T is the qualification RBLP require of an ATP instructor, so someone who has just
  // earned it is both eligible and at the most enthusiastic they will ever be about this
  // material. Only ever sent to Trainers — inviting an RBLP or Coach graduate to teach would
  // be a promise we can't keep.
  certified: (s, track) => ({
    subject: "You're RBLP certified — congratulations",
    html: `<p style="margin:0 0 14px"><strong>You passed.</strong> RBLP has awarded your credential — congratulations.</p>` +
      `<p style="margin:0 0 14px">Your classroom stays open. Your answers and stories are yours to come back to whenever you need them.</p>` +
      (track === "RBLP-T"
        ? `<p style="margin:0 0 14px">One more thing. <strong>RBLP-T is the qualification RBLP require to teach this</strong>, which means you're now eligible to instruct — and you've just been through the whole thing from the other side, which is the best preparation there is.</p>` +
          `<p style="margin:0 0 14px">Our instructors run one Saturday a month, teaching the material you've just worked through. You'd be paid per student, and more for the ones you bring yourself. We give you the full facilitator guide, the run of day and the cohort — you bring the stories.</p>` +
          `<p style="margin:0 0 14px"><strong>If that sounds like you, just reply to this email</strong> and we'll set up a conversation. No pressure either way.</p>`
        : "") +
      `<p style="margin:0">And if you'd share a short review, it genuinely helps the next cohort.</p>`,
    text: track === "RBLP-T"
      ? "You passed — RBLP has awarded your credential. Congratulations. You're now RBLP-T, which qualifies you to instruct for Promote and Lead. Reply if you'd like to talk about teaching a cohort."
      : "You passed — RBLP has awarded your credential. Congratulations."
  })
};

function text(v, max) {
  return v == null ? "" : String(v).slice(0, max);
}

async function setPipelineEvent(db, studentId, step, done) {
  if (done) {
    await db.upsert("pl_pipeline_events",
      { student_id: studentId, step, completed_at: new Date().toISOString() }, "student_id,step");
  } else {
    await db.remove("pl_pipeline_events", `student_id=eq.${studentId}&step=eq.${encodeURIComponent(step)}`);
  }
}

// Instructors are limited to cohorts they're assigned to; admins pass through.
async function requireCohortAccess(env, db, me, cohortId) {
  if (me.role === "admin") return null;
  if (me.role !== "instructor") return json({ error: "You don't have access to that." }, 403);
  if (!cohortId) return json({ error: "Missing cohort." }, 400);
  const rows = await db.select("pl_cohorts", `select=id&id=eq.${cohortId}&instructor_email=eq.${encodeURIComponent(me.email)}&limit=1`);
  if (!rows.length) return json({ error: "That cohort isn't yours." }, 403);
  return null;
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  return onRequestPost(context);
}
