# Per-trajectory observations — full coverage (17 of 17 inspected)

Pathway codes used in the table:
- **P1** — Wrong fix location: patched `filterencoder.go::AddArray` instead of `filters.go::CookieFilter.Filter`.
- **P2** — Unverified import-cycle fear: defined a private duplicate type instead of importing `caddyhttp.LoggableStringArray`.
- **P3** — Wrong invariant guard: e.g. `if in.Type == zapcore.ArrayMarshalerType { ... }`. The verifier sets `Interface` only and leaves `Type=0`, so the guard is bypassed.
- **P4** — Reflection over reading source: built array handling via `reflect`, often returning a local custom type or `[]string`.
- **P5** — Task-framing failure: treated the user issue as a Q&A request, wrote zero code.
- **P6** — Other (right diagnosis & file, but wrong wrapper type, e.g. `zap.Strings(...)`).

## Summary table — all 17 trials

| Run | Stack | Outcome / Failure mode | Read marshalers? | Saw `LoggableStringArray`? | Edited filters.go? | Pathway |
|---|---|---|---|---|---|---|
| `bf255bef` | terminus-2 / opus-4-6 | ✅ PASS | yes | yes | yes (gold) | — |
| `9675167f` | terminus-2 / opus-4-6 | Mode B panic | yes | yes | yes (private type) | **P2** |
| `d1903250` | terminus-2 / opus-4-6 | Mode A | yes | yes | no — patched encoder | **P1** |
| `5e26ae41` | terminus-2 / gpt-5.4 | Mode A | yes (briefly) | yes (briefly) | no | **P5** |
| `75ae15b4` | terminus-2 / gpt-5.4 | Mode A | grep only | name in grep | no | **P5** |
| `ea88e8b2` | terminus-2 / gpt-5.4 | Mode A | grep only | name in grep | no | **P5** |
| `3356a5c2` | terminus-2 / gemini-3.1 | Mode A | yes | yes | yes (returns `zap.Strings`) | **P6** |
| `24d8e892` | terminus-2 / gemini-3.1 | Mode A | yes | yes | yes (private `stringArray` via reflect) | **P4** |
| `ad9b42fd` | terminus-2 / gemini-3.1 | Mode C panic | no | no | yes (returns `[]string` via reflect) | **P4** |
| `df2ff472` | gemini-cli / gemini-3.1 | Mode A | yes | yes | yes (own marshaler, guarded by `Type`) | **P3** |
| `31155be7` | gemini-cli / gemini-3.1 | Mode A | yes | yes | yes (private `loggableStringArray` via reflect) | **P4** (with P2 flavor) |
| `cae24d47` | gemini-cli / gemini-3.1 | Mode A | yes | yes | yes (5-filter generic helper, private `stringArray`) | **P4 / P6** |
| `f077f26f` | codex / gpt-5.4 | Mode A | curl from GitHub (saw exact gold patch!) | yes | no | **P5** |
| `b9eddbbf` | codex / gpt-5.4 | Mode A | curl from GitHub (found exact upstream fix) | yes | no | **P5** |
| `9966152a` | codex / gpt-5.4 | Mode A | no | no | no | **P5** |
| `56a868ea` | claude-code / opus-4-6 | Mode A | yes | yes | no — patched encoder | **P1** |
| `d357bf7a` | claude-code / opus-4-6 | Mode A | yes | yes | no — patched encoder + private type | **P1** (with P2 flavor) |

## Pathway distribution across all 17

| Pathway | Count | % | Stacks affected |
|---|---|---|---|
| ✅ Success | 1 | 5.9% | terminus-2/opus |
| **P1** wrong fix location (encoder, not filter) | **3** | 17.6% | claude-code/opus (×2), terminus-2/opus (×1) |
| **P2** unverified import-cycle fear (primary) | **1** | 5.9% | terminus-2/opus |
| **P3** wrong invariant guard | **1** | 5.9% | gemini-cli/gemini |
| **P4** reflection / wrong type | **4** | 23.5% | gemini-cli/gemini (×2), terminus-2/gemini (×2) |
| **P5** task-framing (no code) | **6** | 35.3% | codex/gpt-5.4 (×3), terminus-2/gpt-5.4 (×3) |
| **P6** wrong wrapper type | **1** | 5.9% | terminus-2/gemini |

P2 also appears as a **secondary** factor in 4 of the 5 P3/P4/P6 runs — almost every agent that switched to operating on `Interface` cited an import cycle they did not verify. Two agents (24d8e892 and 31155be7) explicitly checked `caddyhttp` does not import `logging` and *still* avoided the import.

## Striking stack-level patterns

**All 6 gpt-5.4 trials wrote no code (P5).** This is not noise — both codex and terminus-2 with gpt-5.4 consistently treated the verbatim GitHub issue ("Please advise. Running version: v2.5.2…") as a help-desk question. Two of them (`f077f26f`, `b9eddbbf`) literally retrieved the exact gold patch via `curl https://raw.githubusercontent.com/...` and didn't apply it. `9966152a` even produced a Caddyfile workaround for the user. This is a stack-wide miscategorisation.

**All 5 gemini-3.1-pro trials that wrote code avoided importing `caddyhttp`.** Three used `reflect` (P4), one guarded on `Type` (P3), one used `zap.Strings` (P6). They split the work but never used the named producer type. None succeeded.

**Both claude-code/opus trials chose the encoder layer, not the filter (P1).** Their dispatched Explore subagent reports led them to frame the bug as "filters can't see arrays — the encoder needs to unwrap." `d357bf7a` even defined `LoggableStringArray` privately inside the `logging` package while patching the encoder. Their architectural taste is consistent across runs and consistently wrong relative to the verifier's test surface.

