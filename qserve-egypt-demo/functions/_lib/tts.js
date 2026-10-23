const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

export const TTS_VOICE = {
  eg: { language: "arz", voiceId: "Vinny", edge: "ar-EG-ShakirNeural", gLang: "ar-EG", steer: "[speak casually like a Cairo salesman, warm, not a news reader] " },
  ae: { language: "afb", voiceId: "Marcus", edge: "ar-AE-HamdanNeural", gLang: "ar", steer: "[speak casually Gulf Arabic] " },
  sa: { language: "ars", voiceId: "Marcus", edge: "ar-SA-HamedNeural", gLang: "ar", steer: "[speak casually Saudi Arabic] " },
  qa: { language: "afb", voiceId: "Marcus", edge: "ar-QA-MoazNeural", gLang: "ar", steer: "[speak casually Gulf Arabic] " },
  kw: { language: "afb", voiceId: "Marcus", edge: "ar-KW-FahedNeural", gLang: "ar", steer: "[speak casually Kuwaiti Arabic] " },
  en: { language: "en", voiceId: "Dennis", edge: "en-US-GuyNeural", gLang: "en-US", steer: "[speak casually, warm factory sales desk] " },
};

export function prepSpeak(text, dialect) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/\bCART_ADD:\S+/gi, " ");
  t = t.replace(/\bSHOW_CART\b/gi, " ");
  t = t.replace(/\bNAV:\/\S+/g, " ");
  if (dialect !== "en") {
    t = t.replace(/\bQ AI\b/g, "كيو أيه آي");
    t = t.replace(/\bQServe\b/gi, "كيوسيرف");
    t = t.replace(/\bHDMI\b/g, "إتش دي إم آي");
    t = t.replace(/\bWi-?Fi\b/gi, "واي فاي");
    t = t.replace(/\bAMC\b/g, "أي إم سي");
  }
  return t.replace(/\s+/g, " ").trim().slice(0, 900);
}

function asBytes(out) {
  if (!out) return null;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (ArrayBuffer.isView(out)) return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  if (typeof out === "string" && out.startsWith("http")) return "url:" + out;
  if (typeof out === "string" && out.length > 80) {
    try {
      const bin = atob(out.replace(/^data:audio\/\w+;base64,/, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      return null;
    }
  }
  if (typeof out === "object") {
    if (out.audio) return asBytes(out.audio);
    if (out.result) return asBytes(out.result.audio || out.result);
    if (out.data) return asBytes(out.data);
  }
  return null;
}

async function runAi(env, model, payload) {
  if (!env.AI || typeof env.AI.run !== "function") return null;
  const out = await env.AI.run(model, payload);
  if (out && typeof out.arrayBuffer === "function") return new Uint8Array(await out.arrayBuffer());
  const bytes = asBytes(out);
  if (typeof bytes === "string" && bytes.startsWith("url:")) {
    const res = await fetch(bytes.slice(4));
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  return bytes;
}

async function inworldSpeak(env, text, pack) {
  return runAi(env, "inworld/tts-2", {
    text: `${pack.steer}${text}`,
    voice_id: pack.voiceId,
    language: pack.language,
    output_format: "mp3",
    speaking_rate: 0.96,
    temperature: 1.05,
    timestamp_type: "none",
  });
}

async function elevenSpeak(env, text, dialect) {
  return runAi(env, "elevenlabs/eleven-multilingual-v2", {
    text,
    voice_id: dialect === "en" ? "JBFqnCBsd6RMkjVDRZzb" : "pNInz6obpgDQGcFmaJgB",
    language_code: dialect === "en" ? "en" : "ar",
    output_format: "mp3_44100_128",
  });
}

function splitChunks(text, max) {
  const parts = [];
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

async function googleSpeak(text, lang) {
  const chunks = splitChunks(text, 160);
  const buffers = [];
  for (const q of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        referer: "https://translate.google.com/",
        accept: "audio/mpeg",
      },
    });
    if (!res.ok) throw new Error(`gtts ${res.status}`);
    buffers.push(new Uint8Array(await res.arrayBuffer()));
  }
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

async function secMsGec() {
  let ticks = (BigInt(Math.floor(Date.now() / 1000)) + 11644473600n) * 10000000n;
  ticks -= ticks % 3000000000n;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ticks}${TOKEN}`));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function ssml(text, voice) {
  const safe = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<speak version="1.0" xml:lang="${voice.slice(0, 5)}" xmlns="http://www.w3.org/2001/10/synthesis"><voice name="${voice}"><prosody rate="-4%">${safe}</prosody></voice></speak>`;
}

async function edgeSpeak(text, voice) {
  const connectionId = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  const gec = await secMsGec();
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-130.0.2849.68`;
  const res = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
    },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error("edge ws");
  ws.accept();
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("edge timeout")), 12000);
    ws.addEventListener("message", (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        if (data.includes("Path:turn.end")) {
          clearTimeout(t);
          resolve();
        }
        return;
      }
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
      const headEnd = indexOfCrLfCrLf(buf);
      if (headEnd > 0) chunks.push(buf.slice(headEnd + 4));
      else chunks.push(buf);
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("edge error"));
    });
  });
  ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);
  ws.send(`X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml(text, voice)}`);
  await done;
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  const total = chunks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of chunks) {
    out.set(b, off);
    off += b.length;
  }
  if (out.length < 200) throw new Error("edge empty");
  return out;
}

function indexOfCrLfCrLf(buf) {
  for (let i = 0; i < buf.length - 3; i += 1) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) return i;
  }
  return -1;
}

export async function synthesize(env, text, dialect) {
  const pack = TTS_VOICE[dialect] || TTS_VOICE.eg;
  const said = prepSpeak(text, dialect);
  if (!said) return null;
  const errors = [];
  try {
    const a = await inworldSpeak(env, said, pack);
    if (a && a.length > 200) return { bytes: a, mime: "audio/mpeg", via: "inworld" };
  } catch (e) {
    errors.push(`inworld:${e.message || e}`);
  }
  try {
    const a = await elevenSpeak(env, said, dialect);
    if (a && a.length > 200) return { bytes: a, mime: "audio/mpeg", via: "eleven" };
  } catch (e) {
    errors.push(`eleven:${e.message || e}`);
  }
  try {
    const a = await edgeSpeak(said, pack.edge);
    if (a && a.length > 200) return { bytes: a, mime: "audio/mpeg", via: "edge" };
  } catch (e) {
    errors.push(`edge:${e.message || e}`);
  }
  try {
    const a = await googleSpeak(said, pack.gLang);
    if (a && a.length > 200) return { bytes: a, mime: "audio/mpeg", via: "gtts" };
  } catch (e) {
    errors.push(`gtts:${e.message || e}`);
  }
  return { error: errors.join("|") || "tts failed" };
}
