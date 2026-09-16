import type { Metadata } from "next";
import { ContactView } from "@/components/views/ContactView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/contact", "تواصل معنا");

export default function ContactPage() {
  return <ContactView />;
}
