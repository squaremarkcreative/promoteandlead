// Alerts to Tommy the moment a student's next step is his.
//
// A student who has done their part and then watches nothing move is the one who gives up, and
// every one of these handoffs is invisible from the admin tab unless you happen to look. So each
// fires on the transition — the click that hands work over — and once, not on every re-save.
//
// Each alert says what happened, then exactly which admin button to press when the thing you're
// waiting on arrives. Button labels are quoted from ADMIN_HANDOFFS in console.js.

import { sendEmail, internalEmail, escapeHtml } from "./email.js";
import { FUNDING } from "./classroom.js";
import { eligibleCourseDates } from "./curriculum.js";

export const ALERT_TO_DEFAULT = "tommy@squaremarkweb.com";
const ADMIN_URL = "https://promoteandlead.com/classroom/#/admin";

// Filterable: every subject starts the same way.
const PREFIX = "Action needed:";

// Student-typed, and it goes into a subject line — collapse any line breaks or runs of spaces.
function nameOf(s) {
  return (s.display_name || "").replace(/\s+/g, " ").trim() || s.email;
}

function day(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US",
    { weekday: "short", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const ALERTS = {
  rblp_apply: (s) => ({
    subject: `${PREFIX} ${nameOf(s)} applied at RBLP`,
    happened: "says they've submitted their free RBLP application and named Promote and Lead Solutions as their instructor.",
    todo: "Watch for RBLP confirming the application is in, then press <b>RBLP has their application</b> on their row."
  }),

  ca_submitted: (s) => {
    const branch = (FUNDING[s.payment_source] || {}).branch;
    // The 45-day rule is the Army's. Don't state a date for anyone it doesn't cover.
    const window = branch === "Army" && s.ca_submitted_on
      ? ` Under the Army's 45-day rule, the earliest course start is <b>${day(eligibleCourseDates(s.ca_submitted_on).earliest)}</b>.`
      : "";
    return {
      subject: `${PREFIX} ${nameOf(s)} filed their CA request`,
      happened: `filed their Credentialing Assistance request for the training` +
        (s.ca_submitted_on ? ` on <b>${day(s.ca_submitted_on)}</b>` : "") + (branch ? ` (${branch})` : "") + ".",
      todo: "When RBLP tells you the funding is approved, press <b>RBLP confirmed funding</b> — that unlocks their " +
        "prep work and emails them. Then place them in a cohort." + window
    };
  },

  purchase_claimed: (s) => ({
    subject: `${PREFIX} ${nameOf(s)} says they already paid`,
    happened: "says they already bought their exam prep through RBLP's storefront.",
    todo: "Check it with RBLP, then press <b>RBLP confirmed payment</b> on their row. That unlocks their prep work " +
      "and emails them. Then place them in the next cohort."
  }),

  exam: (s) => ({
    subject: `${PREFIX} ${nameOf(s)} scheduled their RBLP exam`,
    happened: "has scheduled their RBLP oral exam.",
    todo: "When RBLP awards the credential, press <b>Passed the exam</b> on their row." +
      (s.track === "RBLP-T" ? " They're a Trainer, so that also sends them the invitation to instruct for us." : "")
  })
};

export function alertEmail(kind, student) {
  const a = ALERTS[kind](student);
  const s = student;
  const facts = [
    s.email,
    s.track,
    (FUNDING[s.payment_source] || {}).label
  ].filter(Boolean).map(escapeHtml).join(" &middot; ");

  const html =
    `<p style="margin:0 0 14px"><strong>${escapeHtml(nameOf(s))}</strong> ${a.happened}</p>` +
    `<p style="margin:0 0 14px;padding:12px 14px;background:#fbf6e3;border-left:4px solid #C8A415;border-radius:6px">` +
      `<strong>Your move:</strong> ${a.todo}</p>` +
    `<p style="margin:0 0 18px;color:#555;font-size:13px">${facts}</p>` +
    `<p style="margin:0"><a href="${ADMIN_URL}" style="display:inline-block;background:#0B2E6D;color:#fff;` +
      `text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">Open the admin tab</a></p>`;

  const text = `${nameOf(s)} ${a.happened.replace(/<[^>]+>/g, "")}\n\n` +
    `Your move: ${a.todo.replace(/<[^>]+>/g, "")}\n\n${s.email}\n${ADMIN_URL}`;

  return { subject: a.subject, html: internalEmail(html), text };
}

// Never lets a mail failure break the student's action — they did their part either way.
export async function alertAdmin(env, kind, student) {
  if (!ALERTS[kind]) return false;
  try {
    const mail = alertEmail(kind, student);
    return await sendEmail(env, {
      to: env.CLASSROOM_ALERT_TO || ALERT_TO_DEFAULT,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
  } catch (e) {
    return false;
  }
}
