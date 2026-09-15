// Once a day, asks the classroom to send Tommy his digest. All the logic lives with the rest of
// the classroom in functions/_lib/digest.js; this only supplies the clock Pages doesn't have.
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(send(env));
  },
  // No public face. The schedule is the only way in.
  async fetch() {
    return new Response("Not found", { status: 404 });
  }
};

async function send(env) {
  const res = await fetch(env.DIGEST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DIGEST_SECRET}` }
  });
  // Throwing marks the run as failed in the Cloudflare dashboard, so a broken digest is visible.
  if (!res.ok) throw new Error(`digest ${res.status}: ${await res.text()}`);
}
