# Run outcomes — 18 trials

| ID | Agent | Model | Total steps | Reward | Tests passed | Notes |
|---|---|---|---|---|---|---|
| `2032b64f` | claude-code | claude-opus-4-6 | 95 | 0.0 | 162/168 | near-miss |
| `9a1269ed` | claude-code | claude-opus-4-6 | 64 | 0.0 | **0/168** | catastrophic — patch broke module collection |
| `d36c0f62` | claude-code | claude-opus-4-6 | 80 | 0.0 | 162/168 | near-miss; full diff in `agent_d36c0f62_patch.md` |
| `5e6d8cdb` | codex | gpt-5.4 | 75 | 0.0 | 162/168 | near-miss |
| `81ca1968` | codex | gpt-5.4 | 57 | 0.0 | **0/168** | catastrophic |
| `e7a01cd8` | codex | gpt-5.4 | 71 | 0.0 | 162/168 | near-miss |
| `2269a593` | gemini-cli | gemini-3.1-pro-preview | 39 | 0.0 | 162/168 | timed out before agent finished, but verifier still ran |
| `31e6603a` | gemini-cli | gemini-3.1-pro-preview | 64 | 0.0 | **0/168** | catastrophic |
| `573fdc64` | gemini-cli | gemini-3.1-pro-preview | 39 | NULL | NULL | AgentTimeoutError, no test run |
| `1c1e53c2` | terminus-2 | claude-opus-4-6 | — | 0.0 | 161/168 | one extra missing test vs. near-miss baseline |
| `4fb0ab82` | terminus-2 | claude-opus-4-6 | — | 0.0 | 162/168 | near-miss |
| `95f825de` | terminus-2 | claude-opus-4-6 | — | 0.0 | **0/168** | catastrophic |
| `0fd72b52` | terminus-2 | gemini-3.1-pro-preview | — | 0.0 | 161/168 | |
| `83960ee8` | terminus-2 | gemini-3.1-pro-preview | — | 0.0 | 145/168 | bigger regression than 161s |
| `da9db161` | terminus-2 | gemini-3.1-pro-preview | — | 0.0 | 157/168 | |
| `512176fd` | terminus-2 | gpt-5.4 | — | 0.0 | 161/168 | |
| `7f065df6` | terminus-2 | gpt-5.4 | — | 0.0 | 162/168 | near-miss |
| `d1706c54` | terminus-2 | gpt-5.4 | — | 0.0 | 161/168 | |

## Histogram

| Bucket | Count | Agents present |
|---|---|---|
| 162/168 (near-miss) | 7 | all 4 |
| 161/168 | 4 | terminus-2 only |
| 157/168 | 1 | terminus-2/gemini |
| 145/168 | 1 | terminus-2/gemini |
| 0/168 (catastrophic) | 4 | all 4 |
| timed out (NULL) | 1 | gemini-cli |

## Recurring missing tests across the 7 near-miss runs

```
test/units/galaxy/test_collection.py::test_require_one_of_collections_requirements_with_requirements
test/units/galaxy/test_collection.py::test_require_one_of_collections_requirements_with_collections
test/units/cli/test_galaxy.py::test_install_implicit_role_with_collections[\ncollections:\n-...]
test/units/cli/test_galaxy.py::test_install_explicit_role_with_collections[\ncollections:\n-...]
test/units/cli/test_galaxy.py::test_install_role_with_collections_and_path[\ncollections:\n-...]
test/units/cli/test_galaxy.py::test_install_collection_with_roles[\ncollections:\n-...]
```

(Note the 4 `test_install_*` tests have the same parametrize-id prefix `[\ncollections:\n-` — they're the same parametrize set repeated across 4 test functions; the prefix is truncated by pytest's id formatter.)
