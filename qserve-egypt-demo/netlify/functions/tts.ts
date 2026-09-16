import type { Config } from "@netlify/functions";
import { corsHeaders, json, optionsOk } from "./_shared/http";

const LANG: Record<string, string> = {
  eg: "ar-EG",
  ae: "ar",
  sa: "ar",
  qa: "ar",
  kw: "ar",
  en: "en-US",
};

function splitChunks(text: string, max: number) {
  const parts: string[] = [];
  let buf = "";
  for (const piece of String(text).split(/(?<=[.!?؟،,])\s+/)) {
    if ((buf + " " + piece).trim().length > max && buf) {
      parts.push(buf.trim());
      buf = piece;
    } else buf = (buf + " " + piece).trim();
  }
  if (buf) parts.push(buf);
  return parts.length ? parts : [text];
}

async function googleSpeak(text: string, lang: string) {
  const chunks = splitChunks(text, 160);
  const buffers: Uint8Array[] = [];
  const endpoints = (q: string) => [
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`,
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`,
  ];
  for (const q of chunks) {
    let got: Uint8Array | null = null;
    let last = "gtts";
    for (const url of endpoints(q)) {
      try {
        const res = await fetch(url, {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            referer: "https://translate.google.com/",
            accept: "audio/mpeg",
          },
        });
        if (!res.ok) {
          last = `gtts ${res.status}`;
          continue;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > 200) {
          got = bytes;
          break;
        }
      } catch (e) {
        last = String(e);
      }
    }
    if (!got) throw new Error(last);
    buffers.push(got);
  }
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    out.set(b, off);
    off += b.length;
  }
  if (out.length < 200) throw new Error("gtts empty");
  return out;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return optionsOk();
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = (await req.json().catch(() => ({}))) as { text?: string; dialect?: string; currency?: string };
  const dialect = String(body.dialect || "").toLowerCase();
  const lang = LANG[dialect] || (String(body.currency || "").toUpperCase() === "USD" ? "en-US" : "ar-EG");
  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (!text) return json({ error: "empty" }, 400);
  try {
    const bytes = await googleSpeak(text, lang);
    return new Response(bytes, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-qserve-tts": `gtts:${lang}`,
        ...corsHeaders(),
      },
    });
  } catch (e) {
    return json({ error: String(e && typeof e === "object" && "message" in e ? (e as Error).message : e) }, 503);
  }
};

export const config: Config = {
  path: "/api/tts",
  method: ["POST", "OPTIONS"],
};
