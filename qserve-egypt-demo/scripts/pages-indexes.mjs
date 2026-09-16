import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "out");

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
