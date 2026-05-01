# Run outcomes for caddyserver__caddy-4943

Collection: `640e920a-aef3-4b7c-9487-69899ef19e9d`
Total trials in Docent: **17** (one apparently missing from the expected 18)
Successes: **1** (`bf255bef-2ea8-465e-8788-ed998572561b`, terminus-2 + claude-opus-4-6)

| run id | agent | model | reward | role |
|---|---|---|---|---|
| `bf255bef-2ea8-465e-8788-ed998572561b` | terminus-2 | claude-opus-4-6 | 1.0 | success |
| `9675167f-2d10-4dee-825d-347d707c0694` | terminus-2 | claude-opus-4-6 | 0.0 | failure |
| `d1903250-59ce-4439-8e70-6c4724938e40` | terminus-2 | claude-opus-4-6 | 0.0 | failure |
| `ea88e8b2-1751-4d8b-8061-e0609761032f` | terminus-2 | gpt-5.4 | 0.0 | failure |
| `5e26ae41-ae4b-4314-88d1-eb055e3d05de` | terminus-2 | gpt-5.4 | 0.0 | failure |
| `75ae15b4-8d49-43b6-9e2d-eaa3e7ed2dcd` | terminus-2 | gpt-5.4 | 0.0 | failure |
| `3356a5c2-7188-43ae-83c2-fdf13809c4a7` | terminus-2 | gemini-3.1-pro-preview | 0.0 | failure |
| `24d8e892-28fc-4684-b7a1-137fb4721a9f` | terminus-2 | gemini-3.1-pro-preview | 0.0 | failure |
| `ad9b42fd-cdab-491f-9928-fc8b1ab2bed1` | terminus-2 | gemini-3.1-pro-preview | 0.0 | failure |
| `df2ff472-b841-4dd3-bd89-2f349b6b23b5` | gemini-cli | gemini-3.1-pro-preview | 0.0 | failure |
| `31155be7-d051-49c1-8bf1-a3369b058c37` | gemini-cli | gemini-3.1-pro-preview | 0.0 | failure |
| `cae24d47-6efa-4a68-9ca7-6f70f540f4b6` | gemini-cli | gemini-3.1-pro-preview | 0.0 | failure |
| `f077f26f-640b-432f-9fea-a47fd3aec4eb` | codex | gpt-5.4 | 0.0 | failure |
| `b9eddbbf-7573-4b38-9435-1a551e046ee7` | codex | gpt-5.4 | 0.0 | failure |
| `9966152a-ab35-4698-8762-5dde036e8893` | codex | gpt-5.4 | 0.0 | failure |
| `56a868ea-401a-4a51-b612-47bdae4f183b` | claude-code | claude-opus-4-6 | 0.0 | failure |
| `d357bf7a-8ebf-4f37-a77b-30a0314c4295` | claude-code | claude-opus-4-6 | 0.0 | failure |

Distribution by stack:
- terminus-2 / claude-opus-4-6: 1 success / 3 trials  (33%)
- terminus-2 / gpt-5.4: 0 / 3
- terminus-2 / gemini-3.1-pro-preview: 0 / 3
- gemini-cli / gemini-3.1-pro-preview: 0 / 3
- codex / gpt-5.4: 0 / 3
- claude-code / claude-opus-4-6: 0 / 2 (likely missing one trial)

No exception_type / timeout indicators — all 17 finished cleanly and only 1 produced a passing test.
