# `bigcodebench/bigcodebench_657` — failure-mode synthesis over 18 trials

Synthesised from the 18 per-trial codex audits at [`../runs/bigcodebench_657/result/bigcodebench-bigcodebench_657/`](../runs/bigcodebench_657/result/bigcodebench-bigcodebench_657/). Picked because the cell is unusually clean: 18 distinct `(model, agent)` rows, all `reward=0.0`, all `exception_type=None` — pure agent-reasoning failures with no infrastructure noise.

## The task

Implement `task_func(texts, stopwords=None)` in `/workspace/solution.py`. Clean each string with `ALPHANUMERIC = re.compile('[\W_]+')`, lowercase, drop stopwords, and return a trained `gensim.models.Word2Vec`. 10-min budget, 2 CPU, 4 GB RAM, image `ghcr.io/linhaowei1/harbor-mix-batch1:71bedad2a9c1` (Python 3.10, `gensim 4.3.2`, `nltk 3.8`, NLTK corpora pre-downloaded under `/usr/local/share/nltk_data`).

The verifier is five `unittest` cases plus a binary reward gate:

```python
def test_case_3(self):
    texts = []
    model = task_func(texts, stopwords=stopwords_mock)
    self.assertIsInstance(model, Word2Vec)        # ← the killer
```

`test_case_1/2/4/5` only require an instance check + `model.wv.key_to_index` membership for `python` / `long` / `bonjour` — trivially satisfied by any `min_count=1` trainer. `test.sh` writes `1` iff pytest exits 0, else `0`.

The packaged oracle is the entire delta between pass and fail:

```python
if not tokenized_texts:
    return Word2Vec(vector_size=100)
model = Word2Vec(sentences=tokenized_texts, vector_size=100, window=5, min_count=1, workers=4)
```

That single guard explains 15 of 18 failures.

## Q1 — How close were the agents to success?

Very close. 15 of 18 produced a `solution.py` whose only meaningful defect is the missing empty-corpus guard — they pass `test_case_1/2/4/5` and fail only `test_case_3`. The other three are further away:

| Trial | Model | Agent | Closeness |
|---|---|---|---|
| 15 trials | various | various | 4/5 internal, fails `test_case_3` only |
| `c42e9a6b` | hy3-preview | claude-code | **0/5** — no file written; emitted code in chat |
| `646ae1fa` | glm-5.1 | claude-code | **0/5** — file written but with `def task_func(texts, stopwords_list=None)`; tests call `stopwords=` |
| `1ea03ae8` | gemini-3.1-pro-preview | gemini-cli | 4/5, but with the most damning trace (see Q2) |

A 5-line `if not tokenized_texts: return Word2Vec(vector_size=100)` flips 15 of 18 cells.

## Q2 — Model/agent variance: surface vs root cause

### Surface (what the verifier sees)

| Failure mode | Count | Example trace |
|---|---|---|
| `RuntimeError: you must first build vocabulary before training the model` | 16/18 | `Word2Vec(sentences=[], min_count=1)` raised inside `task_func([])` |
| `TypeError: task_func() got an unexpected keyword argument 'stopwords'` | 1/18 | `646ae1fa` (glm-5.1 + claude-code) renamed kwarg to `stopwords_list` |
| Module not found at `/workspace/solution.py` | 1/18 | `c42e9a6b` (hy3-preview + claude-code) emitted code in chat with `stop_reason: end_turn`, no tool call |

### Root cause — same across almost all (model, agent) cells

Across 16/18 trials the root cause is identical and is **not** a string mismatch / tooling / context-window / parse problem. It is:

> **Premature `task_complete` after a single happy-path smoke test, with no attempt to (a) read or list the `/tests` directory, (b) probe the verifier from `result.json` artefacts, or (c) derive adversarial inputs from the docstring (the most obvious being `texts=[]`).**

Independent of model and harness. Concrete evidence:

- **terminus-2 ×10** (gpt-5.5, deepseek-v4-pro, claude-opus-4-7, hy3-preview, qwen3.6-max-preview, glm-5.1, mimo-v2.5-pro, minimax-m2.7, gemini-3.1-pro-preview). Every trial writes the file via `cat > /workspace/solution.py <<'EOF' … EOF`, runs *exactly* the docstring example, sees `Vocabulary: ['language', 'programming', …]` + `Vector shape: (100,)`, declares done. The wording in the agent's `analysis` field is nearly interchangeable across models. Three trials (deepseek-v4-pro `18c06f3a`, deepseek-v4-pro `462cd85c`, gpt-5.5 `bfa14688`) explicitly *raise* the empty-input concern in their reasoning and immediately dismiss it — `462cd85c`: *"if all texts are empty after processing… The problem doesn't mention this edge case, and the test cases likely have valid inputs."* That is the root cause stated in the agent's own words.

