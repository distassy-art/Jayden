import { PublicChrome } from "@/components/PublicChrome";
import { DemoBanner } from "@/components/DemoBanner";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="sticky top-0 z-50">
        <DemoBanner />
        <Header />
      </div>
      <main>{children}</main>
      <Footer />
      <PublicChrome />
    </>
  );
}
