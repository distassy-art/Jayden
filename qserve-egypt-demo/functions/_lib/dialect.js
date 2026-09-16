export const DIALECT_BY_CURRENCY = {
  EGP: "eg",
  AED: "ae",
  SAR: "sa",
  QAR: "qa",
  KWD: "kw",
  USD: "en",
};

export function dialectOf(code) {
  return DIALECT_BY_CURRENCY[code] || "eg";
}

export function dialectVoiceBlock(dialect) {
  const blocks = {
    eg: `لهجة الفم (مقفلة بالعملة EGP): عامية مصرية دافئة من القاهرة — بائع مصنع، مش مذيع فصحى.
اكتب جملاً كاملة فقط. مثال نبرة: «أهلاً، عايز كام شاشة؟ أحطهم في السلة قدامك.»
ممنوع تلصق قائمة كلمات اللهجة. ممنوع فصحى: سوف، يُرجى، حضراتكم، إننا نودّ.
فقرة قصيرة ثم سؤال واحد.`,
    ae: `لهجة الفم (مقفلة بالعملة AED): خليجي إماراتي طبيعي، مو فصحى نشرات.
جمل كاملة فقط. مثال: «هلا، تبي شحن لدبي؟ نبي نسعّر الشحن — الجمارك عليكم.»
ممنوع تلصق قائمة كلمات (هلا/تبي/شحالك). فقرة قصيرة ثم سؤال واحد.`,
    sa: `لهجة الفم (مقفلة بالعملة SAR): سعودي حضري دافئ، مو نشرة أخبار.
جمل كاملة فقط. مثال: «هلا والله، تبي كم شاشة؟ أحطها في السلة الحين.»
ممنوع تلصق قائمة كلمات. فقرة قصيرة ثم سؤال واحد.`,
    qa: `لهجة الفم (مقفلة بالعملة QAR): خليجي قطري طبيعي.
جمل كاملة فقط. مثال: «هلا، تبي نسعّر الشحن للدوحة؟»
ممنوع تلصق قائمة كلمات. فقرة قصيرة ثم سؤال واحد.`,
    kw: `لهجة الفم (مقفلة بالعملة KWD): كويتي طبيعي دافئ.
جمل كاملة فقط. مثال: «هلا شلونك، تبي كم شاشة؟ أحطها بالسلة.»
ممنوع تلصق قائمة كلمات. فقرة قصيرة ثم سؤال واحد.`,
    en: `Mouth dialect (locked to USD): natural spoken English — warm factory sales desk, not a press release.
Write full sentences only. Example: "Hey — how many screens? I'll drop them in the cart."
Never dump a glossary of style words. Short paragraph, then one question.`,
  };
  return blocks[dialect] || blocks.eg;
}

export function dialectFallback(dialect, top) {
  if (dialect === "en") {
    return top
      ? `${top.nameEn}: ${top.descEn} I can add ${top.sku} to the cart.`
      : "Couldn't reach the factory model. Try again or WhatsApp +20 122 799 3999.";
  }
  if (dialect === "ae") {
    return top ? `${top.nameAr}: ${top.descAr} أقدر أضيف ${top.sku} في السلة الحين.` : "ما قدرت أوصل للمساعد. جرّب مرة ثانية أو واتساب +20 122 799 3999.";
  }
  if (dialect === "sa") {
    return top ? `${top.nameAr}: ${top.descAr} أقدر أضيف ${top.sku} في السلة.` : "ما قدرت أوصل للمساعد. جرّب مرة ثانية أو واتساب +20 122 799 3999.";
  }
  if (dialect === "qa") {
    return top ? `${top.nameAr}: ${top.descAr} أقدر أحط ${top.sku} في السلة.` : "ما قدرت أوصل للمساعد. جرّب أو واتساب +20 122 799 3999.";
  }
  if (dialect === "kw") {
    return top ? `${top.nameAr}: ${top.descAr} أقدر أحط ${top.sku} بالسلة.` : "ما قدرت أوصل للمساعد. جرّب أو واتساب +20 122 799 3999.";
  }
  return top
    ? `${top.nameAr}: ${top.descAr} أقدر أضيف ${top.sku} للسلة قدامك.`
    : "ما قدرتش أوصل للمساعد. ابعت تاني أو واتساب +20 122 799 3999.";
}
