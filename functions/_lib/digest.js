// The daily digest: who is waiting on Tommy, who is stuck with RBLP or a CA office, and who has
// gone quiet. The instant alerts cover the moment a handoff happens; this catches everything that
// has been sitting since.
//
// Nothing to report means no email — a digest that arrives every day saying "all clear" trains
// you to stop opening it.

import { sendEmail, internalEmail, escapeHtml } from "./email.js";
import { loadJourneys, STALLED_AFTER_DAYS, daysSince } from "./roster.js";
import { FUNDING } from "./classroom.js";
import { ALERT_TO_DEFAULT } from "./alerts.js";

const ADMIN_URL = "https://promoteandlead.com/classroom/#/admin";

// Things only Tommy can move, today, whatever their age.
const YOURS = {
  enrolled:    () => "Funding is confirmed — place them in a cohort.",
  certificate: () => "They've attended — certify them from the Instructor tab so they get their certificate.",
  paid:        () => "They say they've already paid — check with RBLP, then press RBLP confirmed payment."
};

// Waiting on someone else, but Tommy presses the button when it lands. Worth a chase once stale.
const CHASE = {
  rblp_received: "RBLP hasn't confirmed their application",
  ca_approved:   "Their CA request hasn't been approved",
  certified:     "RBLP hasn't awarded their credential"
};

function nameOf(s) {
  return (s.display_name || "").replace(/\s+/g, " ").trim() || s.email;
}

export function classify(journeys, { now } = {}) {
  const yours = [], chase = [], quiet = [];
  for (const j of journeys) {
    if (j.role !== "student") continue;
    const cur = j.pipeline.current;
    if (!cur || cur.done) continue;        // journey finished
    const key = cur.key;
    const row = {
      name: nameOf(j.student), email: j.student.email, track: j.track,
      funding: (FUNDING[j.student.payment_source] || {}).label || null,
      step: cur.title, days: j.days
    };

    if (key === "paid" && !j.student.purchase_claimed_at) {
      // Hasn't bought yet — that's theirs, not Tommy's.
    } else if (YOURS[key]) {
      yours.push({ ...row, todo: YOURS[key](j) });
      continue;
    }

    if (CHASE[key]) {
      if (j.days >= STALLED_AFTER_DAYS) chase.push({ ...row, todo: CHASE[key] + ` — ${j.days} days.` });
      continue;
    }

    if (cur.owner !== "you" || j.days < STALLED_AFTER_DAYS) continue;

    // Waiting for a cohort date isn't going quiet. Only flag it once the date has passed.
    if (key === "attend") {
      const last = j.sessions.map((x) => x.starts_at).filter(Boolean).sort().pop();
      if (!last || new Date(last).getTime() > (now || Date.now()) - 86400000) continue;
      quiet.push({ ...row, todo: "Their cohort session has passed with no attendance recorded." });
      continue;
    }

    let todo = `No movement in ${j.days} days — worth a nudge.`;
    if (key === "ca_exam" && j.membership && j.membership.certified_on) {
      // The one that costs them money: 180 days from grade posting, then the Army recoups.
      todo = `Certified ${daysSince(j.membership.certified_on, now)} days ago and hasn't filed for the exam. ` +
        "The 180-day limit runs from their grade posting — worth a nudge before it becomes a recoupment.";
    }
    quiet.push({ ...row, todo });
  }

  const byDays = (a, b) => (b.days || 0) - (a.days || 0);
  return { yours: yours.sort(byDays), chase: chase.sort(byDays), quiet: quiet.sort(byDays),
    total: yours.length + chase.length + quiet.length };
}

function section(title, blurb, rows) {
  if (!rows.length) return "";
  return `<h2 style="font-size:16px;margin:22px 0 4px;color:#0B2E6D">${title} (${rows.length})</h2>` +
    `<p style="margin:0 0 10px;color:#666;font-size:13px">${blurb}</p>` +
    rows.map((r) =>
      `<div style="border:1px solid #eee;border-radius:8px;padding:10px 12px;margin:0 0 8px">` +
        `<div><strong>${escapeHtml(r.name)}</strong> <span style="color:#888;font-size:13px">` +
          `${escapeHtml([r.track, r.funding].filter(Boolean).join(" · "))}</span></div>` +
        `<div style="font-size:13px;color:#555;margin:2px 0 6px">${escapeHtml(r.step)}` +
          `${r.days != null ? ` · ${r.days} day${r.days === 1 ? "" : "s"} on this step` : ""}</div>` +
        `<div style="font-size:14px">${escapeHtml(r.todo)}</div>` +
        `<div style="font-size:12px;color:#888;margin-top:4px">${escapeHtml(r.email)}</div>` +
      `</div>`).join("");
}

export function digestEmail(d) {
  const parts = [
    d.yours.length && `${d.yours.length} need${d.yours.length === 1 ? "s" : ""} you`,
    d.chase.length && `${d.chase.length} to chase`,
    d.quiet.length && `${d.quiet.length} gone quiet`
  ].filter(Boolean);
  const subject = `Classroom daily: ${parts.join(", ")}`;

  const html =
    `<p style="margin:0 0 6px">Here's where your students are sitting this morning.</p>` +
    section("Needs you", "Only you can move these.", d.yours) +
    section("Worth chasing", `Waiting on RBLP or a CA office for ${STALLED_AFTER_DAYS}+ days — you press the button once it lands.`, d.chase) +
    section("Gone quiet", `Their move, but nothing has happened in ${STALLED_AFTER_DAYS}+ days.`, d.quiet) +
    `<p style="margin:20px 0 0"><a href="${ADMIN_URL}" style="display:inline-block;background:#0B2E6D;color:#fff;` +
      `text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">Open the admin tab</a></p>`;

  const textRows = (t, rows) => rows.length
    ? `\n${t}\n` + rows.map((r) => `- ${r.name} (${r.email}) — ${r.step}: ${r.todo}`).join("\n") + "\n" : "";
  const text = `Classroom daily\n` + textRows("NEEDS YOU", d.yours) + textRows("WORTH CHASING", d.chase) +
    textRows("GONE QUIET", d.quiet) + `\n${ADMIN_URL}`;

  return { subject, html: internalEmail(html), text };
}

export async function runDigest(db, env, { now, send = true } = {}) {
  const { journeys } = await loadJourneys(db, env, { now });
  const digest = classify(journeys, { now });
  if (!digest.total || !send) return { digest, sent: false };
  const mail = digestEmail(digest);
  const sent = await sendEmail(env, {
    to: env.CLASSROOM_ALERT_TO || ALERT_TO_DEFAULT, subject: mail.subject, html: mail.html, text: mail.text
  });
  return { digest, sent };
}
