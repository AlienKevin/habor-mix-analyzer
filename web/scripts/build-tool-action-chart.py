#!/usr/bin/env python3
"""Aggregate tool/action counts by turn for harness×model pairs on a shared task set.

Output: web/data/tool_action_charts.json
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

CATEGORIES = ["Read", "Write", "Execute", "Internet search", "Other"]

# When a bash_command keystrokes blob contains multiple shell fragments, pick the
# highest-priority category (Execute beats Internet search beats Write beats Read; Other last).
CATEGORY_PRIORITY = {cat: i for i, cat in enumerate(CATEGORIES)}

REPO_ROOT = Path(__file__).resolve().parents[1]
TRIALS_ROOT = REPO_ROOT.parent / "harbor-index-trials" / "trials_extracted"
OUT_PATH = REPO_ROOT / "data" / "tool_action_charts.json"

# (harness id, harness display label, model substring, model display slug)
ChartSpec = tuple[str, str, str, str]

CHART_ROWS: list[tuple[str, list[ChartSpec]]] = [
    (
        "terminus-2",
        [
            ("terminus-2", "terminus-2", "gpt-5.5", "gpt-5.5"),
            ("terminus-2", "terminus-2", "claude-opus-4-7", "claude-opus-4-7"),
            ("terminus-2", "terminus-2", "gemini-3.1-pro-preview", "gemini-3.1-pro-preview"),
        ],
    ),
    (
        "native-harnesses",
        [
            ("codex", "Codex", "gpt-5.5", "gpt-5.5"),
            ("claude-code", "Claude Code", "claude-opus-4-7", "claude-opus-4-7"),
            ("gemini-cli", "Gemini CLI", "gemini-3.1-pro-preview", "gemini-3.1-pro-preview"),
        ],
    ),
]

# Back-compat alias for terminus-2 row helpers.
TERMINUS_ROW = CHART_ROWS[0][1]
ALL_CHART_SPECS: list[ChartSpec] = [spec for _, specs in CHART_ROWS for spec in specs]

PROMPT_PREFIX = re.compile(r"^root@[^:]+:[^#]*#\s*")
HEREDOC_START = re.compile(r"<<-?\s*(['\"]?)([A-Za-z0-9_]+)\1")


def strip_prompt_lines(keystrokes: str) -> str:
    lines: list[str] = []
    for raw in keystrokes.splitlines():
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        lines.append(PROMPT_PREFIX.sub("", line))
    return "\n".join(lines)


def split_commands(keystrokes: str) -> list[str]:
    """Split keystrokes into shell commands without breaking heredocs or python -c blobs."""
    blob = strip_prompt_lines(keystrokes).strip()
    if not blob:
        return []

    # Whole keystrokes is one logical unit when heredoc / inline python would break on ';'.
    if HEREDOC_START.search(blob):
        return [blob]
    if re.search(r"\bpython3?\s+-c\b", blob, re.I):
        return [blob]
    if re.search(r"\bpython3?\s+-?\s*<<", blob, re.I):
        return [blob]
    if re.search(r"\bnode\s+-e\b", blob, re.I) and blob.count("\n") > 0:
        return [blob]

    parts = re.split(r"\s*&&\s*|\s*;\s*", blob)
    return [p.strip() for p in parts if p.strip()]


def _is_heredoc_write(cmd: str) -> bool:
    return bool(
        re.search(r"<<-?\s*['\"]?[A-Za-z0-9_]+['\"]?\s*>", cmd)
        or re.search(r"\b(cat|python3?)\b.*<<", cmd, re.I) and re.search(r">", cmd)
    )


def _has_internet_fetch(cmd: str) -> bool:
    low = cmd.lower().strip()
    first = re.split(r"\s+", low)[0] if low else ""
    # curl/wget mentioned only as an argument to lookup helpers, not invoked
    if first in ("which", "type", "command", "whereis"):
        return False
    if re.search(r"\b(curl|wget|httpie|xh)\b", low):
        return True
    if re.search(r"\bgit\s+clone\b", low):
        return True
    if re.search(r"\b(npm\s+install|pnpm\s+add|yarn\s+add)\b", low) and re.search(r"https?://", low):
        return True
    if re.search(
        r"\b(requests\.(get|post|put|delete|head|patch|request)|"
        r"urllib\.(request|urlopen)|"
        r"httpx\.(get|post|put|delete|head|patch|request)|"
        r"aiohttp\.|"
        r"duckduckgo_search)\b",
        low,
    ):
        return True
    # MCP / sidecar JSON-RPC over HTTP
    if re.search(r"\bcurl\b.*\b(mcp|jsonrpc|/api/)\b", low):
        return True
    if re.search(r"/tmp/mcp_call\.sh\b", low):
        return True
    return False


def _is_write(cmd: str) -> bool:
    low = cmd.lower()
    if re.search(r"(<<-?\s*['\"]?[A-Za-z0-9_]+['\"]?\s*>|>>|>\s*[^\s&|]+)", cmd):
        return True
    if re.search(
        r"\b(sed\s+-i|tee\b|touch\b|mkdir\b|chmod\b|chown\b|truncate\b|"
        r"ln\s+-s|mktemp\b|dd\b)\b",
        low,
    ):
        return True
    if re.search(r"\b(cp|mv|rm|rmdir)\b", low):
        return True
    if re.search(r"\bprintf\b.*>", cmd):
        return True
    if re.search(r"\b(cat|python3?)\b.*<<", cmd, re.I) and re.search(r">", cmd):
        return True
    if re.search(r"\bgit\s+(add|commit|push|pull|merge|rebase|checkout|reset|stash|tag)\b", low):
        return True
    if re.search(r"\bperl\b.*\s-p[iI]\b", low):
        return True
    if re.search(r"\bgit\s+config\b", low):
        return True
    return False


def _is_execute(cmd: str) -> bool:
    low = cmd.lower()
    if re.search(r"^[\x03\x04]", cmd):  # C-c / C-d only
        return False
    if re.search(
        r"\b(?:make|cmake|ninja|meson|pytest|ctest|cargo|npm|yarn|pnpm|pip3?|pip|uv|"
        r"apt-get|apt|dnf|yum|brew|"
        r"docker|podman|java|mvn|gradle|dbt|"
        r"chafa|magick|convert|identify|duckdb|fasttext|tesseract|sqlite3|psql|"
        r"redis-cli|ffmpeg|ffprobe|openssl|"
        r"tar|zip|unzip|7z)\b|"
        r"\bgo\s+(?:build|test|run|install)\b|"
        r"\b(?:gcc|g\+\+|clang|rustc)\b|"
        r"\b(?:python3?|node)\s+(?:-m\s+)?(?:pytest|unittest|pip)\b|"
        r"\b(?:docker|podman)\s+(?:run|build|compose)\b|"
        r"\b(?:bash|sh|zsh)\s+[\w./-]+\.(?:sh|bash)\b|"
        r"\b(?:go|node|g\+\+|gcc|clang|rustc|git)\s+(?:--version|version)\b|"
        r"\bgit\s+submodule\b",
        low,
    ):
        return True
    if re.search(r"\bpython3?\s+-c\b", low):
        return True
    if re.search(r"\bpython3?\s+[\w./-]+\.py\b", low):
        return True
    if re.search(r"\bpython3?\s+-?\s*<<", low):
        return True
    if re.search(r"\bnode\s+[\w./-]+\.(js|mjs|cjs|ts)\b", low):
        return True
    if re.search(r"\./[\w./-]+", cmd):
        return True
    if re.match(r"^/[\w./-]+\.(sh|bash|py)\b", cmd.strip()):
        return True
    if re.search(r"(?:^|\s)/[\w./-]+\.(sh|bash)\b", cmd):
        return True
    if re.search(r"\b(source|\.)\s+[\w./-]+(?:/activate|\.env(?:\.[\w]+)?|\.sh|\.bash)\b", low):
        return True
    if re.search(r"\b(pytest|npm\s+(test|run|build)|cargo\s+(test|run|build))\b", low):
        return True
    if re.search(r"^[A-Z_][A-Z0-9_]*=", cmd.strip()) and re.search(r"\s/[\w./-]+", cmd):
        return True
    return False


def _is_read(cmd: str) -> bool:
    low = cmd.lower()
    c = cmd.strip()
    if re.search(
        r"\b(cat|head|tail|less|more|nl|wc|stat|which|type|pwd|cd|ls|tree|diff|"
        r"env|printenv|id|uname|hostname|df|du|free|mount|lsblk|readlink|realpath|"
        r"basename|dirname|jq|yq|xxd|hexdump|strings|ldd|nm|objdump|git\s+(status|log|diff|show|branch|remote|rev-parse))\b",
        low,
    ):
        return True
    if re.search(r"\bfile\s+\S", low):
        return True
    if re.search(r"\bsed\s+-n\b", low):
        return True
    if re.search(r"\bcommand\s+-v\b", low):
        return True
    if re.search(r"\btest\s+(-[fxd]|!|\[\s)", low) or re.match(r"^\[\s", c):
        return True
    if re.search(r"^\d+,\d+p'?(\s|$|/)", c) or re.search(r"^\d+,\d+p'\s+", c):
        return True
    # Local file / workspace search (not internet)
    if re.search(r"\b(grep|rg|ag|ack|find|fd|locate|git\s+grep)\b", low):
        return True
    if re.search(r"\b(pip|pip3|uv)\s+list\b", low):
        return True
    if re.search(r"\becho\b", low):
        return True
    if re.search(r"\bwhich\b", low):
        return True
    return False


def classify_command(cmd: str) -> str:
    c = cmd.strip()
    if not c:
        return "Other"
    if re.fullmatch(r"[\x00-\x1f\x7f]+", c):
        return "Other"
    if re.fullmatch(r"C-c|C-d|q|clear", c, re.I):
        return "Other"
    # Bare REPL / pasted code fragments without a shell driver
    if re.match(r"^(import|from|def|class|for|while|if|else|elif|try|except|return|print)\b", c):
        return "Other"
    if re.match(r"^[\w.]+\s*=", c) and not re.match(r"^\w+=", c):
        return "Other"

    if _is_heredoc_write(c):
        return "Write"
    if _has_internet_fetch(c):
        return "Internet search"
    if _is_write(c):
        return "Write"
    if _is_execute(c):
        return "Execute"
    if _is_read(c):
        return "Read"
    return "Other"


def model_matches(model_name: str, model_substr: str) -> bool:
    if model_substr in model_name:
        return True
    if model_substr == "claude-opus-4-7" and re.search(r"opus|claude-opus", model_name, re.I):
        return True
    return False


def commands_from_tool_call(fn: str, args: dict) -> list[str]:
    """Extract shell-like command fragments from a tool call, when applicable."""
    if fn == "bash_command":
        return split_commands(args.get("keystrokes") or "")
    if fn == "Bash":
        return split_commands(args.get("command") or "")
    if fn == "exec_command":
        return split_commands(args.get("cmd") or "")
    if fn == "run_shell_command":
        return split_commands(args.get("command") or "")
    return []


def classify_mcp_tool(fn: str) -> str:
    low = fn.lower()
    if any(x in low for x in ("web_search", "webfetch", "web_fetch")):
        return "Internet search"
    if any(
        x in low
        for x in (
            "send_email",
            "reply_to_email",
            "send_message",
            "save_",
            "add_calendar",
            "remove_saved",
            "add_to_cart",
            "checkout",
            "order_ride",
            "forward_email",
        )
    ):
        return "Write"
    if any(x in low for x in ("wait_for_notification", "get_time", "get_api_call")):
        return "Other"
    if any(x in low for x in ("__cat", "files__cat")):
        return "Read"
    if any(
        x in low
        for x in (
            "get_",
            "list_",
            "search_",
            "read_",
            "contacts",
            "messages",
            "emails",
            "calendar",
            "crime",
            "apartment",
            "product",
            "chat",
            "conversation",
            "notification",
        )
    ):
        return "Read"
    return "Other"


def actions_from_tool_call(tc: dict, harness: str = "") -> list[str]:
    """Classified action categories for one tool call.

    Shell keystrokes/commands split on && and ; count as separate actions (heredocs
    and inline python blobs stay one unit). Native structured tools count once each.
    """
    fn = tc.get("function_name") or ""
    args = tc.get("arguments") or {}

    if fn in (
        "mark_task_complete",
        "TodoWrite",
        "update_plan",
        "ToolSearch",
        "write_stdin",
        "Agent",
        "TaskOutput",
        "generalist",
        "TaskStop",
        "Skill",
        "activate_skill",
        "todo_write",
    ):
        return ["Other"]

    direct = {
        "Read": "Read",
        "read_file": "Read",
        "list_directory": "Read",
        "Write": "Write",
        "write_file": "Write",
        "Edit": "Write",
        "replace": "Write",
        "Grep": "Read",
        "grep_search": "Read",
        "Glob": "Read",
        "WebSearch": "Internet search",
        "WebFetch": "Internet search",
        "web_search_call": "Internet search",
        "web_fetch": "Internet search",
        "google_web_search": "Internet search",
        "view_image": "Read",
    }
    if fn in direct:
        return [direct[fn]]

    if fn.startswith("mcp") or "mcp__" in fn or fn.startswith("mcp_are_"):
        return [classify_mcp_tool(fn)]

    shell_fns = {"bash_command", "Bash", "exec_command", "run_shell_command"}
    if fn in shell_fns:
        parts = commands_from_tool_call(fn, args)
        if not parts:
            blob = (args.get("keystrokes") or args.get("command") or args.get("cmd") or "").strip()
            return [classify_command(strip_prompt_lines(blob))] if blob else ["Other"]
        return [classify_command(cmd) for cmd in parts]

    return ["Other"]


def classify_tool_call(tc: dict, harness: str = "") -> str:
    """Single category for a tool call (strongest fragment wins for batched shell)."""
    actions = actions_from_tool_call(tc, harness)
    if not actions:
        return "Other"
    return max(actions, key=lambda x: CATEGORY_PRIORITY.get(x, 99))


def discover_common_tasks_for_row(specs: list[ChartSpec]) -> set[str]:
    """Tasks that have a trajectory for every chart in the row."""
    by_task: dict[str, set[tuple[str, str]]] = defaultdict(set)
    needed = {(h, m) for h, _, m, _ in specs}

    for task_dir in sorted(TRIALS_ROOT.iterdir()):
        if not task_dir.is_dir():
            continue
        task = task_dir.name
        for trial_dir in sorted(task_dir.iterdir()):
            traj_path = trial_dir / "trajectory.json"
            if not traj_path.is_file():
                continue
            traj = json.loads(traj_path.read_text())
            agent = traj.get("agent") or {}
            harness = agent.get("name") or ""
            model_name = agent.get("model_name") or ""
            for h, _, model_substr, _ in specs:
                if harness != h:
                    continue
                if model_matches(model_name, model_substr):
                    by_task[task].add((h, model_substr))

    return {task for task, found in by_task.items() if needed <= found}


def trial_path_for_task(task: str, harness: str, model_substr: str) -> Path | None:
    task_dir = TRIALS_ROOT / task
    if not task_dir.is_dir():
        return None
    for trial_dir in sorted(task_dir.iterdir()):
        traj_path = trial_dir / "trajectory.json"
        if not traj_path.is_file():
            continue
        traj = json.loads(traj_path.read_text())
        agent = traj.get("agent") or {}
        if agent.get("name") != harness:
            continue
        if model_matches(agent.get("model_name") or "", model_substr):
            return traj_path
    return None


def aggregate_model(
    harness: str,
    harness_label: str,
    model_substr: str,
    display_model: str,
    tasks: set[str],
) -> dict:
    by_turn: dict[int, dict[str, int]] = defaultdict(lambda: {c: 0 for c in CATEGORIES})
    max_turn = 0
    n_trials = 0

    for task in sorted(tasks):
        traj_path = trial_path_for_task(task, harness, model_substr)
        if traj_path is None:
            continue
        traj = json.loads(traj_path.read_text())
        n_trials += 1
        turn_idx = 0
        for step in traj.get("steps") or []:
            if step.get("source") != "agent":
                continue
            tool_calls = step.get("tool_calls") or []
            if not tool_calls:
                continue
            for tc in tool_calls:
                for cat in actions_from_tool_call(tc, harness):
                    by_turn[turn_idx][cat] += 1
            turn_idx += 1
            max_turn = max(max_turn, turn_idx)

    rows = [{"turn": t, **by_turn[t]} for t in range(max_turn)]
    return {
        "harness": harness,
        "harnessLabel": harness_label,
        "model": display_model,
        "displayTitle": f"{display_model} · {harness_label}",
        "categories": CATEGORIES,
        "nTrials": n_trials,
        "maxTurn": max_turn,
        "byTurn": rows,
    }


def pct_mix(by_turn: dict[int, dict[str, int]]) -> dict[str, float]:
    totals = {c: 0 for c in CATEGORIES}
    for row in by_turn.values():
        for c in CATEGORIES:
            totals[c] += row[c]
    grand = sum(totals.values()) or 1
    return {c: 100 * totals[c] / grand for c in CATEGORIES}


def half_turn(by_turn: dict[int, dict[str, int]]) -> int:
    per_turn = [sum(by_turn[t].values()) for t in sorted(by_turn)]
    grand = sum(per_turn)
    acc = 0
    for i, v in enumerate(per_turn):
        acc += v
        if acc >= grand / 2:
            return i
    return 0


def sum_turn_band(by_turn: dict[int, dict[str, int]], start: int, end: int) -> int:
    total = 0
    for t in range(start, end):
        if t in by_turn:
            total += sum(by_turn[t].values())
    return total


def trial_by_turn(traj: dict) -> dict[int, dict[str, int]]:
    """Per-trial tool actions by agent turn index (tool-bearing steps only)."""
    harness = (traj.get("agent") or {}).get("name") or ""
    by_turn: dict[int, dict[str, int]] = defaultdict(lambda: {c: 0 for c in CATEGORIES})
    turn_idx = 0
    for step in traj.get("steps") or []:
        if step.get("source") != "agent":
            continue
        tool_calls = step.get("tool_calls") or []
        if not tool_calls:
            continue
        for tc in tool_calls:
            for cat in actions_from_tool_call(tc, harness):
                by_turn[turn_idx][cat] += 1
        turn_idx += 1
    return dict(by_turn)


def avg_actions_per_turn_in_band(
    by_turn: dict[int, dict[str, int]], start: int, end: int
) -> dict[str, float]:
    """Mean tool actions per turn within [start, end) for one trial."""
    n_turns = max(0, end - start)
    if n_turns == 0:
        return {"all": 0.0, **{c: 0.0 for c in CATEGORIES}}
    totals = {c: 0 for c in CATEGORIES}
    for t in range(start, end):
        row = by_turn.get(t, {})
        for c in CATEGORIES:
            totals[c] += row.get(c, 0)
    grand = sum(totals.values())
    return {
        "all": grand / n_turns,
        **{c: totals[c] / n_turns for c in CATEGORIES},
    }


def compute_comparison_table(tasks: set[str]) -> dict:
    """Per-model summary for all harness×model chart cells."""
    table_cols = ["Read", "Write", "Execute", "Internet search"]
    rows: list[dict] = []

    for harness, harness_label, model_substr, display_model in ALL_CHART_SPECS:
        per_trial: list[dict[str, float]] = []
        turns_per_trial: list[int] = []
        for task in sorted(tasks):
            traj_path = trial_path_for_task(task, harness, model_substr)
            if traj_path is None:
                continue
            traj = json.loads(traj_path.read_text())
            by_turn = trial_by_turn(traj)
            n_turns = len(by_turn)
            if n_turns == 0:
                continue
            turns_per_trial.append(n_turns)
            per_trial.append(avg_actions_per_turn_in_band(by_turn, 0, n_turns))

        if not per_trial:
            continue
        rows.append(
            {
                "model": f"{display_model} · {harness_label}",
                "turnsPerTask": sum(turns_per_trial) / len(turns_per_trial),
                "toolCallsPerTurn": sum(t["all"] for t in per_trial) / len(per_trial),
                **{c: sum(t[c] for t in per_trial) / len(per_trial) for c in table_cols},
            }
        )

    n = len(tasks)
    return {
        "title": "Tool call intensity by model (terminus-2 & native harnesses)",
        "description": (
            f"Each row summarizes one harness×model cell on the same {n} paired Harbor-Index tasks "
            "(terminus-2 row first, then Codex / Claude Code / Gemini CLI). Turns/Task is the mean "
            "count of agent steps with tool calls; Actions/Turn and Read/Write/Execute/Internet search "
            "are mean classified actions per step (Other omitted). Batched shell keystrokes split on "
            "&& / ; count as separate actions, matching one native tool call ≈ one action."
        ),
        "rows": rows,
    }


def compute_step_stats(tasks: set[str], specs: list[ChartSpec]) -> dict[str, dict[str, float]]:
    """Per-model agent-step counts and tool calls per step (paired tasks only)."""
    stats: dict[str, dict[str, float]] = {}
    for harness, _, model_substr, display_model in specs:
        step_counts: list[int] = []
        calls_per_step: list[float] = []
        for task in sorted(tasks):
            traj_path = trial_path_for_task(task, harness, model_substr)
            if traj_path is None:
                continue
            traj = json.loads(traj_path.read_text())
            steps = 0
            calls = 0
            for step in traj.get("steps") or []:
                if step.get("source") != "agent":
                    continue
                tool_calls = step.get("tool_calls") or []
                if not tool_calls:
                    continue
                steps += 1
                calls += sum(len(actions_from_tool_call(tc, harness)) for tc in tool_calls)
            step_counts.append(steps)
            if steps:
                calls_per_step.append(calls / steps)
        step_counts.sort()
        calls_per_step.sort()
        mid = len(step_counts) // 2
        stats[display_model] = {
            "median_steps": step_counts[mid] if step_counts else 0,
            "mean_steps": sum(step_counts) / len(step_counts) if step_counts else 0,
            "median_calls_per_step": calls_per_step[mid] if calls_per_step else 0,
            "turn0_calls_per_step": calls_per_step[0] if calls_per_step else 0,
        }
    return stats


def turn0_read_share(by_turn: dict[int, dict[str, int]]) -> float:
    row = by_turn.get(0, {})
    total = sum(row.values()) or 1
    return 100 * row.get("Read", 0) / total


def late_action_share(by_turn: dict[int, dict[str, int]], start: int = 20, end: int = 50) -> float:
    late = sum_turn_band(by_turn, start, end)
    grand = sum(sum(row.values()) for row in by_turn.values()) or 1
    return 100 * late / grand


def chart_by_harness(charts: list[dict], model: str, harness_label: str) -> dict | None:
    for ch in charts:
        if ch["model"] == model and ch.get("harnessLabel") == harness_label:
            return ch
    return None


def chart_metrics(ch: dict) -> dict:
    by_turn = {r["turn"]: {c: r.get(c, 0) for c in CATEGORIES} for r in ch["byTurn"]}
    n = ch["nTrials"] or 1
    total = sum(sum(row.values()) for row in by_turn.values())
    return {
        "by_turn": by_turn,
        "mix": pct_mix(by_turn),
        "per_trial": total / n,
        "half": half_turn(by_turn),
        "turn0": sum(by_turn.get(0, {}).values()),
        "turn0_read": turn0_read_share(by_turn),
        "late": late_action_share(by_turn),
    }


def chart_action_mix(ch: dict, mixes: dict[str, float]) -> str:
    web = "Internet search"
    model = ch["model"]
    harness = ch.get("harnessLabel") or ch.get("harness") or ""
    notes: dict[tuple[str, str], str] = {
        ("gpt-5.5", "terminus-2"): "Highest read and other shares; lowest execute — exploration- and wrap-up-heavy.",
        ("gpt-5.5", "Codex"): "High Other share — plan/update and meta tools; fewer batched shell calls than terminus-2.",
        ("claude-opus-4-7", "terminus-2"): (
            "Most balanced mix on terminus-2: read and execute are neck-and-neck, with more "
            "build/test than gpt-5.5 but not write-heavy like gemini."
        ),
        ("claude-opus-4-7", "Claude Code"): (
            "Structured Read/Write/Edit tools lift read share; low Other — one native tool per step."
        ),
        ("gemini-3.1-pro-preview", "terminus-2"): (
            "Highest write share on terminus-2; more editing and file creation than the other two."
        ),
        ("gemini-3.1-pro-preview", "Gemini CLI"): (
            "Write-heavy via write_file/replace; very low Other — native file tools replace batched bash."
        ),
    }
    note = notes.get((model, harness), "")
    return (
        f"{mixes['Read']:.0f}% read, {mixes['Write']:.0f}% write, "
        f"{mixes['Execute']:.0f}% execute, {mixes[web]:.0f}% internet search, {mixes['Other']:.0f}% other. "
        f"{note}"
    ).strip()


def enrich_charts_with_action_mix(charts: list[dict]) -> None:
    for ch in charts:
        by_turn = {r["turn"]: {c: r.get(c, 0) for c in CATEGORIES} for r in ch["byTurn"]}
        ch["actionMix"] = chart_action_mix(ch, pct_mix(by_turn))


def mix_range(metrics: dict[str, dict], category: str) -> tuple[float, float]:
    vals = [metrics[m]["mix"][category] for m in metrics]
    return min(vals), max(vals)


def build_insight_blocks(tasks: set[str], charts: list[dict]) -> list[dict[str, str]]:
    n = len(tasks)
    gpt, opus, gem = "gpt-5.5", "claude-opus-4-7", "gemini-3.1-pro-preview"
    cat_list = ", ".join(CATEGORIES)
    y_peak = y_max_for_charts(charts)

    term = {m: chart_metrics(chart_by_harness(charts, m, "terminus-2")) for m in (gpt, opus, gem)}
    native = {
        gpt: chart_metrics(chart_by_harness(charts, gpt, "Codex")),
        opus: chart_metrics(chart_by_harness(charts, opus, "Claude Code")),
        gem: chart_metrics(chart_by_harness(charts, gem, "Gemini CLI")),
    }
    step_term = compute_step_stats(tasks, TERMINUS_ROW)
    step_native = compute_step_stats(tasks, CHART_ROWS[1][1])

    term_read_lo, term_read_hi = mix_range(term, "Read")
    native_read_lo, native_read_hi = mix_range(native, "Read")
    term_write_lo, term_write_hi = mix_range(term, "Write")
    native_write_lo, native_write_hi = mix_range(native, "Write")

    return [
        {
            "label": "Fair comparison",
            "text": (
                f"Two rows plot the same {n} Harbor-Index tasks: row 1 on terminus-2, row 2 on each model's "
                f"native harness (Codex, Claude Code, Gemini CLI). All six charts share one y-axis "
                f"(peak bar = {y_peak}). Each bar counts classified actions at that agent turn index "
                f"across trials — not total work per trial. "
                f"Design choice: shell keystrokes/commands joined by && or ; are split into separate "
                f"actions (heredocs and inline python stay one unit), so one batched bash_command can "
                f"contribute several counts — comparable to separate native Read/Write/exec tools. "
                f"Categories: {cat_list}."
            ),
        },
        {
            "label": "How much work",
            "text": (
                f"After splitting batched shell, terminus-2 runs ~{term[gpt]['per_trial']:.0f}–"
                f"{term[gem]['per_trial']:.0f} classified actions per trial (gpt {term[gpt]['per_trial']:.0f}, "
                f"opus {term[opus]['per_trial']:.0f}, gemini {term[gem]['per_trial']:.0f}). Native harnesses "
                f"are still higher for gpt (Codex ~{native[gpt]['per_trial']:.0f}) because trials use more "
                f"tool-bearing steps and meta tools (plans, todos); Claude Code (~{native[opus]['per_trial']:.0f}) "
                f"and Gemini CLI (~{native[gem]['per_trial']:.0f}) sit closer to their terminus-2 counterparts."
            ),
        },
        {
            "label": "Opening turn",
            "text": (
                f"Turn 0 spikes on every chart while models scan the workspace. gpt-5.5 on terminus-2 still "
                f"has the tallest opening bar ({term[gpt]['turn0']} cohort actions) from heavy turn-0 bash "
                f"batching; Codex ({native[gpt]['turn0']}) and Claude Code / Gemini CLI (~{native[opus]['turn0']} / "
                f"{native[gem]['turn0']}) spread the same exploration across more steps with thinner turn-0 bars. "
                f"Turn 0 stays read-heavy everywhere, but gemini mixes in more write/execute on the first step."
            ),
        },
        {
            "label": "Early vs late pacing",
            "text": (
                f"gpt-5.5 front-loads hardest on terminus-2 (half of actions by turn {term[gpt]['half']}, "
                f"only ~{term[gpt]['late']:.0f}% in turns 20–49). On Codex the same model spreads work "
                f"(half-turn {native[gpt]['half']}; ~{native[gpt]['late']:.0f}% late). Claude and gemini "
                f"follow the same pattern: terminus-2 concentrates earlier (opus half-turn {term[opus]['half']}, "
                f"gemini {term[gem]['half']}); native runs stay active longer (Claude Code {native[opus]['half']}, "
                f"Gemini CLI {native[gem]['half']})."
            ),
        },
        {
            "label": "Steps and batching",
            "text": (
                f"Even with shell splitting, terminus-2 packs more actions into fewer steps — gpt median "
                f"{step_term[gpt]['median_steps']:.0f} tool-bearing steps but ~{step_term[gpt]['median_calls_per_step']:.1f} "
                f"classified actions/step. Native harnesses take more steps (~{step_native[gpt]['median_steps']:.0f} for gpt) "
                f"with ~1 classified action per tool call (~{step_native[gpt]['median_calls_per_step']:.1f} for gpt Codex), "
                f"so per-turn bars are thinner but trials run longer."
            ),
        },
        {
            "label": "terminus-2 vs native",
            "text": (
                f"Row 1 is a controlled interface (bash only); row 2 is each model's purpose-built agent. "
                f"On terminus-2, action mixes diverge more — Read spans {term_read_lo:.0f}–{term_read_hi:.0f}% "
                f"(gpt read-heavy at {term[gpt]['mix']['Read']:.0f}%, gemini write-heavy at {term[gem]['mix']['Write']:.0f}%) "
                f"because models express the same intents through different shell habits. Native harnesses "
                f"pull Read shares together ({native_read_lo:.0f}–{native_read_hi:.0f}%) via typed Read/Write/Exec "
                f"tools that canonize intent; gemini stays the most write-heavy ({native_write_lo:.0f}–"
                f"{native_write_hi:.0f}% Write) but opus and gpt move toward a shared read→edit→run loop. "
                f"Exception: gpt on Codex still stands out on Other (~{native[gpt]['mix']['Other']:.0f}%) from "
                f"plan/update meta-tools, not from task work."
            ),
        },
    ]


def y_max_for_charts(charts: list[dict], turn_cap: int = 50) -> int:
    peak = 0
    for ch in charts:
        for row in ch["byTurn"]:
            if row["turn"] >= turn_cap:
                continue
            peak = max(peak, sum(row.get(c, 0) for c in CATEGORIES))
    return peak or 1


def main() -> None:
    if not TRIALS_ROOT.is_dir():
        raise SystemExit(f"trials root missing: {TRIALS_ROOT}")

    common_tasks = discover_common_tasks_for_row(ALL_CHART_SPECS)
    if not common_tasks:
        raise SystemExit("no common tasks across all harness×model pairs")

    chart_rows_payload: list[dict] = []
    all_charts: list[dict] = []

    for row_id, specs in CHART_ROWS:
        row_charts: list[dict] = []
        for harness, harness_label, model_substr, display_model in specs:
            chart = aggregate_model(harness, harness_label, model_substr, display_model, common_tasks)
            if chart["nTrials"] != len(common_tasks):
                raise SystemExit(
                    f"expected {len(common_tasks)} trials for {display_model} · {harness_label}, "
                    f"got {chart['nTrials']}"
                )
            row_charts.append(chart)
            print(
                f"  {display_model} · {harness_label}: {chart['nTrials']} tasks, {chart['maxTurn']} turns"
            )

        enrich_charts_with_action_mix(row_charts)
        chart_rows_payload.append(
            {
                "rowId": row_id,
                "commonTasks": len(common_tasks),
                "charts": row_charts,
            }
        )
        all_charts.extend(row_charts)

    insight_blocks = build_insight_blocks(common_tasks, all_charts)
    comparison_table = compute_comparison_table(common_tasks)
    payload = {
        "commonTasks": len(common_tasks),
        "yMax": y_max_for_charts(all_charts),
        "insightBlocks": insight_blocks,
        "comparisonTable": comparison_table,
        "chartRows": chart_rows_payload,
        "charts": all_charts,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {OUT_PATH} ({len(common_tasks)} paired tasks, yMax={payload['yMax']})")


if __name__ == "__main__":
    main()
