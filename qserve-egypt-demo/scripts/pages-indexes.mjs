import { copyFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SITEMAP_XML } from "../functions/_lib/seo-files.js";

const root = join(process.cwd(), "out");
const pub = join(process.cwd(), "public");
for (const name of ["robots.txt", "sitemap.xml", "_headers", "_redirects", "_routes.json"]) {
  const from = join(pub, name);
  if (existsSync(from)) copyFileSync(from, join(root, name));
}
writeFileSync(join(pub, "sitemap.xml"), SITEMAP_XML);
writeFileSync(join(root, "sitemap.xml"), SITEMAP_XML);
writeFileSync(
  join(root, "_routes.json"),
  `${JSON.stringify({ version: 1, include: ["/api/*", "/sitemap.xml", "/sitemap.xml/", "/robots.txt", "/robots.txt/"], exclude: ["/_next/*"] }, null, 2)}\n`,
);

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    const html = `${full}.html`;
    const index = join(full, "index.html");
    if (existsSync(html) && !existsSync(index)) copyFileSync(html, index);
    walk(full);
  }
}

walk(root);
console.log("pages-indexes: nested index.html files ready");
