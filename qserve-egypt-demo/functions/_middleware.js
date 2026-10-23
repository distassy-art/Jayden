import { ROBOTS_TXT, SITEMAP_XML } from "./_lib/seo-files.js";

function seoResponse(body, contentType) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300, no-transform",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, "") || "/";
  if (path === "/sitemap.xml") return seoResponse(SITEMAP_XML, "application/xml; charset=utf-8");
  if (path === "/robots.txt") return seoResponse(ROBOTS_TXT, "text/plain; charset=utf-8");
  return context.next();
}
