"use client";

import { usePathname } from "next/navigation";
import { CartDrawer } from "@/components/CartDrawer";
import { SalesmanChat } from "@/components/SalesmanChat";
import { VisitBeacon } from "@/components/VisitBeacon";
import { WhatsAppDock } from "@/components/WhatsAppDock";

export function PublicChrome() {
  const path = usePathname() || "/";
  const admin = path === "/admin" || path.startsWith("/en/admin");
  if (admin) return null;
  return (
    <>
      <VisitBeacon />
      <CartDrawer />
      <SalesmanChat />
      <WhatsAppDock />
    </>
  );
}
