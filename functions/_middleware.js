// Root middleware.
// Keeps the admin CRM OFF the public production domain (promoteandlead.com) until
// Cloudflare Access / Zero Trust is set up there. The admin remains available on the
// preview domain. To expose admin on the live domain later, remove this block (and set
// up Access + the ACCESS_* secrets on the production project first).
export async function onRequest(context) {
  try {
    const url = new URL(context.request.url);
    const host = url.hostname.toLowerCase();
    const isPublicProd = host === "promoteandlead.com" || host === "www.promoteandlead.com";
    const isAdminPath =
      url.pathname === "/admin" ||
      url.pathname.startsWith("/admin/") ||
      url.pathname.startsWith("/api/admin");
    if (isPublicProd && isAdminPath) {
      return new Response("Not found", { status: 404 });
    }
  } catch (e) {
    // never let the guard break normal requests
  }
  return context.next();
}
