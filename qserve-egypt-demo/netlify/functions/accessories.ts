import type { Config } from "@netlify/functions";
import { publicAccessories } from "../../functions/_lib/catalog.js";
import { json, optionsOk } from "./_shared/http";

export default async (req: Request) => {
  if (req.method === "OPTIONS") return optionsOk();
  if (req.method !== "GET") return json({ error: "method" }, 405);
  return json({ items: publicAccessories() });
};

export const config: Config = {
  path: "/api/accessories",
  method: ["GET", "OPTIONS"],
};
