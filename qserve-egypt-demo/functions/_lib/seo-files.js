const LASTMOD = "2026-09-18";

const NAV_PATHS = [
  "/",
  "/en/",
  "/about/",
  "/en/about/",
  "/contact/",
  "/en/contact/",
  "/quote/",
  "/en/quote/",
  "/projects/",
  "/en/projects/",
  "/privacy/",
  "/en/privacy/",
  "/terms/",
  "/en/terms/",
  "/queuing-system/",
  "/en/queuing-system/",
  "/nurse-call-system/",
  "/en/nurse-call-system/",
  "/self-service-kiosks/",
  "/en/self-service-kiosks/",
  "/smart-boards/",
  "/en/smart-boards/",
  "/central-clocks/",
  "/en/central-clocks/",
  "/digital-signage/",
  "/en/digital-signage/",
  "/service-evaluation/",
  "/en/service-evaluation/",
  "/interactive-maps/",
  "/en/interactive-maps/",
];

function locXml(path) {
  return `  <url>
    <loc>https://www.qserveai.com${path}</loc>
    <lastmod>${LASTMOD}</lastmod>
  </url>`;
}

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${NAV_PATHS.map(locXml).join("\n")}
</urlset>
`;

export const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /en/admin
Disallow: /en/admin/

Sitemap: https://www.qserveai.com/sitemap.xml
`;
