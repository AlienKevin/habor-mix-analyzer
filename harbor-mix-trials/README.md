# Harbor-Mix Final — Analysis Subset

Subset of `/data/harbor-mix-final/` containing only the **1777** trials
uploaded to Docent collection `c30f9b99-7c3c-4488-8207-d3706cdb193b`.

## What's here
- `uploaded_trials.jsonl` — 1 row per uploaded trial (full mv_harbor_mix_kept_w5
  metadata + `__sample_origin` provenance: `primary_seed42` or
  `replacement_seed43_no_traj_recovery`).
- `trials_extracted/<sanitized_task_name>/<trial_id>/{trajectory.json,result.json}` —
  hardlinked from `/data/harbor-mix-final/trials_extracted/`. **Read-only:**
  edits propagate to the source.
- `name_resolution.json`, `sample_stats.json`, `mv_task_names.txt`,
  `final_mix_tasks.txt` — companion metadata.

## Counts
- Trials: 1777
- Tasks: 100
- (model, agent) combos: 18
- Sample definition: 1 random failed trial per `(task_name, model, agent)` cell
  in `mv_harbor_mix_kept_w5` where any trial had `performance < 1.0`. Cells with
  no failed trial (model passed every kept trial OR fewer than 1 trial run)
  excluded — see `sample_stats.json`.

## Provenance
- Source: `public.mv_harbor_mix_kept_w5` (Supabase, Harbor production).
- Validity gate: matches `create_function.sql` @ `MrLYG/harbor-adapters-experiments`.
- Build script: `/data/harbor-mix-final/build_analysis_subset.py`.
