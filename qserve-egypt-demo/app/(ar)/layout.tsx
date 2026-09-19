import type { Metadata } from "next";
import { IBM_Plex_Sans, Tajawal } from "next/font/google";
import { SiteShell } from "@/components/SiteShell";
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
    default: "كيوسيرف | نظام انتظار العملاء في مصر",
    template: "%s | كيوسيرف",
  },
  description:
    "كيوسيرف على www.qserveai.com: كيوسك وتذكرة وشاشات انتظار للبنوك والمستشفيات والجهات.",
  robots: { index: true, follow: true },
  icons: { icon: "/brand/qserve-logo-wordmark.png" },
  alternates: hreflang("/"),
};

const orgJson = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "كيوسيرف",
  alternateName: ["كيو سيرف", "QServe", "QSERVE", "كيوسيرف مصر"],
  url: "https://www.qserveai.com",
  description: "كيوسيرف — نظام انتظار العملاء في مصر. كيوسك وشاشات انتظار واستدعاء الممرضات.",
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
