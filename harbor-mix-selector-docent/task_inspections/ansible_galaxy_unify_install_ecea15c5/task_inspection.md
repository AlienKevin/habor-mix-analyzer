# Task inspection — `ansible/ansible-ecea15c5… (galaxy unify install)`

> **TL;DR (revised after pushback).** The task's *behavior spec* (the PR description + 13 requirements) is solid and well-aligned with what was built. The closest agent run landed 162/168 tests with all user-visible behavior correct, including character-perfect warning text. **However, the verifier over-specifies: it accepts only one architectural choice among several that the spec leaves undetermined.** This is not pure agent carelessness — agents who write working code that matches the PR description can still fail because they pick a different (equally valid) internal-API shape than the gold-patch author. That makes the task **partially broken in its test contract**, not its instructions. The behavior is solvable; landing 168/168 reliably is not, because part of the verifier asks the agent to read the gold author's mind. Two minimal fixes to the test contract — without changing what the task asks — would fully resolve this.

## Revision history

This document was revised after a stricter reading of "is this inferrable?" The first version called the gaps "weakly inferrable" via sibling-helper conventions; on closer examination several of the gaps are not inferrable at all — they require the agent to guess the gold author's implementation choice. Section 4 below now distinguishes "task-spec defect" from "agent-capability gap" more cleanly.

## Files in this inspection directory

| File | Purpose |
|---|---|
| `instruction.md` | Verbatim PR description + the 13-bullet requirements list the agent must satisfy |
| `gold_patch.diff` | Excerpt of `task.solve_sh`'s diff against `lib/ansible/cli/galaxy.py` (the load-bearing pieces) |
| `agent_d36c0f62_patch.md` | All 5 Edit() operations from the closest near-miss (162/168), with divergence table |
| `run_outcomes.md` | All 18 trial outcomes + histogram + the 6 recurring missing tests |
| `task_inspection.md` | This file — the synthesized analysis |

---

## 0. Task summary

**What it asks.** Implement the user-visible behavior of an Ansible PR that unifies `ansible-galaxy install -r requirements.yml` for roles + collections. The agent edits `lib/ansible/cli/galaxy.py` only. Test files are pre-prepared by the task author and frozen.

**How it's verified.** The generic SWE-Bench-Pro runner runs `bash /tests/run_script.sh`, parses output, and checks that `fail_to_pass ∪ pass_to_pass` (168 tests across `test/units/cli/test_galaxy.py` and `test/units/galaxy/test_collection.py`) all pass. Critically, the verifier runs `git checkout ecea15c508f0… -- <those test files>` **after** the agent finishes — so the agent never sees the gold tests during exploration.

**Trial setup.** 18 runs, 4 agents × 3 models (with some combinations skipped):
- claude-code × claude-opus-4-6 (3 runs)
- codex × gpt-5.4 (3 runs)
- gemini-cli × gemini-3.1-pro-preview (3 runs)
- terminus-2 × {claude-opus-4-6, gemini-3.1-pro-preview, gpt-5.4} (9 runs)

**Outcome.** 0/18 successes. See `run_outcomes.md` for the full histogram.

---

## 1. How close are agents to succeeding?

**Very close in the median, catastrophic in a quarter of trials.** The histogram tells two stories at once:

| Bucket | Count | Share | Interpretation |
|---|---|---|---|
| 162/168 | 7 | 39% | "Got everything that's described in the PR, missed the implementation-detail tests" |
| 161/168 | 4 | 22% | Same plus one extra miss |
| 157–145/168 | 2 | 11% | Larger but still recoverable |
| 0/168 | 4 | 22% | Patch broke the module, every test errors |
| Timeout | 1 | 6% | gemini-cli hit the wall clock |

The near-miss group converged on the **same 6 missing tests across 4 different agent stacks**, which is strong evidence that what's missing is not random "agent slop" — it's a specific contract the agents collectively can't recover. That same convergence is also evidence that the *behavior described in the PR* is reproducible: agents understood what to build and built it.

The catastrophic group is genuinely catastrophic. When a patched `galaxy.py` causes 168 tests including unrelated ones (e.g., `TestGalaxyInitAPB::test_apb_yml`, `test_invalid_collection_name_init`, `test_call_GalaxyCLI`) to all fail, that's a module-level import or attribute error at pytest-collection time — the patched module is incompatible with what the gold-checked-out test file imports or references.

