/** Public sell prices only (2× typical buy). No supplier cost on the public site. */

export const accessorySell = [
  { sku: "TH-80X80", nameAr: "رول حراري تذاكر 80×80 مم", nameEn: "Thermal ticket roll 80×80mm", unitAr: "رول", unitEn: "roll", sellUsd: 0.9 },
  { sku: "TH-80X70", nameAr: "رول حراري كيوسك 80×70 مم", nameEn: "Kiosk thermal roll 80×70mm", unitAr: "رول", unitEn: "roll", sellUsd: 0.8 },
  { sku: "TH-57X50", nameAr: "رول حراري 57 مم", nameEn: "57mm thermal roll", unitAr: "رول", unitEn: "roll", sellUsd: 0.56 },
  { sku: "PRN-XP-T80Q", nameAr: "طابعة تذاكر 80 مم", nameEn: "80mm ticket printer", unitAr: "قطعة", unitEn: "pc", sellUsd: 56 },
  { sku: "KSK-KP802", nameAr: "طابعة كيوسك مدمجة", nameEn: "Embedded kiosk printer", unitAr: "قطعة", unitEn: "pc", sellUsd: 124 },
  { sku: "RFID-M1K", nameAr: "كارت MIFARE 1K", nameEn: "MIFARE 1K card", unitAr: "كارت", unitEn: "card", sellUsd: 0.3 },
  { sku: "PVC-CR80", nameAr: "كارت PVC أبيض", nameEn: "Blank PVC card", unitAr: "كارت", unitEn: "card", sellUsd: 0.16 },
  { sku: "RIB-EV-R3011", nameAr: "شريط Evolis YMCKO", nameEn: "Evolis YMCKO ribbon", unitAr: "شريط", unitEn: "ribbon", sellUsd: 48 },
  { sku: "RIB-ZC-250", nameAr: "شريط Zebra ZC300", nameEn: "Zebra ZC300 ribbon", unitAr: "شريط", unitEn: "ribbon", sellUsd: 66 },
  { sku: "NC-BTN-2K", nameAr: "زر استدعاء ممرضات", nameEn: "Nurse-call button", unitAr: "قطعة", unitEn: "pc", sellUsd: 20 },
  { sku: "NC-CORD-RJ", nameAr: "سلك زر سرير", nameEn: "Bedside nurse-call cord", unitAr: "قطعة", unitEn: "pc", sellUsd: 6.4 },
  { sku: "LCD-Q4D", nameAr: "شاشة رقم الانتظار", nameEn: "Now-serving LED", unitAr: "قطعة", unitEn: "pc", sellUsd: 96 },
  { sku: "PSU-24V25", nameAr: "مزود 24V للطابعة", nameEn: "24V printer PSU", unitAr: "قطعة", unitEn: "pc", sellUsd: 9 },
  { sku: "TPH-80", nameAr: "رأس طباعة 80 مم", nameEn: "80mm print mechanism", unitAr: "قطعة", unitEn: "pc", sellUsd: 64 },
];

export function matchAccessory(text: string) {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/رول|ورق|paper|roll|thermal/, "TH-80X80"],
    [/كيوسك.*طابع|kiosk printer|kp-?802/, "KSK-KP802"],
    [/طابع|printer|xprinter/, "PRN-XP-T80Q"],
    [/mifare|رفيد|rfid/, "RFID-M1K"],
    [/pvc|كارت أبيض|blank card/, "PVC-CR80"],
    [/evolis|r3011/, "RIB-EV-R3011"],
    [/zebra|zc300|شريط/, "RIB-ZC-250"],
    [/زر.*ممر|nurse.*button|call button/, "NC-BTN-2K"],
    [/سلك|cord|bedside/, "NC-CORD-RJ"],
    [/شاشة|led|display|lcd/, "LCD-Q4D"],
    [/باور|power|مزود|adapter|24v/, "PSU-24V25"],
    [/رأس|mechanism|tph|قاطع/, "TPH-80"],
  ];
  for (const [re, sku] of rules) {
    if (re.test(t)) return accessorySell.find((a) => a.sku === sku);
  }
  return undefined;
}
