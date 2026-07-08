// GET /api/unsubscribe?e=<email> — public one-click unsubscribe.
import { sb } from "../_lib/db.js";

export async function onRequest(context) {
  const { request, env } = context;
  const email = (new URL(request.url).searchParams.get("e") || "").toLowerCase().trim();
  const db = sb(env);
  let ok = false;

  if (db.enabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      await db.patch("pl_subscribers", `email=eq.${encodeURIComponent(email)}`, {
        unsubscribed: true,
        status: "unsubscribed"
      });
      ok = true;
    } catch (e) { /* fall through to error page */ }
  }

  const msg = ok
    ? "You've been unsubscribed. You won't receive further emails from us."
    : "We couldn't process that request. Please email info@promoteandlead.com to be removed.";

  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title>` +
    `<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0a1428;color:#fff4e8;` +
    `display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:2rem}` +
    `.c{max-width:34rem}a{color:#e8c769}</style></head><body><div class="c">` +
    `<h1>Promote &amp; Lead Solutions</h1><p>${msg}</p><p><a href="/">Return to site</a></p>` +
    `</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
