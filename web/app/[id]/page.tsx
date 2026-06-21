import { readFileSync } from "node:fs";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { tb3VerdictResolved, tb3VerdictIds, tb3AllTrialIds } from "@/lib/tb3-audit-data";
import AuditWorkbench, { type AuditAvail } from "@/app/_components/audit/AuditWorkbench";
import instructions from "@/lib/judge3x3_instructions.json";

// Harbor-Index trials live at the root: /<rollout_id>/ . Only the known rollout
// ids are valid here; any other top-level path falls through to its static route
// or 404s (dynamicParams=false), so this dynamic segment can't shadow them.
export const dynamicParams = false;

export function generateStaticParams() {
  const ids = new Set<string>([...tb3VerdictIds(), ...tb3AllTrialIds()]);
  return [...ids].map((id) => ({ id }));
}

function availFor(id: string): AuditAvail {
  try {
    const m = JSON.parse(readFileSync(join(process.cwd(), "public", "audit-traj", "manifest.json"), "utf-8")) as Record<string, Partial<AuditAvail>>;
    const e = m[id] || {};
    return { agent: !!e.agent, judge: !!e.judge, verifier: !!e.verifier };
  } catch {
    return { agent: false, judge: false, verifier: false };
  }
}

export default function TrialAuditDetail({ params }: { params: { id: string } }) {
  const resolved = tb3VerdictResolved(decodeURIComponent(params.id));
  if (!resolved) notFound();
  const { verdict, reRun } = resolved;
  return (
    <div className="relative left-1/2 -my-6 w-screen -translate-x-1/2">
      <AuditWorkbench
        verdict={verdict}
        avail={availFor(verdict.rollout_id)}
        renderArcGrids={false}
        basePath=""
        reRun={reRun}
        backHref="/"
        backLabel="overview"
        taskInstruction={(instructions as Record<string, string>)[verdict.task_id] ?? null}
      />
    </div>
  );
}
