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
    eg: `فمك عامية قاهرية / عامية مصرية — بائع شارع في القاهرة، واقف في المصنع، مش مذيع ومش خليجي ومش فصحى أخبار.
اتكلم زي ما الناس بتتكلم في العتبة أو مدينة نصر. حشو طبيعي في الجمل: إزيك، حاضر، تمام، معلش، ماشي، طب، يا باشا.
مثال نبرة (انسخ الإحساس مش الجملة):
«إزيك يا باشا. تمام. عايز إيه النهارده؟»
«حاضر. كام شاشة، واحد وعشرين ونص ولا خمسة عشر؟»
«تمام، هحطهم في السلة قدامك. الكابل HDMI ولا VGA؟»
«معلش، الأنظمة دي عرض سعر، مش كاشير.»
ممنوع تماماً: هل، ماذا، سوف، يُرجى، يمكنني، كيف يمكن، تفضلوا، نتشرف، إنه، الذي، كذلك، تبي، هلا والله، شحالك، وايد.
ممنوع ترجمة إنجليزي حرفياً («كيف يمكنني مساعدتك»). جملتين قصيرتين وسؤال واحد. الرد هيتقال صوت فخليه كلام مش مقال.`,
    ae: `لهجة الفم (مقفلة بالعملة AED): خليجي إماراتي طبيعي، مو فصحى نشرات.
جمل قصيرة. مثال: «هلا، تبي شحن لدبي؟ نبي نسعّر الشحن — الجمارك عليكم.»
ممنوع تلصق قائمة كلمات. فقرة قصيرة ثم سؤال واحد.`,
    sa: `لهجة الفم (مقفلة بالعملة SAR): سعودي حضري دافئ، مو نشرة أخبار.
جمل قصيرة. مثال: «هلا والله، تبي كم شاشة؟ أحطها في السلة الحين.»
ممنوع تلصق قائمة كلمات. فقرة قصيرة ثم سؤال واحد.`,
    qa: `لهجة الفم (مقفلة بالعملة QAR): خليجي قطري طبيعي.
جمل قصيرة. مثال: «هلا، تبي نسعّر الشحن للدوحة؟»
ممنوع تلصق قائمة كلمات. فقرة قصيرة ثم سؤال واحد.`,
    kw: `لهجة الفم (مقفلة بالعملة KWD): كويتي طبيعي دافئ.
جمل قصيرة. مثال: «هلا شلونك، تبي كم شاشة؟ أحطها بالسلة.»
ممنوع تلصق قائمة كلمات. فقرة قصيرة ثم سؤال واحد.`,
    en: `Mouth dialect (locked to USD): natural spoken English — warm factory sales desk, not a press release.
Short sentences. Example: "Hey. How many screens? I'll drop them in the cart."
Never dump a glossary. Short paragraph, then one question.`,
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
    ? `${top.nameAr}. تمام. أقدر أضيف ${top.sku} للسلة قدامك.`
    : "الخط مش ماسك. ابعت تاني أو واتساب +20 122 799 3999.";
}
