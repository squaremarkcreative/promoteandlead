// Branded, email-client-safe HTML wrappers, shared by the admin campaign sender and the
// classroom login codes. Table layout + inline styles on purpose — Outlook.

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Marketing/campaign wrapper.
// receiptCount != null => owner confirmation copy (banner, no unsubscribe).
export function brandedEmail(messageHtml, unsubUrl, receiptCount) {
  const isReceipt = receiptCount !== null && receiptCount !== undefined;
  const banner = isReceipt
    ? `<div style="background:#1F5E2A;color:#fff4e8;padding:10px 14px;border-radius:8px;font-size:13px;margin:0 0 18px;font-family:Arial,Helvetica,sans-serif">This is your copy — sent to ${receiptCount} recipient(s).</div>`
    : "";
  const footer = isReceipt
    ? ""
    : `You're receiving this because you joined the Promote &amp; Lead Solutions list. <a href="${unsubUrl}" style="color:#999">Unsubscribe</a>.`;
  return shell(banner + messageHtml, footer);
}

// Transactional wrapper — login codes, enrollment notices. No unsubscribe link: these are
// replies to something the person just did, not list mail.
export function transactionalEmail(messageHtml) {
  return shell(messageHtml, "You received this because someone asked for a sign-in code for this address at promoteandlead.com. If that wasn't you, you can ignore it.");
}

function shell(bodyHtml, footerHtml) {
  return (
    `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">` +
    `<tr><td style="height:5px;background:#C8A415"></td></tr>` +
    `<tr><td align="center" style="padding:26px 24px 4px">` +
    `<img src="https://promoteandlead.com/assets/logo-icon.png" width="54" alt="Promote &amp; Lead Solutions" style="display:block;margin:0 auto 10px">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#0B2E6D;letter-spacing:.5px">PROMOTE &amp; LEAD SOLUTIONS</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8B2C2C;letter-spacing:1px;margin-top:3px">RBLP AUTHORIZED TRAINING PARTNER</div>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#222">${bodyHtml}</td></tr>` +
    `<tr><td style="padding:16px 32px 26px">` +
    `<hr style="border:none;border-top:1px solid #eee;margin:0 0 14px">` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#999;line-height:1.6">` +
    `Promote &amp; Lead Solutions &middot; <a href="https://promoteandlead.com" style="color:#1F5E2A">promoteandlead.com</a> &middot; <a href="mailto:info@promoteandlead.com" style="color:#1F5E2A">info@promoteandlead.com</a><br>${footerHtml}` +
    `</div></td></tr></table></td></tr></table></body></html>`
  );
}

// Single Resend send. Returns true on success; callers decide whether that's fatal.
export async function sendEmail(env, { to, subject, html, text, replyTo }) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.NOTIFY_FROM || "Promote & Lead Solutions <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text, reply_to: replyTo || env.NOTIFY_TO || "info@promoteandlead.com" })
  });
  return res.ok;
}