So the narrow read of "how close": **39% of runs get to 96.4% of the test pass rate, but reliability is not there.** The gap from "near-miss with 6 missing tests" to "full pass" is *not* a small step — it requires either inferring an undocumented internal API contract (the dict-shape return) or producing the exact `install_collections` call shape the test asserts.

---

## 2. Cross-agent variance: surface reasons vs. root cause

### Surface reasons — what the agents *appear* to be doing wrong

Looking across the 7 near-miss runs and the agent-by-agent error footprints (from `run_outcomes.md`):

- **Private helper untouched (the dict-shape miss).** Almost every near-miss agent left `_require_one_of_collections_requirements` returning a flat list and worked around the unified-install requirement by inlining `_parse_requirements_file` at the call sites. The exact-call test on the private helper then fails. This is unanimous across claude-code, codex, gemini-cli, and terminus-2/claude.
- **Argparse `dest` left as `role_file`.** Same pattern — every near-miss agent kept the role-side `-r/--role-file` arg pointed at `dest='role_file'` and patched `post_process_args` (or similar) to fabricate a `requirements` attribute, instead of renaming the dest like gold does. This shows up as different `install_collections` `call_args` shapes vs. what the test asserts.
- **`install_collections` called with `allow_pre_release=False` as a kwarg** (in d36c0f62) instead of positionally as gold does. Tests that use `mock.call_args == call(args_tuple)` fail; tests that use `mock.call_args[0][N] == X` pass.
- **`roles_path` list-vs-tuple bug** caught in d36c0f62 only after a self-test; other near-misses likely have similar subtle path-comparison issues.

### Root cause — *why* the agents make these particular mistakes

The surface mistakes are not random. They share a single root cause:

> **Agents cannot iterate against the actual verifier tests.** The gold tests are checked out *after* the agent's window closes, so during the entire authoring phase the agent has only the pre-PR test file to test against. Every near-miss agent ran their own pytest locally and saw `107 passed` (claude-code in d36c0f62 explicitly logged this). Their feedback loop ended there. Anything the verifier-only tests assert that diverges from the pre-PR test file's patterns is invisible.

This root cause cascades into the surface symptoms in three specific ways:

1. **The dict-shape contract on `_require_one_of_collections_requirements` is invisible.** The agent reads the existing test file and sees `test_parse_requirements_with_roles_and_collections` asserting `_parse_requirements_file` returns `{'roles': [...], 'collections': [...]}`. They naturally extend this convention to call `_parse_requirements_file` directly when they need both — solving the user-visible problem but never touching `_require_one_of_collections_requirements`. There is no signal in their environment telling them to refactor *that specific* private helper.
2. **The argparse-rename trick is invisible.** The agent doesn't see any test that calls `cli.parse()` and asserts `context.CLIARGS['requirements']` for both subcommands using a single dest. Without that signal, "fabricate the missing attribute in `post_process_args`" is the local-minimum solution that satisfies their local test runs.
3. **The exact `install_collections` call shape is invisible.** The PR description specifies behavior, not implementation arguments. Without seeing the actual test, the agent has freedom to choose call shapes — and chooses one that passes their local tests.

So the surface symptoms ("wrong return shape", "wrong dest", "wrong kwarg style") all reduce to one root cause: **the verifier hides the test contract that determines which structurally-equivalent implementation is the right one.**

The catastrophic 0/168 cluster has its own root cause variant. From the partial trajectory we have for claude-code/9a1269ed, the agent locally saw `107 passed` after their patch — same as d36c0f62. But the verifier reports 0/168 with even basic CLI tests like `TestGalaxyInitAPB::test_apb_yml` failing. The most plausible explanation: the gold test file's module-level setup (imports, fixtures, parametrize fixtures) references a symbol the agent's patch removed/renamed, causing pytest collection-time `ImportError` that takes out the entire module. The agent's local test run didn't catch this because the *local* test file lacks that reference. Same root cause: hidden post-checkout state diverges from the agent's local environment.

### Variance by agent/model

The variance across agent stacks is smaller than I expected:

