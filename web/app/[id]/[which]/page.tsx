import { notFound } from "next/navigation";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tb3VerdictResolved } from "@/lib/tb3-audit-data";
import AuditTrajectoryViewer from "@/app/_components/audit/AuditTrajectoryViewer";

const WHICH = ["agent", "judge"] as const;
type Which = (typeof WHICH)[number];

export const dynamicParams = false;

export function generateStaticParams() {
  try {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public", "audit-traj", "manifest.json"), "utf-8"),
    ) as Record<string, { agent?: boolean; judge?: boolean }>;
    const out: { id: string; which: string }[] = [];
    for (const [id, has] of Object.entries(manifest)) {
      if (!tb3VerdictResolved(id)) continue;
      for (const w of WHICH) if (has[w]) out.push({ id, which: w });
    }
    return out;
  } catch {
    return [];
  }
}

export function generateMetadata({ params }: { params: { id: string; which: string } }) {
  const r = tb3VerdictResolved(params.id);
  const label = params.which === "judge" ? "Judge audit trace" : "Agent rollout";
  return { title: r ? `${label} — ${r.verdict.task_id}` : label };
}

export default function TrialTrajectoryPage({ params }: { params: { id: string; which: string } }) {
  if (!WHICH.includes(params.which as Which)) notFound();
  const r = tb3VerdictResolved(decodeURIComponent(params.id));
  if (!r) notFound();
  return (
    <AuditTrajectoryViewer
      id={params.id}
      which={params.which as Which}
      taskId={r.verdict.task_id}
      renderArcGrids={false}
      basePath=""
    />
  );
}
