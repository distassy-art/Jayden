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

let audioCtx: AudioContext | null = null;
let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
let unlockedAudio: HTMLAudioElement | null = null;
let currentAudio: HTMLAudioElement | null = null;

const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoeg6XAAAAAAD/+1DEAAAH8YF7YRAAAK5uGteEAAAAnQCR//uQxAAA";

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

function warmVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([] as SpeechSynthesisVoice[]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const finish = () => resolve(window.speechSynthesis.getVoices() || []);
    const have = window.speechSynthesis.getVoices();
    if (have.length) {
      finish();
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const now = window.speechSynthesis.getVoices();
        if (now.length || Date.now() - started > 500) {
        window.clearInterval(timer);
        finish();
      }
    }, 80);
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        window.clearInterval(timer);
        finish();
      },
      { once: true },
    );
    void window.speechSynthesis.getVoices();
  });
  return voicesReady;
}

export function unlockSpeech() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.resume();
  } catch {
    /* ignore */
  }
  void warmVoices();
  try {
    if (!unlockedAudio) {
      unlockedAudio = new Audio(SILENT_MP3);
      unlockedAudio.volume = 0.01;
    }
    unlockedAudio.currentTime = 0;
    void unlockedAudio.play().then(
      () => {
        try {
          unlockedAudio?.pause();
          if (unlockedAudio) unlockedAudio.currentTime = 0;
        } catch {
          /* ignore */
        }
      },
      () => {},
    );
  } catch {
    /* ignore */
  }
  try {
    const AC = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      audioCtx = audioCtx || new AC();
      void audioCtx.resume();
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    }
  } catch {
    /* ignore */
  }
  try {
    if (window.speechSynthesis) {
      const kick = new SpeechSynthesisUtterance(" ");
      kick.volume = 0;
      kick.rate = 1;
      kick.lang = "ar-EG";
      window.speechSynthesis.speak(kick);
    }
  } catch {
    /* ignore */
  }
}

export function prepSpeak(text: string, dialect: Dialect) {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/\bCART_ADD:\S+/gi, " ");
  t = t.replace(/\bSHOW_CART\b/gi, " ");
  t = t.replace(/\bNAV:\/\S+/g, " ");
  t = t.replace(/\bSHIP:\S+/gi, " ");
  t = t.replace(/\bPARTNER:\S+/gi, " ");
  if (dialect !== "en") {
    t = t.replace(/\bQ AI\b/g, "كيو أيه آي");
    t = t.replace(/\bQServe\b/gi, "كيوسيرف");
    t = t.replace(/\bHDMI\b/g, "إتش دي إم آي");
    t = t.replace(/\bWi-?Fi\b/gi, "واي فاي");
    t = t.replace(/\bAMC\b/g, "أي إم سي");
  }
  const clauses = t
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?؟])\s+/)
    .filter(Boolean);
  return clauses.slice(0, 2).join(" ").slice(0, 280);
}

function scoreVoice(voice: SpeechSynthesisVoice, dialect: Dialect) {
  const lang = (voice.lang || "").toLowerCase();
  const name = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;
  if (dialect === "eg") {
    if (lang === "ar-eg") score += 80;
    if (/egypt|cairo|hoda|salma/.test(name)) score += 50;
    if (lang.startsWith("ar-eg")) score += 20;
  }
  if (dialect === "ae" && (lang === "ar-ae" || /emirati|uae|hamdan/.test(name))) score += 70;
  if (dialect === "sa" && (lang === "ar-sa" || /saudi|hamed|zariyah/.test(name))) score += 70;
  if (dialect === "qa" && lang === "ar-qa") score += 70;
  if (dialect === "kw" && lang === "ar-kw") score += 70;
  if (dialect === "en") {
    if (lang === "en-us") score += 60;
    if (/english|us english|google us/.test(name)) score += 30;
  } else if (lang.startsWith("ar")) score += 10;
  if (/google|microsoft|natural|neural|online/.test(name)) score += 8;
  return score;
}

function pickVoice(dialect: Dialect) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const prefs = (DIALECT_UI[dialect] || DIALECT_UI.eg).voiceLangs.map((l) => l.toLowerCase());
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const voice of voices) {
    const lang = voice.lang.toLowerCase();
    let score = scoreVoice(voice, dialect);
    for (let i = 0; i < prefs.length; i += 1) {
      const want = prefs[i];
      if (lang === want) score += 40 - i * 4;
      else if (lang.startsWith(want)) score += 20 - i * 2;
    }
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  if (best && bestScore > 0) return best;
  if (dialect === "en") return voices.find((v) => /english/i.test(v.name)) || null;
  return voices.find((v) => /arab/i.test(v.name) || v.lang.toLowerCase().startsWith("ar")) || null;
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

function hasEgyptianVoice(voices: SpeechSynthesisVoice[]) {
  return voices.some((v) => {
    const hay = `${v.lang} ${v.name}`.toLowerCase();
    return hay.includes("ar-eg") || hay.includes("egypt") || hay.includes("hoda") || hay.includes("salma");
  });
}

function hasArabicVoice(voices: SpeechSynthesisVoice[]) {
  return voices.some((v) => v.lang.toLowerCase().startsWith("ar") || /arab/i.test(v.name));
}

function speakBrowser(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void): { stop: () => void; started: Promise<boolean> } {
  if (!window.speechSynthesis) {
    return { stop() {}, started: Promise.resolve(false) };
  }
  const ui = DIALECT_UI[dialect] || DIALECT_UI.eg;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = dialect === "eg" ? "ar-EG" : ui.bcp47;
  u.rate = dialect === "eg" ? 1.02 : dialect === "en" ? 1 : 1.0;
  u.pitch = 1;
  const voice = pickVoice(dialect);
  if (voice) {
    u.voice = voice;
    if (voice.lang) u.lang = voice.lang;
  }
  let finished = false;
  let started = false;
  let abandoned = false;
  let startResolve: (ok: boolean) => void = () => {};
  const startedP = new Promise<boolean>((resolve) => {
    startResolve = resolve;
  });
  const done = () => {
    if (finished) return;
    finished = true;
    startResolve(started);
    onEnd?.();
  };
  u.onstart = () => {
    if (abandoned) return;
    started = true;
    startResolve(true);
    onStart?.();
  };
  u.onend = () => {
    if (abandoned && !started) return;
    done();
  };
  u.onerror = () => {
    if (abandoned && !started) {
      startResolve(false);
      return;
    }
    if (!started) startResolve(false);
    else done();
  };
  try {
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(u);
  } catch {
    startResolve(false);
  }
  window.setTimeout(() => {
    if (!started) startResolve(false);
  }, 900);
  return {
    started: startedP,
    stop() {
      abandoned = true;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      if (started) done();
      else startResolve(false);
    },
  };
}

async function playServerTts(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, dialect }),
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