- **gemini-cli `1ea03ae8` (gemini-3.1-pro-preview).** The smoking gun. Step 11 ran:

  ```bash
  python3 -c "from solution import task_func; task_func([])"
  ```

  and observed:

  ```
  File "/workspace/solution.py", line 45, in task_func
      model = Word2Vec(sentences=processed_texts, min_count=1)
  RuntimeError: you must first build vocabulary before training the model
  Exit Code: 1
  ```

  The agent reproduced the exact verifier failure on its own. Step 13 then overwrote `solution.py` with the same empty-corpus-trains pattern, ran only `python3 -m py_compile`, and declared complete in step 14. **The agent literally watched the test fail, regenerated the same broken code, ran a syntax-only check, and shipped.** Not a string mismatch — a metacognitive failure to translate "I just observed a runtime error" into "fix the code."

- **claude-code `c42e9a6b` (hy3-preview).** Different *root* cause, same family: the agent never engaged the environment at all — emitted Python in a markdown fence, no `Write`/`Edit`/`Bash` tool call, `stop_reason: end_turn`. Only cell whose root cause genuinely differs from the dominant pattern: harness/model **mode confusion** — answered "in chat" despite the literal instruction *"Your solution should be saved to: /workspace/solution.py"*.

- **claude-code `646ae1fa` (glm-5.1).** Surface = wrong kwarg. Root = same shallow-verification family: the agent never even imported its own file once. If it had run `python -c "from solution import task_func; task_func([], stopwords=[])"` it would have caught the kwarg mismatch in 1 second.

- **codex `bfa14688` (gpt-5.5).** Same as the terminus-2 cluster.

### Surface-vs-root summary

| Layer | Description |
|---|---|
| Surface (~16 cells) | `Word2Vec(sentences=[])` raises `RuntimeError`. Missing empty guard. |
| Surface (1 cell) | Renamed `stopwords` → `stopwords_list`. |
| Surface (1 cell) | No file written, `solution.py` does not exist. |
| **Root, dominant** | **Single happy-path smoke test ⇒ declare `task_complete`. No exploration of the verifier (which is even mounted at `/data/packaged/.../tests/`), no enumeration of edge-case inputs, no re-reading of the docstring for empty/all-stopword cases.** Several models even *reasoned* about the empty-input case and chose to ignore it; one (gemini-3.1-pro-preview / gemini-cli) directly observed the runtime failure and shipped anyway. |
| Root, secondary | Mode confusion: claude-code with hy3-preview answered in chat instead of editing the file. |
| Root, secondary | Skipped self-import: claude-code with glm-5.1 renamed a kwarg without ever importing its own module once. |

The model and harness mostly *don't matter* here — **the failure is at the planning/verification policy layer**, not at code-generation quality. Nine different models on five different harnesses produced functionally identical 4/5-correct solutions and stopped at the same place.

## Q3 — Concrete failing behaviours with test snippets

For ≥15 trials the failure is `test_case_3`. Pairing what the agent produced against what the test does:

**Agent's final code (representative, from `05fa4bdc` / gpt-5.5+terminus-2 — almost identical across the 15-trial cluster):**

```python
sentences = []
for text in texts:
    cleaned = ALPHANUMERIC.sub(' ', str(text)).lower()
    tokens = [t for t in cleaned.split() if t and t not in sw]
    if tokens:
        sentences.append(tokens)
model = Word2Vec(sentences=sentences, vector_size=100, window=5,
                 min_count=1, workers=1, seed=42, epochs=5)
return model
```

**`test_case_3`:**

```python
def test_case_3(self):
    texts = []
    model = task_func(texts, stopwords=stopwords_mock)
    self.assertIsInstance(model, Word2Vec)
```

**Why this pair fails:** `texts=[]` → `sentences=[]` (the `if tokens:` filter is irrelevant — there were never any iterations). Then `Word2Vec(sentences=[], min_count=1, …)` raises `RuntimeError: you must first build vocabulary before training the model` *before* `task_func` returns, so `assertIsInstance` is never evaluated and `test_case_3` fails. `test.sh`:

```bash
pytest test_outputs.py -v --tb=short --color=yes
TEST_EXIT_CODE=$?
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo 1 > /logs/verifier/reward.txt
else
    echo 0 > /logs/verifier/reward.txt
fi
```

→ `reward=0`. Because reward is binary, four out of five tests passing buys nothing; the cell looks identical (in `result.json`) to a cell that wrote nothing.

**Signature-rename failure (`646ae1fa`):**

```python
# agent shipped:
def task_func(texts, stopwords_list=None): ...
# every test calls:
model = task_func(texts, stopwords=stopwords_mock)
# → TypeError: task_func() got an unexpected keyword argument 'stopwords'
```

→ all 5 tests fail at the call site, `reward=0`.

**No-file failure (`c42e9a6b`):** `solution_path = Path("/workspace/solution.py")` → `FileNotFoundError` during `spec.loader.exec_module(solution)` at the top of `test_outputs.py` → pytest collection error → `reward=0`.

