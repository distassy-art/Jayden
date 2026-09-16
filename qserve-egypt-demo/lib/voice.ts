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

function recognitionCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceSupported() {
  if (typeof window === "undefined") return { tts: false, stt: false };
  return { tts: Boolean(window.speechSynthesis), stt: Boolean(recognitionCtor()) };
}

function langPrefs(dialect: Dialect) {
  return (DIALECT_UI[dialect] || DIALECT_UI.eg).voiceLangs.map((l) => l.toLowerCase());
}

function pickVoice(dialect: Dialect) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const prefs = langPrefs(dialect);
  for (const want of prefs) {
    const hit = voices.find((v) => v.lang.toLowerCase() === want || v.lang.toLowerCase().startsWith(want));
    if (hit) return hit;
  }
  if (dialect === "en") {
    return voices.find((v) => /english/i.test(v.name)) || null;
  }
  return voices.find((v) => /arab/i.test(v.name) || v.lang.toLowerCase().startsWith("ar")) || null;
}

function makeUtterance(text: string, dialect: Dialect) {
  const ui = DIALECT_UI[dialect] || DIALECT_UI.eg;
  const u = new SpeechSynthesisUtterance(text.slice(0, 1200));
  u.lang = ui.bcp47;
  u.rate = dialect === "en" ? 1 : 1.02;
  u.pitch = 1;
  u.volume = 1;
  const voice = pickVoice(dialect);
  if (voice) u.voice = voice;
  return u;
}

export function unlockSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.resume();
    const warm = new SpeechSynthesisUtterance(".");
    warm.volume = 0;
    warm.rate = 2;
    window.speechSynthesis.speak(warm);
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export function speakText(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return () => {};
  }
  const said = String(text || "").replace(/\s+/g, " ").trim();
  if (!said) {
    onEnd?.();
    return () => {};
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume();
  const u = makeUtterance(said, dialect);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };
  u.onstart = () => onStart?.();
  u.onend = done;
  u.onerror = done;
  const kick = () => {
    const voice = pickVoice(dialect);
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.resume();
  };
  kick();
  window.speechSynthesis.addEventListener("voiceschanged", kick, { once: true });
  const watchdog = window.setTimeout(() => {
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) done();
  }, 1200);
  return () => {
    window.clearTimeout(watchdog);
    window.speechSynthesis.cancel();
    done();
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
