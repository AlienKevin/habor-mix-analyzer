#!/usr/bin/env python3
"""
backfill_test_stdout.py — download verifier outputs from Supabase storage
into each trial's directory.

Each trial in `harbor-mix-trials/trials_extracted/<task>/<trial_id>/` corresponds
to a tarball at
    https://hnkceovsiaczvcwhdlkb.supabase.co/storage/v1/object/public/trials/<trial_id>.tar.gz
that contains, among other things:

    <trial_name>/verifier/test-stdout.txt   <- the actual pytest output
    <trial_name>/verifier/reward.txt        <- "1" iff tests passed, else "0"

This script downloads each tarball, extracts those two files, and writes them
alongside the existing trajectory.json / result.json:

    trials_extracted/<task>/<trial_id>/test_stdout.txt
    trials_extracted/<task>/<trial_id>/reward.txt
    trials_extracted/<task>/<trial_id>/.test_stdout.status      <- one of: ok, missing, error:<short>

Idempotent: a trial whose `.test_stdout.status` file says "ok" is skipped.
Re-run with `--force` to redo.

Usage:
    python3 backfill_test_stdout.py [-j PARALLEL] [--force] [--limit N]
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import tarfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/data/trial-codex-analyze/harbor-mix-trials")
TRIALS_ROOT = ROOT / "trials_extracted"
SUPABASE_URL = "https://hnkceovsiaczvcwhdlkb.supabase.co/storage/v1/object/public/trials/{trial_id}.tar.gz"

WANT_SUFFIXES = ("verifier/test-stdout.txt", "verifier/reward.txt")
LOCAL_NAMES = {
    "verifier/test-stdout.txt": "test_stdout.txt",
    "verifier/reward.txt":      "reward.txt",
}


def fetch_one(trial_dir: Path, force: bool) -> tuple[Path, str]:
    """Download + extract for one trial. Returns (trial_dir, status)."""
    status_file = trial_dir / ".test_stdout.status"
    if not force and status_file.exists() and status_file.read_text().strip() == "ok":
        return trial_dir, "skip"

    trial_id = trial_dir.name
    url = SUPABASE_URL.format(trial_id=trial_id)
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            status_file.write_text("missing\n")
            return trial_dir, "missing"
        status = f"error:http_{e.code}"
        status_file.write_text(status + "\n")
        return trial_dir, status
    except Exception as e:  # noqa: BLE001
        status = f"error:{type(e).__name__}"
        status_file.write_text(status + "\n")
        return trial_dir, status

    extracted = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
            for m in tf.getmembers():
                for suffix, local in LOCAL_NAMES.items():
                    if m.name.endswith("/" + suffix):
                        f = tf.extractfile(m)
                        if f is None:
                            continue
                        (trial_dir / local).write_bytes(f.read())
                        extracted += 1
    except tarfile.TarError as e:
        status = f"error:tar_{type(e).__name__}"
        status_file.write_text(status + "\n")
        return trial_dir, status

    status = "ok" if extracted >= 1 else "error:no_verifier_files"
    status_file.write_text(status + "\n")
    return trial_dir, status


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-j", "--parallel", type=int, default=24)
    ap.add_argument("--force", action="store_true",
                    help="re-fetch even if .test_stdout.status is 'ok'")
    ap.add_argument("--limit", type=int, default=0,
                    help="stop after N trials (debugging)")
    args = ap.parse_args()

    trial_dirs = []
    for task_dir in sorted(p for p in TRIALS_ROOT.iterdir() if p.is_dir()):
        for trial_dir in sorted(p for p in task_dir.iterdir() if p.is_dir()):
            trial_dirs.append(trial_dir)
    if args.limit:
        trial_dirs = trial_dirs[: args.limit]
    print(f"trials  : {len(trial_dirs)}")
    print(f"parallel: {args.parallel}")
    print(f"force   : {args.force}")

    started = time.time()
    tally = {"ok": 0, "skip": 0, "missing": 0, "error": 0}
    n_done = 0
    with ThreadPoolExecutor(max_workers=args.parallel) as ex:
        futures = {ex.submit(fetch_one, td, args.force): td for td in trial_dirs}
        for fut in as_completed(futures):
            td, st = fut.result()
            tally["error" if st.startswith("error") else st] += 1
            n_done += 1
            if n_done % 100 == 0 or n_done == len(trial_dirs):
                elapsed = time.time() - started
                rate = n_done / max(elapsed, 1e-3)
                print(f"  {n_done}/{len(trial_dirs)}  "
                      f"ok={tally['ok']} skip={tally['skip']} "
                      f"missing={tally['missing']} error={tally['error']}  "
                      f"({rate:.1f}/s)")

    print()
    for k, v in tally.items():
        print(f"  {k:8s} {v}")
    return 0 if tally["error"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
