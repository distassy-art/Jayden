import type { Metadata } from "next";
import { IBM_Plex_Sans, Tajawal } from "next/font/google";
import { SiteShell } from "@/components/SiteShell";
import { site } from "@/lib/content";
import { DEMO_ORIGIN, hreflang } from "@/lib/i18n";
import "../globals.css";

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
    default: `عرض تجريبي | ${site.brandAr}`,
    template: `عرض تجريبي | %s | ${site.shortAr}`,
  },
  description: `عرض تجريبي تفاعلي لـ ${site.brandAr} — ليس الموقع الحي.`,
  robots: { index: false, follow: false },
  icons: { icon: "/brand/qserve-logo-wordmark.png" },
  alternates: hreflang("/"),
};

const orgJson = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "QServe AI Egypt",
  alternateName: ["Q AI", "كيو سيرف AI مصر", "كيو AI"],
  description: "QServe AI — queue, kiosk, nurse-call. Demo only.",
});

export default function ArabicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.className} ${plex.variable}`}>
      <body className="min-h-screen antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: orgJson }} />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
