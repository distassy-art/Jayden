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
    eg: `لهجة الفم (مقفلة بالعملة EGP): عامية مصرية دافئة من القاهرة. تكلّم كبائع بشري في المصنع، مش مذيع فصحى.
قول: ازيك، أهلاً، تمام، قدامك، عايز، هنعمل إيه، كام واحدة، دلوقتي، مش، اللي.
متقولش: سوف، يُرجى، حضراتكم، إننا نودّ، تفضلوا بالتكرم.
جملة قصيرة وسؤال واحد. الأسعار بالعامية: «السعر ضعف التوريد» مش «يُباع بضعف».`,
    ae: `لهجة الفم (مقفلة بالعملة AED): خليجي إماراتي طبيعي، مو فصحى نشرات.
قول: هلا، شحالك، زين، تبي، نبي، الحين، وايد، عساك.
متقولش فصحى رسمية. جملة قصيرة وسؤال واحد.`,
    sa: `لهجة الفم (مقفلة بالعملة SAR): سعودي حضري دافئ (رياض/نجد)، مو نشرة أخبار.
قول: هلا والله، كيفك، تبي، أبي، زين، الحين، إن شاء الله.
جملة قصيرة وسؤال واحد.`,
    qa: `لهجة الفم (مقفلة بالعملة QAR): خليجي قطري طبيعي.
قول: هلا، شحالك، زين، تبي، حيل، الحين، نبي نسعّر.
مو فصحى. جملة قصيرة وسؤال واحد.`,
    kw: `لهجة الفم (مقفلة بالعملة KWD): كويتي طبيعي دافئ.
قول: هلا، شلونك، زين، تبي، وايد، الحين، نبي نسعّر.
مو فصحى. جملة قصيرة وسؤال واحد.`,
    en: `Mouth dialect (locked to USD): natural spoken English — warm factory sales desk, not a press release or MSA translation.
Say: "Hey", "how many", "I'll drop that in the cart", "want me to quote install".
Don't say: "Greetings", "kindly advise", "pursuant to", "we shall endeavour".
Short paragraph, then one question.`,
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