- **All four agents reach 162/168 on at least one trial.** Capability is not the bottleneck for landing the user-visible behavior — it's a pure information bottleneck.
- **terminus-2 has higher variance** (a 145, a 157, four 161s, plus one 162). This is the one stack that runs three different models, and it's where we see the biggest spread. terminus-2/gemini's 145 looks like a partial implementation that touches more than just `galaxy.py` or makes a coarser refactor; without reading every transcript I can't pin which.
- **The catastrophic 0/168 outcomes are evenly distributed** across all 4 agents — every stack produces this failure mode. That's consistent with the "module-level import incompatibility" theory: any agent that does enough refactor without coordinating with the gold test file can trigger it.

**Net read on capability vs. task.** The capability bottleneck in this benchmark is *not* "can the agent design a CLI refactor" — they all can. The capability bottleneck is **"can the agent anticipate the exact shape of tests it cannot see, given only the PR description and the existing test file as signal."** That is a real and interesting capability dimension to measure, but it's a different one than "can implement Ansible CLI refactors."

---

## 3. Concrete agent behavior on each failing test (with expected vs. produced)

Using d36c0f62 as the canonical near-miss, I have the full agent diff (see `agent_d36c0f62_patch.md`).

### 3a. `test_require_one_of_collections_requirements_with_requirements/with_collections`

**Expected (reconstructed from naming conventions and pre-PR test patterns):**

```python
def test_require_one_of_collections_requirements_with_requirements(monkeypatch):
    cli = GalaxyCLI(args=['ansible-galaxy', 'collection', 'install', '-r', 'reqs.yml'])
    cli.parse()
    monkeypatch.setattr(cli, '_parse_requirements_file', MagicMock(return_value={
        'collections': [('ns.coll', '*', None)],
        'roles': [GalaxyRole(...)],
    }))
    actual = cli._require_one_of_collections_requirements([], 'reqs.yml')
    assert actual['collections'] == [('ns.coll', '*', None)]
    assert len(actual['roles']) == 1
```

**Agent produced:** `_require_one_of_collections_requirements` was left unmodified — it still returns a flat list of `(name, version, source)` tuples (collections only). Result: `actual['collections']` raises `TypeError: tuple indices must be integers, not str`.

**Why agent missed it:** the pre-PR test file does not call `_require_one_of_collections_requirements` directly. The PR description does not mention this private helper. The agent reasonably routes around it.

### 3b. `test_install_implicit_role_with_collections[\ncollections:\n-...]`

**Expected (reconstructed):**

```python
@pytest.mark.parametrize('requirements_file', ['''
collections:
- ns.coll1
roles:
- src: r1
'''], indirect=True)
def test_install_implicit_role_with_collections(requirements_file, monkeypatch):
    mock_install_collections = MagicMock()
    mock_role_install = MagicMock(return_value=True)
    monkeypatch.setattr(ansible.cli.galaxy, 'install_collections', mock_install_collections)
    monkeypatch.setattr(GalaxyRole, 'install', mock_role_install)
    GalaxyCLI(args=['ansible-galaxy', 'install', '-r', requirements_file]).run()

    assert mock_role_install.call_count == 1
    assert mock_install_collections.call_count == 1
    args, kwargs = mock_install_collections.call_args
    assert args[0] == [('ns.coll1', '*', None)]
    assert args[1] == os.path.expanduser('~/.ansible/collections/ansible_collections')
```

**Agent produced** (from d36c0f62, the `_execute_install_role` install-collections path):

```python
install_collections(collections_left, output_path, self.api_servers,
                    (not ignore_certs), ignore_errors,
                    no_deps, force, force_deps, allow_pre_release=False)
```

**Why it fails:** plausible mismatches are (a) `allow_pre_release=False` as kwarg vs. positional, (b) `output_path = C.COLLECTIONS_PATHS[0]` resolving differently than gold's path through `_execute_install_collection` defaults, (c) the absence of any path-validation warning the test asserts.

### 3c. `test_install_explicit_role_with_collections[\ncollections:\n-...]`

For `ansible-galaxy role install -r reqs.yml` (explicit role, default path, YAML has both):

