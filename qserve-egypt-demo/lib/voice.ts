export function speakWelcome(text: string, ar: boolean) {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => {};
  const say = () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = ar ? "ar-EG" : "en-US";
    u.rate = ar ? 1.02 : 1;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const pick = voices.find((v) => (ar ? v.lang.toLowerCase().startsWith("ar") : v.lang.toLowerCase().startsWith("en")));
    if (pick) u.voice = pick;
    window.speechSynthesis.speak(u);
  };
  say();
  window.speechSynthesis.addEventListener("voiceschanged", say, { once: true });
  return () => {
    window.speechSynthesis.cancel();
  };
}
