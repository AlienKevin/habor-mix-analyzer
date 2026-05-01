# Run outcomes — `hle__66f63324376699e7c6894239`

| Agent run id | Agent | Model | Role | Reward | Exception | Steps | Cost ($) |
|---|---|---|---|---|---|---|---|
| 47c297e6 | claude-code | claude-opus-4-6 | failure | 0.0 | AgentTimeoutError | 5 | — |
| 687ca78f | claude-code | claude-opus-4-6 | failure | 0.0 | AgentTimeoutError | 5 | — |
| b3b8bcf5 | claude-code | claude-opus-4-6 | failure | 0.0 | AgentTimeoutError | 5 | — |
| 2f043ec4 | codex | gpt-5.4 | failure | 0.0 | AgentTimeoutError | 47 | — |
| 6b1a78a4 | codex | gpt-5.4 | failure | 0.0 | — | 29 | — |
| 88686a3f | codex | gpt-5.4 | failure | 0.0 | — | 40 | — |
| 2c407f25 | gemini-cli | gemini-3.1-pro-preview | failure | 0.0 | AgentTimeoutError | 18 | — |
| 92bb971e | gemini-cli | gemini-3.1-pro-preview | failure | 0.0 | AgentTimeoutError | 24 | — |
| cf2a2f76 | gemini-cli | gemini-3.1-pro-preview | failure | 0.0 | AgentTimeoutError | 14 | — |
| 51d1e6e4 | terminus-2 | claude-opus-4-6 | failure | 0.0 | AgentTimeoutError | — | 0.961 |
| 80215b77 | terminus-2 | claude-opus-4-6 | failure | 0.0 | AgentTimeoutError | — | 1.201 |
| ab9fbbdc | terminus-2 | claude-opus-4-6 | failure | 0.0 | AgentTimeoutError | — | 1.786 |
| **681a179b** | **terminus-2** | **gemini-3.1-pro-preview** | **success** | **1.0** | — | — | **0.967** |
| 184edd03 | terminus-2 | gemini-3.1-pro-preview | failure | 0.0 | AgentTimeoutError | — | 0.742 |
| 752c97a4 | terminus-2 | gemini-3.1-pro-preview | failure | 0.0 | — | — | 0.770 |
| 0175eea3 | terminus-2 | gpt-5.4 | failure | 0.0 | — | — | 0.079 |
| 7f1faacc | terminus-2 | gpt-5.4 | failure | 0.0 | — | — | 0.036 |
| ee98fe12 | terminus-2 | gpt-5.4 | failure | 0.0 | — | — | 0.029 |

**Result: 1 success / 18 trials (5.6%).** The single success is `681a179b` (terminus-2 / gemini-3.1-pro-preview).

⚠️ The Gemini auditor's report claims the success is `918a577b` — that ID does not appear in the 18 docent agent run URLs. The auditor either hallucinated the suffix or transposed digits; the actual successful run is `681a179b-e8fd-43cf-913a-571f535afaf8`.

## Per-stack breakdown

| Stack | Pass | Fail | Notes |
|---|---|---|---|
| terminus-2 / gemini-3.1-pro-preview | 1 | 2 | Holds the lone success |
| terminus-2 / claude-opus-4-6 | 0 | 3 | All 3 hit `AgentTimeoutError` (deep simulation/computation but ran out the 20-min budget) |
| terminus-2 / gpt-5.4 | 0 | 3 | All 3 ended with very low cost ($0.03–0.08) — short responses, no real exploration |
| claude-code / claude-opus-4-6 | 0 | 3 | All 3 timed out at exactly 5 steps (claude-code wrapper-level timeout — may be different from agent timeout) |
| codex / gpt-5.4 | 0 | 3 | 1 timed out at 47 steps; 2 finished with 29/40 steps but wrong answer |
| gemini-cli / gemini-3.1-pro-preview | 0 | 3 | All 3 hit `AgentTimeoutError` |

## Token / cost shape

The cost figures are highly informative for terminus-2:
- gemini wins: $0.74–0.97 (deep work).
- opus failures: $0.96–1.79 (deeper work — but always timed out).
- gpt-5.4 failures: $0.03–0.08 (10–60× lower than the others — strong "lazy" or "guess M=1" pattern).

This already suggests two distinct failure modes: **timeout while doing real work** vs. **terminate quickly with a shallow guess**.