export function speakText(text: string, dialect: Dialect, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === "undefined") {
    onEnd?.();
    return () => {};
  }
  const said = prepSpeak(text, dialect);
  if (!said) {
    onEnd?.();
    return () => {};
  }
  stopAudio();
  stopBrowserSpeak();
  let cancelled = false;
  let stopInner: () => void = () => {};
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };
  void (async () => {
    const voices = await warmVoices();
    if (cancelled) {
      finish();
      return;
    }
    const preferBrowser =
      dialect === "en"
        ? voices.some((v) => v.lang.toLowerCase().startsWith("en"))
        : dialect === "eg"
          ? hasEgyptianVoice(voices)
          : hasArabicVoice(voices) || hasEgyptianVoice(voices);
    if (preferBrowser && window.speechSynthesis) {
      const browser = speakBrowser(
        said,
        dialect,
        () => {
          if (!cancelled) onStart?.();
        },
        () => {
          if (!cancelled) finish();
        },
      );
      stopInner = browser.stop;
      const started = await browser.started;
      if (started || cancelled) return;
      browser.stop();
    }
    if (cancelled) {
      finish();
      return;
    }
    try {
      stopInner = await playServerTts(
        said,
        dialect,
        () => {
          if (!cancelled) onStart?.();
        },
        () => {
          if (!cancelled) finish();
        },
      );
    } catch {
      if (cancelled) {
        finish();
        return;
      }
      const retry = speakBrowser(
        said,
        dialect,
        () => {
          if (!cancelled) onStart?.();
        },
        () => {
          if (!cancelled) finish();
        },
      );
      stopInner = retry.stop;
      const ok = await retry.started;
      if (!ok) finish();
    }
  })();
  return () => {
    cancelled = true;
    stopInner();
    stopAudio();
    stopBrowserSpeak();
    finish();
  };
}

export function speakWelcome(text: string, dialect: Dialect) {
  return speakText(text, dialect);
}

export type ListenCtl = {
  stop: () => void;
  pause: () => void;
  resume: () => void;
};

export function startListen(
  dialect: Dialect,
  handlers: {
    onFinal: (text: string) => void;
    onPartial?: (text: string) => void;
    onError?: (code: string) => void;
  },
): ListenCtl {
  const Ctor = recognitionCtor();
  const noop: ListenCtl = { stop() {}, pause() {}, resume() {} };
  if (!Ctor) {
    handlers.onError?.("no-stt");
    return noop;
  }
  const RecEngine = Ctor;
  let wanted = true;
  let paused = false;
  let rec: Rec | null = null;
  let restartTimer = 0;

  function boot() {
    if (!wanted || paused) return;
    window.clearTimeout(restartTimer);
    try {
      rec?.abort();
    } catch {
      /* ignore */
    }
    const next = new RecEngine();
    rec = next;
    let seen = 0;
    next.lang = (DIALECT_UI[dialect] || DIALECT_UI.eg).bcp47;
    next.interimResults = true;
    next.continuous = true;
    next.onresult = (ev) => {
      if (!wanted || paused) return;
      let interim = "";
      const fresh: string[] = [];
      for (let i = 0; i < ev.results.length; i += 1) {
        const row = ev.results[i];
        const piece = row[0]?.transcript || "";
        if (!row.isFinal) {
          interim += piece;
          continue;
        }
        if (i < seen) continue;
        seen = i + 1;
        if (piece.trim()) fresh.push(piece.trim());
      }
      if (interim) handlers.onPartial?.(interim);
      const text = fresh.join(" ").replace(/\s+/g, " ").trim();
      if (text) handlers.onFinal(text);
    };
    next.onerror = (ev) => {
      const code = String(ev.error || "error");
      if (code === "no-speech" || code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        wanted = false;
        handlers.onError?.(code);
      }
    };
    next.onend = () => {
      if (rec === next) rec = null;
      if (!wanted || paused) return;
      restartTimer = window.setTimeout(boot, 80);
    };
    try {
      next.start();
    } catch {
      restartTimer = window.setTimeout(boot, 160);
    }
  }

  boot();
  return {
    stop() {
      wanted = false;
      paused = false;
      window.clearTimeout(restartTimer);
      try {
        rec?.stop();
      } catch {
        try {
          rec?.abort();
        } catch {
          /* ignore */
        }
      }
      rec = null;
    },
    pause() {
      paused = true;
      window.clearTimeout(restartTimer);
      try {
        rec?.stop();
      } catch {
        try {
          rec?.abort();
        } catch {
          /* ignore */
        }
      }
      rec = null;
    },
    resume() {
      if (!wanted) return;
      paused = false;
      boot();
    },
  };
}
