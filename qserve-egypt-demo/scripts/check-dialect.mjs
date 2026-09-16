import { dialectOf, dialectVoiceBlock, dialectFallback, DIALECT_BY_CURRENCY } from "../functions/_lib/dialect.js";
import { prepSpeak } from "../functions/_lib/tts.js";
import { systemPrompt, parseActions, inferCartOps } from "../functions/_lib/prompt.js";
import fs from "node:fs";

const expect = {
  EGP: "eg",
  AED: "ae",
  SAR: "sa",
  QAR: "qa",
  KWD: "kw",
  USD: "en",
};

let failed = 0;
function ok(name, cond, extra = "") {
  if (!cond) {
    failed += 1;
    console.error("FAIL", name, extra);
  } else {
    console.log("ok", name);
  }
}

for (const [code, dialect] of Object.entries(expect)) {
  ok(`map ${code}`, dialectOf(code) === dialect && DIALECT_BY_CURRENCY[code] === dialect);
  const block = dialectVoiceBlock(dialect);
  ok(`voice block ${code}`, typeof block === "string" && block.length > 40);
  const prompt = systemPrompt("en", "/", [], "", { currency: code });
  ok(`prompt has dialect ${code}`, prompt.includes(block.slice(0, 24)));
  if (code === "USD") {
    ok("USD mouth is English", /spoken English/i.test(prompt) && !prompt.includes("عامية مصرية"));
    ok("USD ignores /en lock", prompt.includes("currency USD") || prompt.includes("USD"));
  }
  if (code === "EGP") {
    ok("EGP mouth is Egyptian even on /en", /عامية قاهرية|إزيك/.test(prompt) && prompt.includes("حتى لو فتح /en"));
  }
}

ok("EGP fallback spoken", dialectFallback("eg", null).includes("الخط مش ماسك") || dialectFallback("eg", null).includes("ابعت تاني"));
ok("USD fallback spoken", /Couldn't reach|factory model/i.test(dialectFallback("en", null)));
ok("AED fallback gulf", dialectFallback("ae", null).includes("ما قدرت"));

const parsed = parseActions("هلا\nCART_ADD:LCD-215:2\nSHOW_CART\nNAV:/products", "en");
ok("NAV follows site locale en", parsed.navigate === "/en/products");
ok("no freight SKU in cart", parseActions("x\nCART_ADD:INST-EG:1", "ar").cartOps.length === 0);
const screenOps = inferCartOps("three indoor 21.5 screens");
ok("21.5 is not qty 21", !screenOps.some((o) => o.qty === 21));
ok("three 21.5 -> LCD-215 x3", screenOps.some((o) => o.sku === "LCD-215" && o.qty === 3));
ok("prepSpeak egyptian brand", prepSpeak("Q AI HDMI", "eg").includes("كيو"));
ok("eg copy stay-on", dialectVoiceBlock("eg").includes("إزيك"));
ok("eg cairo salesman", /بائع شارع|عامية مصرية/.test(dialectVoiceBlock("eg")));
ok("eg forbids MSA news", dialectVoiceBlock("eg").includes("فصحى") && dialectVoiceBlock("eg").includes("معلش"));

const chatSrc = fs.readFileSync(new URL("../components/SalesmanChat.tsx", import.meta.url), "utf8");
const voiceSrc = fs.readFileSync(new URL("../lib/voice.ts", import.meta.url), "utf8");
const aiSrc = fs.readFileSync(new URL("../netlify/functions/ai.ts", import.meta.url), "utf8");
ok("client posts /api/ai", chatSrc.includes('fetch("/api/ai"'));
ok("client does not post /api/chat", !chatSrc.includes('fetch("/api/chat"'));
ok("voice unlocks audio then falls back to /api/tts", voiceSrc.includes("unlockSpeech") && voiceSrc.includes("/api/tts") && voiceSrc.includes("ar-EG") && voiceSrc.includes("voiceschanged"));
ok("gemini 2.5 flash", aiSrc.includes("gemini-2.5-flash") && aiSrc.includes("GoogleGenAI"));
ok("no grok pin", !aiSrc.toLowerCase().includes("grok"));
ok("empty GoogleGenAI constructor", aiSrc.includes("new GoogleGenAI({})"));
ok("does not set provider keys", !/GEMINI_API_KEY\s*=/.test(aiSrc) && !/OPENAI_API_KEY\s*=/.test(aiSrc) && !aiSrc.includes("apiKey:"));

const mascotSrc = fs.readFileSync(new URL("../components/QaiMascot.tsx", import.meta.url), "utf8");
ok("mascot is a figure not the logo jpg", !mascotSrc.includes("official-logo.jpg") && mascotSrc.includes("qai-figure"));
ok("mascot has walk limbs and mouse", mascotSrc.includes("qai-leg") && mascotSrc.includes("qai-os-mouse") && mascotSrc.includes("qai-mouth"));

if (failed) {
  console.error(failed, "checks failed");
  process.exit(1);
}
console.log("all dialect checks passed");
