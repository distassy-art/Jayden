import { DIALECT_UI, type Dialect } from "./dialect";

type RecCtor = new () => Rec;
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

let currentAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

function recognitionCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceSupported() {
  if (typeof window === "undefined") return { tts: false, stt: false };
  return { tts: true, stt: Boolean(recognitionCtor()) };
}

function stopBrowserSpeak() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

export function unlockSpeech() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.resume();
  } catch {
    /* ignore */
  }
  try {
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      audioCtx = audioCtx || new AC();
      void audioCtx.resume();
    }
  } catch {
    /* ignore */
  }
  try {
    const kick = new Audio("data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoeg6XAAAAAAD/+1DEAAAH8YF7YRAAAK5uGteEAAAAnQCR//uQxAAA");
    kick.volume = 0.01;
    void kick.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

async function playNeural(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, dialect, currency: dialect === "eg" ? "EGP" : dialect === "en" ? "USD" : dialect === "ae" ? "AED" : dialect === "sa" ? "SAR" : dialect === "qa" ? "QAR" : "KWD" }),
  });
  if (!res.ok) throw new Error("tts http");
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 200) throw new Error("tts empty");
  const url = URL.createObjectURL(new Blob([buf], { type: res.headers.get("content-type") || "audio/mpeg" }));
  return await new Promise<() => void>((resolve, reject) => {
    const audio = new Audio(url);
    currentAudio = audio;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      onEnd?.();
    };
    audio.onplay = () => onStart?.();
    audio.onended = done;
    audio.onerror = () => {
      done();
      reject(new Error("play"));
    };
    void audio.play().then(
      () => {
        resolve(() => {
          audio.pause();
          done();
        });
      },
      (err) => {
        done();
        reject(err);
      },
    );
  });
}

function pickVoice(dialect: Dialect) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const prefs = (DIALECT_UI[dialect] || DIALECT_UI.eg).voiceLangs.map((l) => l.toLowerCase());
  for (const want of prefs) {
    const hit = voices.find((v) => v.lang.toLowerCase() === want || v.lang.toLowerCase().startsWith(want));
    if (hit) return hit;
  }
  if (dialect === "en") return voices.find((v) => /english/i.test(v.name)) || null;
  return (
    voices.find((v) => /egypt|cairo|shakir|salma/i.test(`${v.name} ${v.lang}`)) ||
    voices.find((v) => /arab/i.test(v.name) || v.lang.toLowerCase().startsWith("ar")) ||
    null
  );
}

function speakBrowser(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  if (!window.speechSynthesis) {
    onEnd?.();
    return () => {};
  }
  const ui = DIALECT_UI[dialect] || DIALECT_UI.eg;
  const u = new SpeechSynthesisUtterance(text.slice(0, 900));
  u.lang = ui.bcp47;
  u.rate = dialect === "eg" ? 0.92 : dialect === "en" ? 1 : 0.95;
  u.pitch = dialect === "eg" ? 0.95 : 1;
  const voice = pickVoice(dialect);
  if (voice) u.voice = voice;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };
  u.onstart = () => onStart?.();
  u.onend = done;
  u.onerror = done;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  const watchdog = window.setTimeout(() => {
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) done();
  }, 1500);
  return () => {
    window.clearTimeout(watchdog);
    window.speechSynthesis.cancel();
    done();
  };
}

export function speakText(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined") {
    onEnd?.();
    return () => {};
  }
  const said = String(text || "").replace(/\s+/g, " ").trim();
  if (!said) {
    onEnd?.();
    return () => {};
  }
  stopAudio();
  stopBrowserSpeak();
  let cancelled = false;
  let stopInner: () => void = () => {};
  void playNeural(said, dialect, onStart, () => {
    if (!cancelled) onEnd?.();
  })
    .then((stop) => {
      if (cancelled) {
        stop();
        return;
      }
      stopInner = stop;
    })
    .catch(() => {
      if (cancelled) {
        onEnd?.();
        return;
      }
      stopInner = speakBrowser(said, dialect, onStart, onEnd);
    });
  return () => {
    cancelled = true;
    stopInner();
    stopAudio();
    stopBrowserSpeak();
    onEnd?.();
  };
}

export function speakWelcome(text: string, dialect: Dialect) {
  return speakText(text, dialect);
}

export function startListen(
  dialect: Dialect,
  handlers: {
    onFinal: (text: string) => void;
    onPartial?: (text: string) => void;
    onError?: (code: string) => void;
    onEnd?: () => void;
  },
) {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError?.("no-stt");
    handlers.onEnd?.();
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = (DIALECT_UI[dialect] || DIALECT_UI.eg).bcp47;
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (ev) => {
    let interim = "";
    let finalText = "";
    for (let i = 0; i < ev.results.length; i += 1) {
      const row = ev.results[i];
      const piece = row[0]?.transcript || "";
      if (row.isFinal) finalText += piece;
      else interim += piece;
    }
    if (interim) handlers.onPartial?.(interim);
    if (finalText.trim()) handlers.onFinal(finalText.trim());
  };
  rec.onerror = (ev) => handlers.onError?.(String(ev.error || "error"));
  rec.onend = () => handlers.onEnd?.();
  try {
    rec.start();
  } catch {
    handlers.onError?.("start-failed");
    handlers.onEnd?.();
  }
  return () => {
    try {
      rec.stop();
    } catch {
      rec.abort();
    }
  };
}
