// Verifies a Cloudflare Access JWT (RS256) against the team's JWKS.
// This is the trust boundary for /api/admin/* — header presence alone is NOT
// trusted (the *.pages.dev origin could be hit directly), so we verify the signature.

let jwksCache = { keys: null, at: 0 };

// Returns { email } on success, or null if unauthenticated/invalid.
export async function verifyAccess(request, env) {
  if (env.ADMIN_DEV_BYPASS === "true") return { email: "dev@local" }; // local dev only

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  const teamDomain = (env.ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
  const aud = env.ACCESS_AUD;
  if (!token || !teamDomain || !aud) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header, payload;
  try {
    header = JSON.parse(b64urlText(h));
    payload = JSON.parse(b64urlText(p));
  } catch { return null; }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (payload.iss && payload.iss !== teamDomain) return null;

  const key = await getKey(teamDomain, header.kid);
  if (!key) return null;

  const ok = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    b64urlBytes(s),
    new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) return null;

  return { email: payload.email || payload.sub || null };
}

async function getKey(teamDomain, kid) {
  if (!jwksCache.keys || Date.now() - jwksCache.at > 3600_000) {
    const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    const jwks = await res.json();
    jwksCache = { keys: jwks.keys || [], at: Date.now() };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) return null;
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

function b64urlBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlText(str) {
  return new TextDecoder().decode(b64urlBytes(str));
}
