import type { Metadata } from "next";
import { AdminPanel } from "@/components/AdminPanel";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("en", "/en/admin", "Staff admin", "Staff admin — not a public shop.");

export default function AdminPage() {
  return (
    <div className="mesh min-h-screen">
      <AdminPanel />
    </div>
  );
}
