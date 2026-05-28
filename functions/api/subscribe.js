// Cloudflare Pages Function — handles POST /api/subscribe
// Stores signups in a KV namespace bound as `WAITLIST`.
// See README for how to create + bind the namespace in the Cloudflare dashboard.

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email } = await request.json();

    // Basic server-side validation
    const valid = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      return json({ error: "Invalid email address." }, 400);
    }

    const clean = email.trim().toLowerCase();

    // If a KV namespace is bound, persist the signup.
    if (env.WAITLIST) {
      const existing = await env.WAITLIST.get(clean);
      if (!existing) {
        await env.WAITLIST.put(
          clean,
          JSON.stringify({
            email: clean,
            joined: new Date().toISOString(),
            ua: request.headers.get("user-agent") || ""
          })
        );
      }
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: "Server error. Please try again." }, 500);
  }
}

// Reject non-POST methods cleanly
export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
  return onRequestPost(context);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
