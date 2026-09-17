"use client";

import { site } from "@/lib/content";
import type { HydratedLine } from "@/lib/cart";
import {
  SHIP_OPTIONS,
  catalogWeightKg,
  installLines,
  parcelLines,
  quoteOnlyHint,
  setPartnerInstall,
  setShipId,
  shipGroup,
  useShip,
  type ShipId,
} from "@/lib/shipping";

function destLabel(shipId: ShipId | "", ar: boolean) {
  const opt = SHIP_OPTIONS.find((o) => o.id === shipId);
  return opt ? `${ar ? opt.groupAr : opt.groupEn} — ${ar ? opt.ar : opt.en}` : ar ? "لم تُحدَّد بعد" : "not chosen yet";
}

function cartRows(hydrated: HydratedLine[], ar: boolean) {
  return hydrated.map((l) => `${l.qty}× ${l.sku} ${ar ? l.item.nameAr : l.item.nameEn}${l.quote ? (ar ? " (عرض)" : " (quote)") : ""}`);
}

export function fulfillmentQuoteBody(
  kind: "INST-EG" | "SHIP-ME" | "INST-ME" | "SHIP-EG",
  hydrated: HydratedLine[],
  shipId: ShipId | "",
  ar: boolean,
) {
  const kg = catalogWeightKg(hydrated);
  const dest = destLabel(shipId, ar);
  const rows = cartRows(hydrated, ar);
  const heads: Record<typeof kind, [string, string]> = {
    "INST-EG": ["طلب عرض تركيب INST-EG — QServe AI #تركيب", "Install quote INST-EG — QServe AI #تركيب"],
    "SHIP-ME": ["تقدير ثم طلب عرض شحن SHIP-ME #شحن", "Estimate then shipping quote SHIP-ME #شحن"],
    "INST-ME": ["طلب عرض تركيب محلي INST-ME — شريك/فني معتمد #تركيب", "Local-partner install quote INST-ME #تركيب"],
    "SHIP-EG": ["تقدير ثم طلب عرض شحن داخل مصر #شحن", "Estimate then Egypt shipping quote #شحن"],
  };
  const head = ar ? heads[kind][0] : heads[kind][1];
  const policy =
    kind === "INST-EG"
      ? ar
        ? "فريق QServe AI. ليست SKU توصيل ولا بوسطة للكيوسك."
        : "QServe AI team. Not a courier SKU — no Bosta for kiosks."
      : kind === "INST-ME"
        ? ar
          ? "الشحن من مصر. التركيب عبر طرف ثالث محلي نسعّره. لا وعد أن طاقم QServe AI يسافر."
          : "We ship from Egypt. Install is a third-party local quote. QServe AI staff do not fly out."
        : kind === "SHIP-ME"
          ? ar
            ? "تقدير فقط — لا رقم شحن وهمي. أرامكس/DHL/UPS/FedEx/سمسا. الجمارك على المستلم ما لم يُكتب في أمر الشراء."
            : "Estimate only — no invented freight figure. Aramex/DHL/UPS/FedEx/SMSA. Duties on the buyer unless the PO says otherwise."
          : ar
            ? "تقدير بعد الوزن والمدينة. لا رقم ج.م مخترع."
            : "Estimate after weight and city. No invented EGP freight.";
  return [
    head,
    `${ar ? "الوجهة" : "Destination"}: ${dest}`,
    kg ? `${ar ? "وزن كتالوج تقديري" : "Est. catalog weight"}: ${kg} kg` : "",
    policy,
    ar ? "قائمة الناقلين للتسعير في مستند المبيعات — ليست بند سلة." : "Carrier list is for quoting in the sales doc — not a cart line.",
    "",
    ...rows,
  ]
    .filter(Boolean)
    .join("\n");
}

