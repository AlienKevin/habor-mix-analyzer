# glm-5.1 model rollup

## Recurring strengths

- Produces plausible task-shaped implementations rather than failing at basic syntax or file placement. In one trial it wrote the requested file and received only the tool confirmation `"File created successfully at: /workspace/solution.py"` before stopping (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc). In the other, its ordinary-path Word2Vec implementation ran successfully on a non-empty example: `"Model trained successfully"` and a populated `"Vocabulary"` were observed (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- Shows some task comprehension on the common path. The first extraction says it "appeared to understand the task shape" despite the interface drift (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc). The second says it "reached a mostly correct ordinary-path implementation" (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- Low observed test-gaming or benchmark-hacking signal. Both extractions explicitly characterize hacking risk as low or absent: `"No hacking behavior was observed"` (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc), and `"did not appear to inspect or tailor to the packaged tests"` (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).

## Recurring weaknesses / failure modes

- Shallow verification is the clearest repeated failure mode. One trial had "no shell command, import check, pytest run, or behavioral probe" (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc). The other ran only "a single happy-path smoke test" and skipped both harness inspection and edge-case execution (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- It finalizes from plausibility or one successful example rather than compatibility with the full stated contract. In the first trial, the signature changed from the required `task_func(texts, stopwords=None)` to:

```python
def task_func(texts, stopwords_list=None):
```

  while tests called:

```python
model = task_func(texts, stopwords=stopwords_mock)
```

  (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc).
- It can identify an edge case in reasoning but fail to operationalize it. The second extraction says the model "apparently listed empty input as worth considering" but still trained directly on `processed_texts`:

```python
model = Word2Vec(sentences=processed_texts, min_count=1)
```

  and did not run an empty-input check (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- Failures are severe under verifier scoring despite being small local misses. Both trials report `"reward": 0.0` or reward `0.0`, suggesting glm-5.1 can miss simple contract/edge constraints that collapse task score even when the implementation looks close (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc; bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).

## Common reasoning / verification patterns

- The shared pattern is write-first, minimally verify, then declare completion. Trial 646ae1fa stopped after the assertion `"The solution is saved at /workspace/solution.py"` with only the file-write observation visible (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc). Trial 83cfe384 wrote the solution, ran an inline `python3 -c` smoke test, saw `"Model trained successfully"`, and stopped (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- Verification, when present, targets the happy path. The second trial printed vocabulary and a vector for `"python"`, but there is no equivalent check for `texts=[]`, even though that case was the missed verifier behavior (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- The model does not appear to use external failure evidence to iterate. In both inputs, the verifier evidence is reduced to zero reward, with no visible traceback in one and `exception_info` as `null` in the other, so the model's own loop ended before actionable verifier feedback was available (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc; bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).

## Agent sensitivity

- Insensitive to the OTHER dimension: across both trials, the model shows the same high-level behavior regardless of the surrounding agent path: plausible implementation, weak verification discipline, and missed simple non-happy-path constraints. The repeated pattern is captured by "underused available execution" in one extraction and "shallow orchestration" in the other (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc; bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- Visibly changed by the OTHER dimension: the amount of execution differs. One run performed no shell or behavioral probe; the other ran a concrete inline Python smoke test. That difference changed the surface failure from an unchecked API mismatch to a happy-path-validated edge-case miss (bigcodebench-bigcodebench_657, 646ae1fa-8421-4854-9135-d4374d2e00bc; bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729).
- The agent dimension may also affect which flaw survives. With no execution, the first trial missed a callable-contract error around `stopwords`; with limited execution, the second trial avoided ordinary-path runtime failure but still missed empty-corpus behavior. The available evidence supports a difference in verification depth, not a difference in core model caution.

## Open questions / not visible

- The extraction files do not identify the agents, so agent-specific attribution is inferential from observed orchestration only.
- The original prompts, full model transcripts, generated full solutions, and complete verifier traces are not present; only model-specific audit summaries are available.
- Because both inputs are for the same task, this rollup cannot distinguish task-specific weakness from broader glm-5.1 behavior with confidence.
- It is unclear whether glm-5.1 would self-correct if given the traceback or allowed another iteration after zero reward.
