import { readFileSync } from "node:fs";
import { systemPrompt, parseActions } from "../functions/_lib/prompt.js";
import { searchKb } from "../functions/_lib/kb.js";

let failed = 0;
function ok(name, cond, extra = "") {
  if (!cond) {
    failed += 1;
    console.error("FAIL", name, extra);
  } else {
    console.log("ok", name);
  }
}

const src = readFileSync(new URL("../netlify/functions/ai.ts", import.meta.url), "utf8");
ok("path /api/ai", src.includes('path: "/api/ai"'));
ok("default export", /export default async/.test(src));
ok("model gemini-2.5-flash-lite", src.includes("gemini-2.5-flash-lite"));
ok("faster gemini-2.0-flash-lite first", src.includes("gemini-2.0-flash-lite") && src.indexOf("gemini-2.0-flash-lite") < src.indexOf("gemini-2.5-flash-lite"));
ok("streams generateContentStream", src.includes("generateContentStream") && src.includes("text/event-stream"));
ok("GoogleGenAI empty", src.includes("new GoogleGenAI({})"));
ok("no grok", !/grok/i.test(src));
ok("no user apiKey", !/apiKey\s*:/.test(src));

const hits = searchKb("LCD-215");
ok("kb finds LCD", hits.some((h) => h.sku === "LCD-215"));
const prompt = systemPrompt("ar", "/", hits, "", { currency: "EGP" });
ok("prompt cairo fillers", /إزيك/.test(prompt) && /حاضر/.test(prompt) && /معلش/.test(prompt));
ok("prompt spoken cap", /جملتين/.test(prompt));
ok("prompt not news MSA instruction dump only", /عامية قاهرية|عامية مصرية/.test(prompt));

const parsed = parseActions("حاضر. هحط التلاتة في السلة.\nCART_ADD:LCD-215:3\nSHOW_CART", "ar");
ok("spoken reply kept", parsed.reply.includes("حاضر"));
ok("cart add parsed", parsed.cartOps.some((o) => o.sku === "LCD-215" && o.qty === 3));
ok("show cart", parsed.showCart);
const capped = parseActions("إزيك يا باشا. تمام. شاشة 21.5. دي لمس. عايز واحدة ولا اتنين؟", "ar");
ok("spoken cap 2 sentences", (capped.reply.match(/[.!?؟]/g) || []).length <= 2 && /عايز واحدة/.test(capped.reply));

if (failed) {
  console.error(failed, "checks failed");
  process.exit(1);
}
console.log("all ai-function checks passed");