**Of 3 terminus-2/opus runs: 1 success, 1 P1, 1 P2.** The success and the P2 run both did the producer-chain trace; the P2 run lost only because of an unverified import-cycle assumption. The P1 run (`d1903250`) chose the encoder fix like claude-code did.

## Per-trajectory key findings (the 7 deep dives kept; 10 new ones summarised)

### ✅ `bf255bef` — terminus-2 / opus-4-6 — **PASS**
Read `marshalers.go` AND `filterencoder.go:163` (`filter.Filter(zap.Array(key, marshaler))`). Verified no circular import via `grep -rn 'modules/logging' /testbed/modules/caddyhttp/`. One-shot patch matching gold byte-for-byte. Wrote a hand-test using `zap.Array("", caddyhttp.LoggableStringArray{...})` that mirrors the producer.

### ❌ `9675167f` — terminus-2 / opus-4-6 — **P2 (Mode B panic)**
*"But importing caddyhttp would create circular imports"* — never verified. Pivoted to a generic `zapcore.ArrayMarshaler` interface assertion with their own `loggableStringArray` (lowercase). The redaction logic was correct.

### ❌ `d1903250` — terminus-2 / opus-4-6 — **P1**
Patched `filterencoder.go::AddArray` with a `logArrayMarshalerWrapper` that intercepts `AppendString` and routes through `filter.Filter(zapcore.Field{Type: StringType, String: s})`. `CookieFilter.Filter` is unchanged. The verifier calls `Filter` directly with `Interface = LoggableStringArray{...}`, bypassing the encoder.

### ❌ `5e26ae41` — terminus-2 / gpt-5.4 — **P5**
Read marshalers.go briefly. Misdiagnosed as "v2.5.2 limitation, fixed in newer release — recommend upgrade." Called `mark_task_complete()` after 6 commands.

### ❌ `75ae15b4` — terminus-2 / gpt-5.4 — **P5**
Saw `marshalers.go` in grep, never opened it. Latched onto the `// Array elements do not get filtered` comment in `filterencoder.go::AddArray` and concluded this is an inherent limitation. No patch.

### ❌ `ea88e8b2` — terminus-2 / gpt-5.4 — **P5**
Same pattern: dismissed user's `>0` hint, called `mark_task_complete()` twice with zero edits in 11 messages.

### ❌ `3356a5c2` — terminus-2 / gemini-3.1 — **P6**
Right file, right diagnosis, but the agent's array branch returned `zap.Strings(in.Key, newCookies)` — i.e., zap's internal `stringArray`, not `caddyhttp.LoggableStringArray`. Hand-test passed. Verifier's type assertion fails.

### ❌ `24d8e892` — terminus-2 / gemini-3.1 — **P4**
Cited "circular dependency" without deep verification. Used `reflect.ValueOf(in.Interface)` + a local `stringArray` type. Two iterations to add a `default` case so the legacy String-based test still passes.

### ❌ `ad9b42fd` — terminus-2 / gemini-3.1 — **P4 (Mode C panic)**
Never opened marshalers.go. Reverse-engineered `zap.Any([]string{...})` instead, found unexported `zap.stringArray`, used `reflect`, wrote back a plain `[]string`. Round-trip self-test gave a false PASS.

### ❌ `df2ff472` — gemini-cli / gemini-3.1 — **P3**
Generalised to 5 filters with a `if in.Type == zapcore.ArrayMarshalerType` guard. Verifier test sets `Interface` only, leaves `Type=0`, guard is skipped. Their hand-rolled test that set `Type` manually didn't catch this.

### ❌ `31155be7` — gemini-cli / gemini-3.1 — **P4**
Read marshalers.go, saw `LoggableStringArray`, then explicitly verified `caddyhttp` doesn't import `logging` (B45–B48). Still chose `reflect` + a local `loggableStringArray`. The "fear of import cycle" persisted past empirical disconfirmation.

### ❌ `cae24d47` — gemini-cli / gemini-3.1 — **P4 / P6**
Routed 6 filters through a generic `mapStringField` helper using `stringArrayFilter` + local `stringArray`. Avoided `caddyhttp.LoggableStringArray` despite reading it. Generalisation went wider than needed.

### ❌ `f077f26f` — codex / gpt-5.4 — **P5**
Spent 76 turns curl-ing GitHub for `v2.5.2` and `v2.11.2` of filters.go, **retrieved the exact gold patch source** (`cookiesSlice, ok := in.Interface.(caddyhttp.LoggableStringArray)`), and produced a Markdown advisory telling the user to upgrade. Zero edits to `/testbed`.

### ❌ `b9eddbbf` — codex / gpt-5.4 — **P5**
Same pattern: cloned upstream, found commit `fe61209d` with the gold patch, recommended upgrade. No code.

### ❌ `9966152a` — codex / gpt-5.4 — **P5**
Diagnosed at the encoder level, declared it an architectural limitation in v2.5.2, and answered with a Caddyfile workaround using the `regexp` filter:
```caddyfile
request>headers>Cookie regexp "(^|;[ ]*)sessionid=[^;]*" "${1}sessionid=REDACTED"
```

### ❌ `56a868ea` — claude-code / opus-4-6 — **P1**
Explore subagent surfaced `LoggableStringArray`, but agent decided "the encoder needs to unwrap arrays for filters" → patched `filterencoder.go::AddArray`. Filter unchanged.

### ❌ `d357bf7a` — claude-code / opus-4-6 — **P1 (with P2 flavor)**
Same encoder-side fix as 56a868ea, plus defined a *package-local* `LoggableStringArray` to avoid importing `caddyhttp`. Doubly off-target.
