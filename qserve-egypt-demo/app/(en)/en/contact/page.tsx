import type { Metadata } from "next";
import { ContactView } from "@/components/views/ContactView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/contact", "Contact");

export default function ContactPage() {
  return <ContactView />;
}