**Expected behavior:** display a `display.display(...)` message about collections being ignored, install only roles. Test asserts `mock_install_collections.call_count == 0`, `mock_warning.call_count == 0` (or a specific value that excludes the `display.display`).

**Agent produced (d36c0f62):**

```python
if collections_left:
    if self._implicit_role:
        ...
    else:
        if custom_roles_path:
            display.vvv(...)
        else:
            display.display("The requirements file '%s' contains collections which will be ignored. ..."
                            % role_file)
```

The `display.display` call matches gold. The text matches the PR description verbatim. The likely failure point: the role install loop calls `display.warning("Meta file %s is empty. Skipping dependencies." % role.path)` for the test's mocked role object, which inflates `mock_warning.call_count` above what the test expects.

### 3d. `test_install_role_with_collections_and_path[\ncollections:\n-...]`

For `ansible-galaxy install -r reqs.yml -p custom_path` (implicit + custom path):

**Agent produced:**

```python
custom_roles_path = context.CLIARGS['roles_path'] != tuple(C.DEFAULT_ROLES_PATH)
if collections_left:
    if self._implicit_role:
        if custom_roles_path:
            display.warning("The requirements file '%s' contains collections which will be ignored. ...")
```

The agent caught the list-vs-tuple comparison bug in their own self-test (Edit 5). But there are still edge cases where `roles_path` may resolve to a path-equal-but-tuple-different value, particularly under `tmp_path_factory`-based test fixtures. The most likely test assertion: `mock_install_collections.call_count == 0` (collections must NOT install with custom path) AND `mock_warning.call_count == 1` (the collections-ignored warning).

### 3e. `test_install_collection_with_roles[\ncollections:\n-...]`

For `ansible-galaxy collection install -r reqs.yml`:

**Agent produced:**

```python
requirements = self._parse_requirements_file(requirements_file, allow_old_format=False)
if requirements.get('roles'):
    display.display("The requirements file '%s' contains roles which will be ignored. ...")
requirements = requirements['collections']
```

Failure mode: most likely the `install_collections` call_args shape mismatch (kwarg vs. positional), or the existing `display.warning("The specified collections path ... is not part of the configured Ansible collections paths ...")` firing under the test fixture and inflating `mock_warning.call_count`.

---

## 4. Is this a broken task or an agent capability bottleneck?

### 4a. Inferrability check (strict version)

For each of the 6 missing tests, ask the strict question: **does the spec uniquely determine the right answer, or does the agent have to land on the same implementation choice as the gold author?**