export function ShipPicker({ hydrated, ar }: { hydrated: HydratedLine[]; ar: boolean }) {
  const { shipId, group, partner } = useShip();
  const egypt = SHIP_OPTIONS.filter((o) => o.group === "egypt");
  const me = SHIP_OPTIONS.filter((o) => o.group === "me");
  const systems = installLines(hydrated);
  const parcels = parcelLines(hydrated);
  const kg = catalogWeightKg(hydrated);
  return (
    <div className="rounded-2xl border border-navy/10 bg-void p-3">
      <p className="text-xs font-extrabold text-gold">{ar ? "الوجهة" : "Destination"}</p>
      <fieldset className="mt-2">
        <legend className="text-sm font-black text-navy">{ar ? egypt[0].groupAr : egypt[0].groupEn}</legend>
        {egypt.map((o) => (
          <label key={o.id} className="mt-1 flex items-center gap-2 text-sm">
            <input type="radio" name="ship" checked={shipId === o.id} onChange={() => setShipId(o.id)} />
            {ar ? o.ar : o.en}
          </label>
        ))}
      </fieldset>
      <fieldset className="mt-3">
        <legend className="text-sm font-black text-navy">{ar ? me[0].groupAr : me[0].groupEn}</legend>
        {me.map((o) => (
          <label key={o.id} className="mt-1 flex items-center gap-2 text-sm">
            <input type="radio" name="ship" checked={shipId === o.id} onChange={() => setShipId(o.id)} />
            {ar ? o.ar : o.en}
          </label>
        ))}
      </fieldset>

      {group === "egypt" && systems.length > 0 && (
        <div className="mt-3 rounded-xl border border-gold/30 bg-white p-3">
          <p className="text-sm font-black text-navy">{ar ? "INST-EG · عرض تركيب QServe AI" : "INST-EG · QServe AI install quote"}</p>
          <p className="mt-1 text-xs leading-5 text-navy/70">
            {ar
              ? "فريق QServe AI. ليست SKU توصيل."
              : "QServe AI team. Not a courier SKU."}
          </p>
        </div>
      )}

      {group === "egypt" && parcels.length > 0 && systems.length === 0 && (
        <div className="mt-3 rounded-xl border border-navy/10 bg-white p-3">
          <p className="text-sm font-black text-navy">{ar ? "تقدير" : "Estimate"}</p>
          <p className="mt-1 text-xs leading-5 text-navy/70">
            {ar
              ? `بعد الوزن (${kg || "—"} kg) والمدينة. لا رقم شحن في السلة.`
              : `After weight (${kg || "—"} kg) and city. No freight figure in the cart.`}
          </p>
        </div>
      )}

      {group === "me" && (
        <div className="mt-3 rounded-xl border border-cyan/30 bg-white p-3">
          <p className="text-sm font-black text-navy">{ar ? "SHIP-ME · تقدير ثم عرض شحن" : "SHIP-ME · estimate, then shipping quote"}</p>
          <p className="mt-1 text-xs leading-5 text-navy/70">
            {ar
              ? `وزن تقديري ${kg || "—"} kg. لا رقم ج.م مخترع. الجمارك على المستلم.`
              : `Est. weight ${kg || "—"} kg. No invented EGP freight. Duties on the buyer.`}
          </p>
          {systems.length > 0 && (
            <label className="mt-3 flex items-start gap-2 text-sm font-bold text-navy">
              <input type="checkbox" className="mt-1" checked={partner} onChange={(e) => setPartnerInstall(e.target.checked)} />
              <span>
                {ar ? "تركيب بواسطة شريك محلي (INST-ME)" : "Install by local partner (INST-ME)"}
                <span className="mt-0.5 block text-[11px] font-semibold text-navy/60">
                  {ar
                    ? "عرض سعر فقط — ليس حجز فني. فريق QServe AI لا يسافر."
                    : "Quote only — not a booked technician. QServe AI staff do not fly out."}
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-5 text-navy/55">{quoteOnlyHint(hydrated, ar, group)}</p>
    </div>
  );
}

function QuoteLink({ body, label, primary }: { body: string; label: string; primary?: boolean }) {
  const wa = `${site.whatsapp}?text=${encodeURIComponent(body)}`;
  return (
    <a
      className={`${primary ? "btn-go" : "btn-ghost"} w-full !py-2 text-sm`}
      href={wa}
      onClick={(e) => {
        e.preventDefault();
        window.location.href = wa;
      }}
    >
      {label}
    </a>
  );
}

export function FulfillmentCta({ hydrated, ar }: { hydrated: HydratedLine[]; ar: boolean }) {
  const { shipId, group, partner } = useShip();
  const systems = installLines(hydrated).length > 0;
  const parcels = parcelLines(hydrated).length > 0;
  const empty = hydrated.length === 0;
  if (empty) return null;

  if (group === "egypt" && systems) {
    const body = fulfillmentQuoteBody("INST-EG", hydrated, shipId, ar);
    return (
      <div className="mt-2">
        <QuoteLink body={body} label={ar ? "طلب عرض سعر" : "Request a quote"} primary />
      </div>
    );
  }

  if (group === "egypt" && parcels) {
    const body = fulfillmentQuoteBody("SHIP-EG", hydrated, shipId, ar);
    return (
      <div className="mt-2">
        <p className="mb-2 text-[11px] font-bold text-navy/60">{ar ? "تقدير — ثم:" : "Estimate — then:"}</p>
        <QuoteLink body={body} label={ar ? "طلب عرض سعر" : "Request a quote"} primary />
      </div>
    );
  }

  if (group === "me") {
    const shipBody = fulfillmentQuoteBody("SHIP-ME", hydrated, shipId, ar);
    const instBody = fulfillmentQuoteBody("INST-ME", hydrated, shipId, ar);
    return (
      <div className="mt-2 space-y-3">
        <p className="text-[11px] font-bold text-navy/60">{ar ? "تقدير — ثم:" : "Estimate — then:"}</p>
        <QuoteLink body={shipBody} label={ar ? "طلب عرض سعر" : "Request a quote"} primary />
        {systems && partner && (
          <QuoteLink body={instBody} label={ar ? "طلب عرض سعر" : "Request a quote"} />
        )}
      </div>
    );
  }

  return <p className="mt-2 text-[11px] text-navy/55">{ar ? "اختَر الوجهة لتظهر أزرار العرض." : "Pick a destination to show quote buttons."}</p>;
}
