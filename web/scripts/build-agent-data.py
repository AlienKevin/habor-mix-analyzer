#!/usr/bin/env python3
"""Build machine-readable data exports for agent access.

Outputs to web/public/data/:
  index.json           — top-level index: summary, all rollout_ids, available downloads
  verdicts.json        — all 141 verdicts (full, with evidence + rationale)
  overview.json        — copy of judge3x3_overview.json (summary + tasks + qualitative + fn_patterns)
  per-rollout/<rid>.json — one file per rollout: verdict + agent traj meta + judge traj meta + verifier log
  per-task/<task_id>.json — one file per task: all 3 model verdicts + trial metas
"""
import json, glob, os, shutil
from pathlib import Path
from collections import defaultdict

WEB = Path("/data/habor-mix-analyzer-tmp/web")
OUT = WEB / "public" / "data"
TRAJ = WEB / "public" / "audit-traj"

# Load overview
ov = json.load(open(WEB / "lib" / "judge3x3_overview.json"))
audit_pack = json.load(open(WEB / "lib" / "tb3_audit_pack.json"))

# Load all verdicts (deduped, from latest run)
verdicts = {v["rollout_id"]: v for v in audit_pack["verdicts"]}

# Build per-rollout and per-task data
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
(OUT / "per-rollout").mkdir()
(OUT / "per-task").mkdir()

# Copy overview
(OUT / "overview.json").write_text(json.dumps(ov, indent=2) + "\n")

# Write all verdicts
(OUT / "verdicts.json").write_text(json.dumps(audit_pack, indent=2) + "\n")

# Per-task grouping
by_task = defaultdict(list)
for v in verdicts.values():
    by_task[v["task_id"]].append(v)

# Per-task files
for tid, vs in by_task.items():
    vs_sorted = sorted(vs, key=lambda v: ["opus","gpt","gem"].index(
        {"anthropic/claude-opus-4-8":"opus","gpt-5.5":"gpt","gemini/gemini-3.1-pro-preview":"gem"}.get(v.get("agent_model",""),"?")
    ) if v.get("agent_model") in {"anthropic/claude-opus-4-8":"opus","gpt-5.5":"gpt","gemini/gemini-3.1-pro-preview":"gem"} else 9)
    task_data = {
        "task_id": tid,
        "n_trials": len(vs_sorted),
        "verdicts": vs_sorted,
    }
    (OUT / "per-task" / f"{tid}.json").write_text(json.dumps(task_data, indent=2) + "\n")

# Per-rollout files
manifest = json.load(open(TRAJ / "manifest.json")) if (TRAJ / "manifest.json").exists() else {}

rollout_index = []
for rid, v in verdicts.items():
    entry = {
        "rollout_id": rid,
        "task_id": v["task_id"],
        "trial_id": v["trial_id"],
        "agent_model": v.get("agent_model"),
        "harness": v.get("harness"),
        "benchmark": v.get("benchmark"),
        "outcome_class": v.get("outcome_class"),
        "summary": v.get("judge_verdict",{}).get("summary",""),
        "concern": v.get("verifier_or_task_concern"),
        "downloads": {
            "verdict": f"/data/per-rollout/{rid}.json",
            "agent_trajectory": f"/audit-traj/{rid}/agent.json" if manifest.get(rid,{}).get("agent") else None,
            "judge_trajectory": f"/audit-traj/{rid}/judge.json" if manifest.get(rid,{}).get("judge") else None,
            "verifier_log": f"/audit-traj/{rid}/verifier.txt" if manifest.get(rid,{}).get("verifier") else None,
        },
    }
    rollout_index.append(entry)

    # Full per-rollout file
    rollout_data = {
        **entry,
        "verdict": v,
        "evidence": v.get("evidence", []),
        "outcome_rationale": v.get("outcome_rationale", ""),
        "judge_verdict": v.get("judge_verdict", {}),
        "verifier_signal": v.get("verifier_signal", {}),
    }
    (OUT / "per-rollout" / f"{rid}.json").write_text(json.dumps(rollout_data, indent=2) + "\n")

# Top-level index
index = {
    "description": "Bottom-up judge results for 47 hard Harbor-Index tasks x 3 frontier models (141 rollouts). Judge: composer-2.5 (cursor-cli, Daytona). All data is machine-readable JSON.",
    "summary": ov["summary"],
    "models": ov["models"],
    "fn_patterns": ov.get("fn_patterns", {}),
    "qualitative": ov.get("qualitative", []),
    "n_verdicts": len(verdicts),
    "n_tasks": len(by_task),
    "rollout_ids": sorted(verdicts.keys()),
    "task_ids": sorted(by_task.keys()),
    "downloads": {
        "overview": "/data/overview.json",
        "all_verdicts": "/data/verdicts.json",
        "per_rollout": "/data/per-rollout/<rollout_id>.json",
        "per_task": "/data/per-task/<task_id>.json",
    },
    "rollouts": rollout_index,
}
(OUT / "index.json").write_text(json.dumps(index, indent=2) + "\n")

print(f"wrote {len(rollout_index)} per-rollout files, {len(by_task)} per-task files, index.json, overview.json, verdicts.json")
print(f"output: {OUT}")