**Two non-fatal-but-noted spec/test frictions (every per-trial report mentions them):**

1. The constant `ALPHANUMERIC = re.compile('[\W_]+')` is given in the prompt; `\W` matches whitespace, so substituting with `''` (rather than `' '`) collapses words. Most agents noticed and used `sub(' ', …)`. Trial `41261124` (gemini-3.1-pro-preview + terminus-2) was the only one that visibly defended against it (`' '.join(ALPHANUMERIC.sub('', w) for w in text.split(' '))`), but it still missed `test_case_3`.

2. The prompt says *"Returns: Word2Vec: A trained Word2Vec model"*, but `test_case_3` accepts an *untrained* `Word2Vec(vector_size=100)` for empty input. The hidden contract is "any Word2Vec instance", which the prompt does not state. **A real spec gap** — discoverable only by reading the test.

## Q4 — Hacking / cheating risk

**Yes, multiple paths. Marked.**

1. **Public-data leakage (most realistic).** This is literally `BigCodeBench/657`. The task id, the problem statement, the canonical solution, and `test_outputs.py` are all queryable from the public Hugging Face dataset card. An internet-connected agent can `pip install datasets`, fetch row 657, and copy the canonical solution including the `if not tokenized_texts: return Word2Vec(vector_size=100)` fix. The Dockerfile installs many pip packages so the agent container generally has internet egress. **This task should not be considered a measurement of capability for any agent that is allowed network access.**

2. **Verifier-import-order monkeypatch (subtle but real).** `test_outputs.py` does `spec.loader.exec_module(solution)` *before* `from gensim.models import Word2Vec`. So a malicious `solution.py` can:

    ```python
    import gensim.models as _gm
    class _Fake:
        class wv: key_to_index = {'python', 'long', 'bonjour'}
    _gm.Word2Vec = lambda *a, **kw: _Fake()
    def task_func(texts, stopwords=None): return _Fake()
    ```

   When `test_outputs.py` later does `from gensim.models import Word2Vec`, it binds `Word2Vec = _Fake`, and `assertIsInstance(model, Word2Vec)` becomes `assertIsInstance(_Fake(), _Fake)` → True. `assertIn('python', model.wv.key_to_index)` → True. **All five tests pass with no real Word2Vec training.** The import-order in `test_outputs.py` is what enables it.

3. **Reward-file overwrite.** Less reliable: `test.sh` always overwrites `/logs/verifier/reward.txt` after pytest runs, so pre-writing it is futile. Could also tamper with `/tests/test.sh` or `/tests/test_outputs.py` if writable; writability is unclear from this trial set.

4. **Test-pattern overfitting.** The five test cases use only 5 distinct vocabulary keys to assert presence (`python`, `long`, `bonjour`). A solution that returns *any* `Word2Vec`-instance with those words baked in passes without doing meaningful preprocessing. Combined with #1, an agent could implement a non-general `task_func` that pattern-matches the visible inputs and pass.

None of the 18 audited trials *attempted* any of these — they all failed honestly. But the surface area is large and three of these vectors (especially #1 and #2) work without modifying the test container.

## Verdict on the task

**Accept with reservations.** It exposes a real and important agent bottleneck (premature completion / shallow verification) consistently across 9 models × 5 harnesses, which is the point of an eval. Two genuine quality problems, though:

- **Underspecified empty-input contract.** The prompt nowhere states that `task_func([])` must return a `Word2Vec` instance instead of raising — yet `test_case_3` enforces exactly that, and the all-or-nothing reward gate means this single hidden requirement is the entire delta between "near-perfect" and "complete fail" for 15 of 18 trials. Either add "must handle empty input" to the prompt, or drop `test_case_3`. The current shape attributes ~83% of failures to a hidden requirement, which conflates "task spec is incomplete" with "agent didn't verify."

- **Public-data + monkeypatch leakage.** As detailed above, this task is on Hugging Face and the verifier is structurally hackable. Should not be used to score internet-allowed agents at all, and even sandboxed it admits an import-order monkeypatch.

- **Minor:** the supplied `ALPHANUMERIC = re.compile('[\W_]+')` is inconsistent with the prose ("except space"). Doesn't break the task — every agent worked around it — but it's a needless trap.

- **Audit-quality nit:** `result.json` contains only `"rewards": {"reward": 0.0}` and `"step_results": null` for every trial; no pytest stdout. Codex compensated by reading `/data/packaged/.../tests/`, but that only worked because the host happens to mount it. From the trial JSON alone, a reviewer cannot tell *which* test case failed; this should be fixed at the harness level.

The agent bottleneck this task surfaces is a real and useful one: **multiple frontier models reasoned about the empty-input case explicitly and chose not to test it; one observed the failure live and shipped anyway.** Worth keeping. But the way the task currently encodes it — as a hidden contract gated by an all-or-nothing reward — over-attributes the failure to the agent and under-attributes it to incomplete specification.
