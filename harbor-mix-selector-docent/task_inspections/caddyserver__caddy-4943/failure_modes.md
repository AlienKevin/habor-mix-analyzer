# Test failure modes (extracted from `run.test_stdout`)

There are 3 distinct failure modes, not 1.

## Mode A — silent: filter returned empty (14 of 16 failures)

```
=== RUN   TestCookieFilter
    filters_test.go:61: cookies have not been filtered:
--- FAIL: TestCookieFilter (0.00s)
```

The error message after "cookies have not been filtered:" is **empty**. The test prints `out.String`, and `out.String == ""`.

Diagnosis: agent's filter still reads from `in.String`. The verifier-applied test feeds the data via `in.Interface = caddyhttp.LoggableStringArray{...}` and leaves `in.String == ""`. The filter therefore parses an empty string and writes back nothing.

Runs in this bucket: 56a868ea, d357bf7a, d1903250, ea88e8b2, 5e26ae41, 75ae15b4, df2ff472, 31155be7, cae24d47, f077f26f, b9eddbbf, 9966152a, 3356a5c2, 24d8e892.

## Mode B — type panic, agent invented its own array type (1 of 16)

`9675167f-2d10-4dee-825d-347d707c0694` (terminus-2 / claude-opus-4-6)

```
panic: interface conversion: interface {} is logging.loggableStringArray,
       not caddyhttp.LoggableStringArray
```

Diagnosis: agent realised the field was an `Interface` of an array type, **but defined a private `loggableStringArray` inside the `logging` package** instead of reusing the existing `caddyhttp.LoggableStringArray`. The verifier test casts via `out.Interface.(caddyhttp.LoggableStringArray)`, which panics on the wrong type.

## Mode C — type panic, agent used `[]string` (1 of 16)

`ad9b42fd-cdab-491f-9928-fc8b1ab2bed1` (terminus-2 / gemini-3.1-pro-preview)

```
panic: interface conversion: interface {} is []string,
       not caddyhttp.LoggableStringArray
```

Diagnosis: agent switched to operating on `in.Interface` and treated it as `[]string`. Returned `in.Interface = []string{...}`. The verifier test cast panics for the same reason as Mode B.

---

## What this tells us

- **Modes B and C are agents that were architecturally on the right path** — they understood that Cookie is logged as an array via `Interface`, not a string. They lost only because they didn't reuse the named producer type. That requires having read `modules/caddyhttp/marshalers.go` (where `LoggableStringArray` is defined and used to wrap the header).
- **Mode A is the dominant failure** — 14/16 agents didn't even update the input side of the filter. Their patches are no-ops or near-no-ops with respect to the verifier's input shape.
- **The successful run (bf255bef, terminus-2 / opus-4-6) uses `caddyhttp.LoggableStringArray` exactly.** This is the only path the verifier accepts.

The implication: the test pins one specific named type. The "fix" is a single 3-line change, but it requires:
1. Knowing the input arrives via `in.Interface`, not `in.String` (necessary for any of the 16 to even compile a useful patch).
2. Knowing the *exact* named type to assert against and to wrap the output in.

(2) is the mind-reading step. (1) can in principle be discovered from the codebase, but only if the agent explores the marshaling/producer side.
