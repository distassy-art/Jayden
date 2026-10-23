import type { Metadata } from "next";
import { ProjectsView } from "@/components/views/ProjectsView";
import { pageMeta } from "@/lib/page-meta";

export const metadata: Metadata = pageMeta("ar", "/projects", "المشاريع");

export default function ProjectsPage() {
  return <ProjectsView />;
}
