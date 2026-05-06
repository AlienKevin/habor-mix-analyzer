# terminus-2 cross-trial synthesis

## 1. Recurring strengths

- Basic orchestration was reliable. Across trials, `terminus-2` created `/workspace/solution.py`, used ordinary shell/Python commands, and usually reached a runnable implementation. One extraction summarizes: "`terminus-2` handled the basic orchestration correctly: it inspected the empty workspace, wrote the required `/workspace/solution.py`, compiled it, and ran a smoke test" (bigcodebench-bigcodebench_657, 05fa4bdc-d03f-4955-9aca-63c71b4677ae). Another notes it "checked `/workspace`, Python, and installed packages" before writing the solution (bigcodebench-bigcodebench_657, 18c06f3a-b488-4991-923b-1ac429a93edd).

- It consistently solved the normal/example path. Several runs produced the expected non-empty Word2Vec vocabulary and 100-dimensional vectors: "Vector shape: (100,)" and "SUCCESS" (bigcodebench-bigcodebench_657, 32f09a35-8e81-49ff-9687-5849b031d49e), "Success! Vector shape: (100,)" (bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430), and "python vector shape: (100,)" (bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc).

- It usually recognized the small-corpus requirement enough to set `min_count=1`. The extraction for one run says it "used `min_count=1`, which covered the example-style singleton vocabulary" (bigcodebench-bigcodebench_657, 13dab2a7-5c1f-4e9f-a6a4-87b96ed92089); another says it "noticed that Gensim needed `min_count=1`" (bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a).

- Incidental command failures did not derail it. In one run, a shell quoting mistake caused `bash: !','Machine: event not found`, but it recovered by rerunning "with safer single-quoted Python" and then completed the smoke test (bigcodebench-bigcodebench_657, 13dab2a7-5c1f-4e9f-a6a4-87b96ed92089).

## 2. Recurring weaknesses / failure modes

- The dominant failure mode was narrow validation followed by early completion. This appears in nearly every extraction: "it ran exactly a happy-path smoke test and treated that as sufficient" (bigcodebench-bigcodebench_657, 05fa4bdc-d03f-4955-9aca-63c71b4677ae); "created `/workspace/solution.py`, ran one docstring-style smoke test, saw success, and marked the task complete" (bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430); "It stopped after confirming the prompt example" (bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a).

- It repeatedly missed the empty-corpus path. The common submitted shape was unconditional training after preprocessing: `Word2Vec(sentences=processed_texts, ...)` (bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc), `Word2Vec(sentences=cleaned, ...)` (bigcodebench-bigcodebench_657, 13dab2a7-5c1f-4e9f-a6a4-87b96ed92089), or `Word2Vec(tokenized_texts, min_count=1)` (bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a). The missed verifier behavior was summarized as: `texts = []`, then `self.assertIsInstance(model, Word2Vec)` (bigcodebench-bigcodebench_657, 32f09a35-8e81-49ff-9687-5849b031d49e; bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a).

- It often avoided test/verifier discovery entirely. One extraction says it "did not list the workspace, search for tests, inspect mounted verifier files, or run adversarial cases" (bigcodebench-bigcodebench_657, 32f09a35-8e81-49ff-9687-5849b031d49e). Another says it "did not inspect hidden/packaged tests or construct boundary tests" (bigcodebench-bigcodebench_657, 13dab2a7-5c1f-4e9f-a6a4-87b96ed92089).

- Even when it noticed the right edge case, it did not convert that thought into a test or guard. One run explicitly reasoned: "What if after cleaning there are no tokens? We skip but then Word2Vec might fail if no sentences. Could handle with a default model or raise? But likely not necessary" (bigcodebench-bigcodebench_657, 18c06f3a-b488-4991-923b-1ac429a93edd). That trial still submitted code that trained on an empty `tokenized_texts` list when all inputs were filtered.

- Completion confidence was poorly calibrated. One run "called `mark_task_complete`; when warned that grading would be final, it confirmed completion anyway" after only "one happy-path run" (bigcodebench-bigcodebench_657, 9925982c-f6e8-4344-9e22-2bde1c531ae3).

## 3. Common reasoning / verification patterns

- The standard loop was: implement from the prompt, run the provided/example-like non-empty input, inspect vocabulary or vector shape, then finish. Representative checks printed "Vocabulary: ['language', 'programming', 'favorite', 'python', ...]" and "Vector for python" (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729), or "Vocabulary: ['language', 'programming', 'favorite', 'python', ...]" and "Vector shape: (100,)" (bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a).

- Reasoning emphasized ordinary preprocessing and small-vocabulary survival, especially `min_count=1`, but did not stress external-library behavior on degenerate inputs. The audit phrasing is consistent: "got close on the normal path" but "did not test or guard the no-corpus path" (bigcodebench-bigcodebench_657, 05fa4bdc-d03f-4955-9aca-63c71b4677ae).

- Some runs performed light environment checks before implementation, such as probing imports with `python3 -c "import re, nltk, gensim; print('Libraries available')"` (bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc). These checks improved setup confidence but did not broaden behavioral coverage.

