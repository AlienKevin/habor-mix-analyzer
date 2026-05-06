# hy3-preview model rollup: bigcodebench-bigcodebench_657

Sources:
- `(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`
- `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`

## 1. Recurring strengths

`hy3-preview` showed basic task comprehension and could produce a plausible Word2Vec-centered solution shape. In the stronger trial, it "wrote `/workspace/solution.py` with the requested `task_func` signature, cleaning/lowercasing, stopword filtering, and `Word2Vec(..., min_count=1)`" `(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`. In the weaker trial, it still emitted code in the right conceptual neighborhood:

```text
import re
import nltk
from gensim.models import Word2Vec
from nltk.corpus import stopwords
```

`(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

There was no evidence of adversarial or test-tampering behavior in either extraction. One audit says "No direct hacking behavior appeared" `(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`, while the other says "No hacking behavior appeared in this trial" `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

## 2. Recurring weaknesses / failure modes

The dominant recurring failure was poor completion discipline. The model stopped after insufficient evidence of correctness in both trials, but with different severity. In one run, "after one passing docstring-style smoke test, it marked the task complete" `(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`. In the other, it "treated an explicit workspace-edit task as a conversational coding prompt" and "did not write `/workspace/solution.py`" `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

Verification was shallow or absent. The first trial "did not call the packaged tests" and only ran:

```sh
python3 -c "... model = task_func(texts) ... vector = model.wv['python'] ..."
```

`(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`. The second trial was worse: "The model called no tools at all" and there was "no shell command, editor invocation, file creation, directory listing, import check, or test run" `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

The model also showed weak edge-case reasoning. The implemented trial committed to:

```python
model = Word2Vec(sentences=processed_texts, vector_size=100, window=5, min_count=1, workers=1)
return model
```

and missed that `texts = []` reaches `gensim.Word2Vec(sentences=[])`, producing "RuntimeError: you must first build vocabulary before training the model" `(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`. The non-submitting trial's proposed code had a self-checking bug: "`stopwords` shadows the imported `nltk.corpus.stopwords`, so `if stopwords is None:` would try to call `stopwords.words(...)` on `None`" `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

Both trials ended with total task failure:

```json
"reward": 0.0
```

`(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)` and `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

## 3. Common reasoning / verification patterns observed

The common pattern is that `hy3-preview` accepted a surface-level solution without proving it against the task harness. In the implemented run, it treated happy-path output as sufficient:

```text
Success! Vector shape: (100,)
Vocabulary: ['language', 'programming', 'favorite', 'python', 'great', 'learning', 'machine', 'world', 'hello']
```

`(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`.

In the non-implemented run, the reasoning pattern collapsed even earlier: "Every post-user step ended with `stop_reason: "end_turn"`" and "Observation was `none`, reinforcing that the model answered rather than orchestrating" `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

Across both, the model did not use verifier feedback to iterate. One trial skipped the verifier; the other never created a submission that the verifier could meaningfully exercise. The observable reasoning pattern is therefore propose-or-smoke-test, then stop.

## 4. Examples illustrating findings

Basic implementation competence:

```text
requested `task_func` signature, cleaning/lowercasing, stopword filtering, and `Word2Vec(..., min_count=1)`
```

`(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`.

Workspace/task-mode failure:

```text
It emitted a markdown Python code block for `task_func`, but did not write `/workspace/solution.py`
```

`(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

Under-testing:

```text
It only ran a happy-path inline command
```

`(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`.

No execution at all:

```text
no shell command, editor invocation, file creation, directory listing, import check, or test run
```

`(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

Missed edge case:

```text
The relevant hidden edge case was `texts = []`
```

`(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)`.

Buggy proposed code:

```text
`stopwords` shadows the imported `nltk.corpus.stopwords`
```

`(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

## 5. Sensitivity to the OTHER dimension

Appears insensitive to the agent dimension:
- Basic semantic direction stayed similar: both trials produced or proposed a Word2Vec solution using text cleaning, stopwords, and `gensim`.
- The non-adversarial profile was stable: neither extraction showed test tampering, verifier manipulation, or hacking.
- The weak verification tendency persisted: one trial used only a happy-path smoke test, and the other used no tools at all.

Visibly changed by the agent dimension:
- Tool/workspace orchestration changed sharply. One trial created `/workspace/solution.py` and ran an inline Python check; the other "called no tools at all" and stopped after chat-only output.
- Failure mode changed from behavioral bug to non-submission. The first trial had an actual implementation that failed an empty-input edge case; the second left "no submitted file" and therefore had no meaningful runtime behavior under the verifier.
- The stronger agent context appears to have induced at least minimal execution, while the weaker one allowed the model's conversational-answer mode to dominate. This is an inference from the contrast between "wrote `/workspace/solution.py`" `(bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430)` and "Observation was `none`" `(bigcodebench-bigcodebench_657, c42e9a6b-5dbb-4634-9da5-b70803c90882)`.

## 6. Open questions / not visible from these extractions alone

- The exact agent identities, scaffolding, and tool instructions are not visible, so agent-sensitivity can only be inferred from behavior.
- The full hidden test suite is not visible. The empty-input case is identified, but other failing cases may exist.
- The full submitted code for the implemented trial is only summarized and partially quoted.
- It is unclear whether `hy3-preview` would repair the solution if given verifier output, because neither trial shows a debug-and-iterate loop.
- It is unclear how much of the chat-only failure came from model preference versus agent affordances or prompt routing.
