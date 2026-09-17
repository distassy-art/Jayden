import type { Metadata } from "next";
import { IBM_Plex_Sans, Tajawal } from "next/font/google";
import { SiteShell } from "@/components/SiteShell";
import { DEMO_ORIGIN, hreflang } from "@/lib/i18n";
import "../../globals.css";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-money",
});

export const metadata: Metadata = {
  metadataBase: new URL(DEMO_ORIGIN),
  title: {
    default: "QServe | Queue management system Egypt",
    template: "%s | QServe",
  },
  description:
    "QServe (QSERVE) in Egypt: queue management system Egypt, nurse call system Egypt, and self service kiosk Egypt. Quote on WhatsApp.",
  robots: { index: true, follow: true },
  icons: { icon: "/brand/qserve-logo-wordmark.png" },
  alternates: hreflang("/en"),
};

const orgJson = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "QServe",
  alternateName: ["QSERVE", "كيوسيرف", "كيو سيرف", "كيوسيرف مصر"],
  url: "https://www.qserveai.com",
  description: "QServe — queue management system Egypt, nurse call, and self-service kiosks.",
});

export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${tajawal.className} ${plex.variable}`}>
      <body className="min-h-screen antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: orgJson }} />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
