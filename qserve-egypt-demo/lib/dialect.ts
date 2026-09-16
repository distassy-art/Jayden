import type { Currency } from "./currency";

export type Dialect = "eg" | "ae" | "sa" | "qa" | "kw" | "en";

export const DIALECT_BY_CURRENCY: Record<Currency, Dialect> = {
  EGP: "eg",
  AED: "ae",
  SAR: "sa",
  QAR: "qa",
  KWD: "kw",
  USD: "en",
};

export type DialectUi = {
  bcp47: string;
  voiceLangs: string[];
  rtl: boolean;
  talk: string;
  stop: string;
  listen: string;
  speakHint: string;
  enableHint: string;
  micAllow: string;
  noStt: string;
  noSpeech: string;
  micFail: string;
  aria: string;
  close: string;
  typing: string;
  send: string;
  placeholder: string;
  failReply: string;
  failConn: string;
};

export const DIALECT_UI: Record<Dialect, DialectUi> = {
  eg: {
    bcp47: "ar-EG",
    voiceLangs: ["ar-EG", "ar-XA", "ar"],
    rtl: true,
    talk: "تحدث",
    stop: "إيقاف",
    listen: "سامعك…",
    speakHint: "تكلّم مع كيو AI",
    enableHint: "اضغط تحدث عشان تسمع كيو AI وتكلّمه.",
    micAllow: "اسمح بالميكروفون من المتصفح بعدين اضغط تحدث.",
    aria: "تحدث مع كيو AI",
    noStt: "المتصفح مش شايف المايك — استخدم كروم أو اكتب.",
    noSpeech: "ما سمعتش حاجة — اضغط تحدث وجرّب تاني.",
    micFail: "الميكروفون باظ. اضغط تحدث تاني.",
    close: "إغلاق",
    typing: "بيكتب…",
    send: "ابعت",
    placeholder: "أو اكتب هنا…",
    failReply: "ما قدرتش أرد، ابعت تاني.",
    failConn: "الخط قطع. ابعت تاني.",
  },
  ae: {
    bcp47: "ar-AE",
    voiceLangs: ["ar-AE", "ar-SA", "ar-XA", "ar"],
    rtl: true,
    talk: "تكلم",
    stop: "وقف",
    listen: "أسمعك…",
    speakHint: "كلم Q AI",
    enableHint: "اضغط تكلم عشان تسمع Q AI.",
    micAllow: "اسمح للمايك من المتصفح بعدين اضغط تكلم.",
    aria: "تكلم مع Q AI",
    noStt: "المتصفح ما يدعم التعرف — استخدم كروم أو اكتب.",
    noSpeech: "ما سمعت شي — اضغط تكلم وجرب مرة ثانية.",
    micFail: "المايك ما اشتغل. اضغط تكلم مرة ثانية.",
    close: "إغلاق",
    typing: "يكتب…",
    send: "أرسل",
    placeholder: "أو اكتب هنا…",
    failReply: "ما قدرت أرد، جرب مرة ثانية.",
    failConn: "الخط انقطع. أرسل مرة ثانية.",
  },
  sa: {
    bcp47: "ar-SA",
    voiceLangs: ["ar-SA", "ar-XA", "ar"],
    rtl: true,
    talk: "تكلم",
    stop: "إيقاف",
    listen: "أسمعك…",
    speakHint: "كلم Q AI",
    enableHint: "اضغط تكلم عشان تسمع Q AI.",
    micAllow: "اسمح للمايك من المتصفح ثم اضغط تكلم.",
    aria: "تكلم مع Q AI",
    noStt: "المتصفح ما يدعم التعرف — استخدم كروم أو اكتب.",
    noSpeech: "ما سمعت شيء — اضغط تكلم وجرب مرة ثانية.",
    micFail: "المايك ما اشتغل. اضغط تكلم مرة ثانية.",
    close: "إغلاق",
    typing: "يكتب…",
    send: "أرسل",
    placeholder: "أو اكتب هنا…",
    failReply: "ما قدرت أرد، جرب مرة ثانية.",
    failConn: "الخط انقطع. أرسل مرة ثانية.",
  },
  qa: {
    bcp47: "ar-QA",
    voiceLangs: ["ar-QA", "ar-AE", "ar-SA", "ar-XA", "ar"],
    rtl: true,
    talk: "تكلم",
    stop: "وقف",
    listen: "أسمعك…",
    speakHint: "كلم Q AI",
    enableHint: "اضغط تكلم عشان تسمع Q AI.",
    micAllow: "اسمح للمايك بعدين اضغط تكلم.",
    aria: "تكلم مع Q AI",
    noStt: "المتصفح ما يدعم التعرف — استخدم كروم أو اكتب.",
    noSpeech: "ما سمعت شي — اضغط تكلم وجرب.",
    micFail: "المايك ما اشتغل. اضغط تكلم مرة ثانية.",
    close: "إغلاق",
    typing: "يكتب…",
    send: "أرسل",
    placeholder: "أو اكتب هنا…",
    failReply: "ما قدرت أرد، جرب مرة ثانية.",
    failConn: "الخط انقطع. أرسل مرة ثانية.",
  },
  kw: {
    bcp47: "ar-KW",
    voiceLangs: ["ar-KW", "ar-SA", "ar-XA", "ar"],
    rtl: true,
    talk: "تكلم",
    stop: "وقف",
    listen: "أسمعك…",
    speakHint: "كلم Q AI",
    enableHint: "اضغط تكلم عشان تسمع Q AI.",
    micAllow: "سمّح للمايك من المتصفح بعدين اضغط تكلم.",
    aria: "تكلم مع Q AI",
    noStt: "المتصفح ما يدعم التعرف — استخدم كروم أو اكتب.",
    noSpeech: "ما سمعت شي — اضغط تكلم وجرب.",
    micFail: "المايك ما اشتغل. اضغط تكلم مرة ثانية.",
    close: "إغلاق",
    typing: "يكتب…",
    send: "أرسل",
    placeholder: "أو اكتب هنا…",
    failReply: "ما قدرت أرد، جرب مرة ثانية.",
    failConn: "الخط انقطع. أرسل مرة ثانية.",
  },
  en: {
    bcp47: "en-US",
    voiceLangs: ["en-US", "en-GB", "en"],
    rtl: false,
    talk: "Talk",
    stop: "Stop",
    listen: "Listening…",
    speakHint: "Speak to Q AI",
    enableHint: "Tap Talk to hear Q AI and speak to him.",
    micAllow: "Allow the microphone, then tap Talk.",
    aria: "Talk to Q AI",
    noStt: "This browser has no speech recognition — type, or use Chrome.",
    noSpeech: "I heard nothing — tap Talk and try again.",
    micFail: "Mic failed. Tap Talk again.",
    close: "Close",
    typing: "Typing…",
    send: "Send",
    placeholder: "Or type here…",
    failReply: "Couldn't reply — send that again.",
    failConn: "Connection dropped. Please resend.",
  },
};

export function dialectOf(code: Currency): Dialect {
  return DIALECT_BY_CURRENCY[code] || "eg";
}