| Test concern | Spec says what to build? | Spec says HOW to build it? | Multiple valid implementations? | Honest verdict |
|---|---|---|---|---|
| Dict-shape return of `_require_one_of_collections_requirements` | ✗ (helper never named in PR) | ✗ | **Yes — at least 4 valid architectures** (refactor helper / inline at call site / new sibling helper / bypass helper) | **Unguessable.** Agent must coincidentally pick the same architecture as gold author. |
| Exact warning text | ✓ (verbatim in PR examples) | ✓ | No | **Fully determined.** d36c0f62 matched it character-perfect. |
| `display.warning` vs `display.vvv` vs `display.display` channel | ✓ (PR #7 and #8 spell this out) | ✓ | No | **Fully determined.** d36c0f62 matched it. |
| Exact `install_collections` call shape (positional vs kwargs, output-path resolution) | ✗ | ✗ | Yes — `allow_pre_release` could be positional or kwarg; output path defaults can resolve via `~/.ansible/...` or `C.COLLECTIONS_PATHS[0]` | **Partially guessable.** Pre-PR `test_collection_install_with_names` shows positional style for the existing 9-arg call, which agents *could* mirror. But this is a signal the agent has to actively notice. |
| Module-level test-file import compatibility (catastrophic 0/168) | ✗ | ✗ | Yes — many ways to refactor without breaking the gold test's module-level imports | **Partially guessable.** Agent can read which symbols the existing test file imports and avoid breaking them; but they can't see what the *gold* test file imports. |

**Net count of failing tests:** of the 6, **2 are flatly unguessable** (the two helper-shape tests) and **4 are partially guessable but still depend on the agent picking the same call shape as gold.**

The two helper-shape tests are the clearest defect. The function being tested has "collections" right in its name, the PR description never mentions it, and at least four valid architectures satisfy the user-visible spec. There is no path from PR description → "you must refactor `_require_one_of_collections_requirements` specifically, and it must return a dict with these specific keys". Agents who land on a different valid architecture (B, C, or D in the table below) **lose two points without committing any error.**

**Four valid architectures for satisfying the unified-install spec:**

| Architecture | Description | Picked by |
|---|---|---|
| **A** | Refactor `_require_one_of_collections_requirements` to return `{'collections': ..., 'roles': ...}` | Gold |
| **B** | Leave the helper alone; call `_parse_requirements_file` directly at the new call sites | claude-code d36c0f62 |
| **C** | Add a sibling helper `_require_one_of_install_requirements` that returns the dict; leave the original | (none observed) |
| **D** | Bypass the wrapper entirely; `_parse_requirements_file` already raises on missing/empty | (none observed) |

All four match the PR description. Only A passes the verifier. **That is the defect.**

### 4b. Super-capable-being thought experiment (revised)

Could an agent with unbounded reading-comprehension and architectural-taste capability solve this from the current instructions? **No, not deterministically.** The instructions and environment do not contain the information needed to choose A over B/C/D. A super-capable agent could *guess* A more reliably than current agents (e.g., by recognizing that the function is the natural choke point for unified-requirements parsing), but they would still be guessing — there is no derivation from the spec that selects A.

This is the difference between "task is theoretically self-contained" and "task admits a plausible solution path." The former is what I claimed in the first draft; the latter is what's actually true.

A truly self-contained task would have one of these properties:
1. Tests assert only the behavior the spec describes (no internal-API tests on private helpers).
2. The spec mentions the helper by name and constrains its signature.
3. Tests accept multiple valid implementations of the same behavior.

This task has none of these. The PR description doesn't name the helper, the spec doesn't constrain its signature, and the tests assert exact-shape contracts that pin Architecture A.

### 4c. What current agents are lacking — corrected framing

For the 4 *partially-determined* tests (call-shape and module-import compatibility), there's a real capability gap: agents who notice subtle conventions in the existing test file (positional 9-arg `install_collections` calls; the symbols imported at module level) do better. claude-code in d36c0f62 partially exploited this and got 162/168.

For the 2 *fully-undetermined* tests (`test_require_one_of_collections_requirements_*`), there is **no agent capability that closes the gap**. The information isn't in the environment. The agent has to guess Architecture A. A more careful agent doesn't help. A frontier model doesn't help. Only luck or coincidence does.

So the corrected attribution is roughly:

| Failure source | Number of failing tests (out of 6) |
|---|---|
| Task spec under-determines internal API; verifier over-specifies (**task defect**) | 2 |
| Test shape requires conventions that are *visible* in the env but easy to miss (**capability gap, mitigable**) | 4 |
| Agent has all signals but fails to use them (**pure carelessness**) | 0 |

### 4d. Final verdict on the question

> **Is the agent failure because of the task itself or the agent capability bottleneck?**

**Both, in roughly a 1:2 ratio:**

- **2 of 6 failing tests are caused by the task itself** — specifically, by the verifier asserting an internal-API shape that the spec doesn't constrain. No amount of capability fixes this; it requires editing the test contract or the spec.
- **4 of 6 failing tests are caused by capability** — agents missing patterns visible in the existing test file or producing call shapes that don't match (despite the spec accepting them). Capability could close this gap; so could relaxing the test assertions.
- **0 of 6 are pure carelessness.** Every near-miss agent we inspected understood the PR description correctly and produced working code.

The catastrophic 0/168 cluster is a third category — **patch-test-file incompatibility at module load time** — and is plausibly fixable on either side (better agent caution about not removing publicly-named symbols, or better test-side resilience to refactors). I'd attribute this 50/50.

**The original `accept` verdict was too generous.** A more accurate verdict is: **`accept-with-fix-needed`.** The task asks the right question and provides clear instructions, but its verifier would silently mark perfectly correct implementations as wrong. The two minimal fixes proposed in §5 (drop the helper unit tests; relax the call-args assertions) preserve everything the spec actually specifies and remove everything it doesn't.

You were right to push back on my "agents could solve this with sufficient care" framing. With strict scrutiny: agents *cannot* deterministically solve this from the current spec + env alone. They can solve the *behavior* (and demonstrably do, in 7 runs out of 18). They cannot solve the *test contract*, because the test contract requires a specific architectural choice the spec never mentions.

---

## 5. Concrete fixes

I'll list 6 candidate fixes, then collapse to a recommendation. "Fix" here means improving the task's signal/noise — making capable agents pass while keeping incapable ones from gaming. **Not** dumbing the task down.

### Fix candidate 1: tighten the instruction with one sentence about the helper

Add one line to the PR description: "Note: the helper `_require_one_of_collections_requirements` should accept and return both roles and collections as a `{'collections': [...], 'roles': [...]}` dict, mirroring `_parse_requirements_file`."

- **Pro:** unblocks the 2 unit tests on the private helper. Surfaces an internal contract that's currently invisible.
- **Pro:** still requires the agent to do the actual refactor — not a freebie.
- **Con:** leaks an implementation detail into a behavioral spec. The PR description should arguably stay agnostic.
- **Predicted effect:** brings agents from 162/168 to 164/168.

### Fix candidate 2: drop the unit tests on the private helper

Remove `test_require_one_of_collections_requirements_with_requirements` and `..._with_collections` from `fail_to_pass`. Keep the behavioral install tests as the contract.

- **Pro:** aligns the verifier with what the PR description actually specifies (user-visible behavior).
- **Pro:** allows multiple structurally-equivalent implementations (the agent's d36c0f62 inlined-`_parse_requirements_file` approach is just as correct as gold's helper-refactor approach).
- **Con:** loses a real signal about whether the agent did the "clean" refactor. But this isn't really a behavioral signal, so the loss is small.
- **Predicted effect:** brings agents from 162/168 to 164/168 immediately, without changing what they're being asked to do.

### Fix candidate 3: relax `install_collections` call_args assertions

Change the 4 `test_install_*_with_collections` tests so they assert `mock_install_collections.call_count` and `mock_install_collections.call_args[0][0]` (the requirements list) rather than the full `call(...)` equality.

- **Pro:** accepts both positional and kwarg call styles.
- **Pro:** also fixes the `output_path` brittleness — agents that resolve `~/.ansible/collections/ansible_collections` differently still pass as long as the requirements list is right.
- **Con:** none of substance. This is just removing test brittleness.
- **Predicted effect:** brings agents from 162/168 to 168/168 in many runs.

### Fix candidate 4: provide the gold test file as a hidden helper script the agent can opt into

Ship a tool like `/tests/preview_assertions.py` that prints test names and high-level assertion descriptions (without revealing the YAML fixtures or the full test bodies). The agent can read it.

- **Pro:** preserves the "agent can't iterate against verifier tests" property but gives them a peek at *what* is being tested.
- **Con:** changes the benchmark methodology. SWE-Bench-Pro's whole premise is that the agent doesn't see the tests.
- **Con:** this is more of a benchmark redesign than a per-task fix.
- **Predicted effect:** large but task-by-task variable.

### Fix candidate 5: reduce parametrize-id ambiguity

The 4 `test_install_*` tests share a parametrize id that pytest truncates to `[\ncollections:\n-`. This makes log reading hard but doesn't cause failures. Cosmetic.

- **Pro:** improves debuggability of agent runs.
- **Con:** cosmetic only.

### Fix candidate 6: gate the catastrophic 0/168 cluster

Add a pre-flight check in `test_sh.sh`: before running pytest, do a `python -c "from ansible.cli.galaxy import GalaxyCLI"` to detect import-time errors and report them clearly. If pytest collection fails for a non-test reason, surface that to the verifier output instead of silently scoring 0/168.

- **Pro:** distinguishes "agent broke imports" from "agent's logic is wrong" in the score signal — both are still failures, but the noise is reduced.
- **Pro:** doesn't change the test contract.
- **Con:** none.
- **Predicted effect:** doesn't change pass rate but makes the 0/168 cluster diagnosable.

### Recommendation

**Apply Fix 2 + Fix 3.** Both target real verifier brittleness without changing what the task asks. Together they would lift the 7 near-miss runs from 162/168 to 168/168 and pull the 4 161/168 runs to 167/168 or higher. The catastrophic 0/168 runs are independent and would not be affected — those are agent-capability failures the task should still register.

Avoid Fix 1 (leaks implementation detail). Skip Fix 4 (out of scope for per-task adjustment). Fix 5 is cosmetic. Fix 6 is good hygiene for the framework but not a per-task issue.

After Fix 2 + Fix 3, the predicted post-fix pass rate would be **roughly 7–11 of 18 trials (39–61%)** — with the remaining failures concentrated in the 4 catastrophic cases plus terminus-2's high-variance runs. That's a reasonable spread for measuring agent capability on multi-file CLI refactors and would make this task a clear "solid medium-difficulty SWE-Bench-Pro task" rather than the current "0% pass, near-miss heavy" outlier.

---

## 6. Verdict (revised)

**Accept-with-fix-needed.** The task asks the right question with clear instructions, but its current verifier silently rejects multiple valid implementations of the spec. Specifically: 2 of the 6 failing tests pin a private-helper return-shape contract that the PR description never mentions and that admits at least 4 equally valid architectures; the test only accepts one of them.

This is a task-quality defect, not pure agent carelessness. Agents who write working code (matching all 13 PR-description requirements + character-perfect warning text + correct channel matrix) can still lose points because they picked Architecture B/C/D instead of Architecture A — with no signal in the environment to guide that choice.

**Accept conditional on:** apply Fix 2 (drop the 2 unit tests on `_require_one_of_collections_requirements`) and Fix 3 (relax `install_collections` `mock.call_args` assertions to call_count + first-arg shape). Together these would make the verifier accept any implementation that satisfies the user-visible spec, which is the property a well-designed task must have.

**Reject if not fixed:** if the unit-tests on the private helper stay, the task is asking agents to read the gold author's mind on an architectural choice. That's not a fair test of agent capability. The 7 near-miss runs at 162/168 are evidence — those agents understood what to build, built it correctly, and were marked wrong for picking a different valid architecture.

The 7-out-of-18 near-miss rate is a feature, not a bug, of the *behavior* part of the task — it shows current frontier agents can recover ~96% of the test signal. The 0% pass rate is the bug, and it's caused by the verifier, not the spec.

---

## Appendix — methodology and provenance

- **Trajectories inspected.** All 18 agent runs queried via DQL on collection `640e920a-aef3-4b7c-9487-69899ef19e9d`. Full message-level inspection done on `d36c0f62` (claude-code, 162/168) and `9a1269ed` (claude-code, 0/168). Trajectory dumps too large for direct context; offloaded to subagents that returned verbatim quotes. Earlier-stage tool results saved at:
  - `/home/shilin/.claude/projects/-home-shilin-T-Bench-habor-mix-analyzer-harbor-mix-selector-docent/1b764185-3859-45c9-aadd-9aa1007eb653/tool-results/mcp-plugin_docent_docent-get_agent_run_messages-1777614989939.txt` (d36c0f62 messages 3..25)
  - `/home/shilin/.claude/projects/-home-shilin-T-Bench-habor-mix-analyzer-harbor-mix-selector-docent/1b764185-3859-45c9-aadd-9aa1007eb653/tool-results/toolu_011BTbw4SmfEGJYrFvjhxJaY.txt` (d36c0f62 messages 25..55)
  - `/home/shilin/.claude/projects/-home-shilin-T-Bench-habor-mix-analyzer-harbor-mix-selector-docent/1b764185-3859-45c9-aadd-9aa1007eb653/tool-results/mcp-plugin_docent_docent-get_agent_run_messages-1777615433884.txt` (d36c0f62 messages 55..85)
- **Hidden tests not directly observable.** The 6 failing tests' bodies are not in the agent-visible test file. Their contents are reconstructed from (a) test names, (b) the parametrize-id prefix `[\ncollections:\n-`, (c) the gold patch's API contract, (d) conventions visible in pre-PR sibling tests.
- **Catastrophic 0/168 root cause is hypothesized** ("module-level import incompatibility") not directly proven. To prove it, one would need to reproduce the 4 catastrophic runs' patches against the gold-checked-out test file and watch pytest collection fail. Out of scope for this analysis.