- The post-submit feedback loop was effectively absent. Multiple extractions report only binary reward, e.g. `"reward": 0.0` (bigcodebench-bigcodebench_657, 05fa4bdc-d03f-4955-9aca-63c71b4677ae), or `"step_results": null` and `"exception_info": null` (bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a; bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc). The agent therefore never entered an observed diagnose-and-repair loop.

## 4. Examples illustrating findings

- Strength, normal-path implementation: "converted stopwords to a set, cleaned/lowercased text, set `min_count=1`, and successfully ran the docstring-style example" (bigcodebench-bigcodebench_657, 32f09a35-8e81-49ff-9687-5849b031d49e).

- Strength, successful smoke output: "Model trained successfully" and "Vocabulary: ['language', 'programming', 'favorite', 'python', ...]" (bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc).

- Weakness, shallow validation: "The agent showed a shallow verification pattern: implement from the prompt, test the visible/example-like case, and finish" (bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430).

- Weakness, edge-case miss: "it never locally exercised `texts=[]`" (bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc).

- Weakness, ignored reasoning signal: "Could handle with a default model or raise? But likely not necessary" (bigcodebench-bigcodebench_657, 18c06f3a-b488-4991-923b-1ac429a93edd).

- Verification pattern, overreliance on visible output: "Model trained successfully!" and "Word vector for python: [-0.00824268 ...]" immediately preceded final completion in one extraction (bigcodebench-bigcodebench_657, 9925982c-f6e8-4344-9e22-2bde1c531ae3).

- Hacking posture: "No agent-specific cheating signal appears" (bigcodebench-bigcodebench_657, 05fa4bdc-d03f-4955-9aca-63c71b4677ae); "No hacking behavior is visible" (bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc).

## 5. OTHER dimension: insensitive vs visibly changed behavior

- Insensitive to the model dimension: the broad trajectory is stable across all nine trial IDs. Regardless of the other model-side variation, `terminus-2` reliably reached a plausible Word2Vec implementation, satisfied the non-empty example, used `min_count=1` in most described implementations, and failed to test `texts=[]`. The same conclusion appears as "premature validation" (bigcodebench-bigcodebench_657, 13dab2a7-5c1f-4e9f-a6a4-87b96ed92089), "narrow verification and early stopping" (bigcodebench-bigcodebench_657, 32f09a35-8e81-49ff-9687-5849b031d49e), and "premature confidence from a narrow example test" (bigcodebench-bigcodebench_657, 9925982c-f6e8-4344-9e22-2bde1c531ae3).

- Insensitive to the model dimension: overt cheating also remains absent. The extractions repeatedly say the agent did not inspect or manipulate verifier artifacts: "did not attempt to tamper with tests or reward files" (bigcodebench-bigcodebench_657, 07acf26d-9b08-40ea-896b-59651f6e6430), "did not attempt to manipulate verifier outputs" (bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a), and "no evidence of internet lookup, public-test copying, verifier probing, file overwrite tricks, or exit-code manipulation" (bigcodebench-bigcodebench_657, a17fabdc-d56d-4d99-80d9-58f6fedc0fcc).

- Visibly changed behavior across the other dimension: setup thoroughness varied. Some runs inspected the environment or imports ("checked `/workspace`, Python, and installed packages" in 18c06f3a-b488-4991-923b-1ac429a93edd; probed `re, nltk, gensim` in a17fabdc-d56d-4d99-80d9-58f6fedc0fcc), while another extraction says the agent "did not list the workspace, search for tests, inspect mounted verifier files" (bigcodebench-bigcodebench_657, 32f09a35-8e81-49ff-9687-5849b031d49e).

- Visibly changed behavior across the other dimension: reasoning depth around the edge case varied. One run explicitly identified the empty-sentences risk and dismissed it (bigcodebench-bigcodebench_657, 18c06f3a-b488-4991-923b-1ac429a93edd); another "even surfaced empty input as an edge case in its own reasoning" (bigcodebench-bigcodebench_657, 83cfe384-d09c-4f28-895e-0a4ef0a39729). Other runs show no such edge-case reasoning and only the smoke-test path.

- Visibly changed behavior across the other dimension: command robustness varied. Only one extraction reports a shell quoting/history-expansion failure, `bash: !','Machine: event not found`, followed by recovery (bigcodebench-bigcodebench_657, 13dab2a7-5c1f-4e9f-a6a4-87b96ed92089). Others report "No visible terminal error or timeout" (bigcodebench-bigcodebench_657, 41261124-a1d7-4ea1-b184-9a173add2d8a) or "No tool call crashed" (bigcodebench-bigcodebench_657, 05fa4bdc-d03f-4955-9aca-63c71b4677ae).

## 6. Open questions / not visible from these extractions alone

- The extractions do not name the OTHER-dimension models, so behavioral variation can be described by trial ID but not attributed to specific model identities.

- The full transcripts and final `solution.py` files are not all present; many implementation details are available only as snippets or extraction summaries.

- Hidden verifier stdout/tracebacks are mostly absent. The repeated `reward: 0.0` establishes failure, but not the complete hidden-test set or whether additional cases beyond empty input failed.

- It is unclear whether the shallow verification pattern is specific to this task, this harness configuration, or `terminus-2` more generally across unrelated tasks.

- Because the inputs are already agent-specific extractions, any model-side prompting, deliberation style, or non-agent context filtered out by the earlier codex sessions is not directly auditable here.
