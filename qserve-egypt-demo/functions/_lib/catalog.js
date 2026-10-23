import { catalogItems } from "./kb.js";

export function withSell(item) {
  const buyUsd = Number(item.buyUsd || 0);
  const sellUsd = Number((buyUsd * 2).toFixed(4));
  return { ...item, sellUsd, marginPct: 100 };
}

export function catalogWithSell(overrides) {
  return catalogItems(overrides).map(withSell);
}

export const catalog = catalogItems();

export function publicAccessories(overrides) {
  return catalogItems(overrides)
    .filter((i) => i.priceRule === "catalog-2x")
    .map(({ sku, nameAr, nameEn, unitAr, unitEn, sellUsd, category, page }) => ({
      sku,
      nameAr,
      nameEn,
      unitAr,
      unitEn,
      sellUsd,
      category,
      page,
    }));
}
