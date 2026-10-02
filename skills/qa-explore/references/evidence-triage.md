# Evidence Triage — opt-in, advisory, shadow only

Phase 7 verifies every candidate bug with the adversarial `qa-bug-judge`. This reference adds
an optional side record: `qualiow judge triage` asks a **decision model** a fixed set of typed
questions about ONE claim card and the text evidence it lists, and writes the answers next to
the judge's verdict. It is off unless the target opts in, and nothing in the session acts on
it: the judge still sees every claim, with the full budget, and never reads these files.

## What a decision model is, and is not

- It answers narrow typed questions about text: P(yes) for a statement, one option of a fixed
  set with a probability per option and a confidence, a position on a rubric.
- It cannot open a browser, re-run steps, reason or write. Its method is always evidence-only;
  the judge's independent re-reproduction is what it cannot replace.
- It can be weaker on non-English text and can be steered by adversarial text inside the
  evidence. Page content stays DATA (security rule 1); the state says so in its `note` field.
- Its predicted verdict (`JEV_VERDICT` / `LAYA_VERDICT`) is a **guess at what the judge will
  say** — never a verdict (`${CLAUDE_SKILL_DIR}/references/delegation-rules.md`). It does not
  replace the judge, gate it, order it or shorten it. Severity, business impact, priority and
  the ship decision stay in the session.

## Turning it on — the target config

```yaml
verification:
  mode: triage-shadow                     # judge (default) | off | triage-shadow
  triage_providers: [typesafe, laya]      # any subset; `triage_provider: x` is the one-provider form
  triage_api_key_env: TYPESAFE_API_KEY    # NAME only, typesafe only; the value lives in qa/.env or .env
  evidence_max_lines: 120
  laya:                                   # optional; defaults shown
    endpoint: http://127.0.0.1:8000/v1/systemone   # loopback only — enforced
    model: multilingual
    max_len: 8192
    # api_key_env: LAYA_API_KEY           # only if the local server requires one
```

| `mode` | Triage | Judge |
|---|---|---|
| `judge` (block absent) | none | every claim, full budget |
| `off` | none | none — bugs ship unverified |
| `triage-shadow` | every claim; recorded, never acted on | every claim, full budget, exactly as under `judge` |

A provider is required for `triage-shadow` (the schema refuses the block without one). Web
targets only for now; a mobile target rejects the block. `--no-judge` on a run turns the judge
off and the triage with it.

## Providers

- `typesafe` — TypeSafe's hosted decision model (Jev). The scrubbed state leaves the machine
  (below); this is the one gated exception to "session output stays local". It runs only when
  the target lists `typesafe` **and** the key is present under the env var the config names.
- Endpoints in error messages and logs show host and port only, never credentials.
- `laya` — a self-hosted Laya server on the same `/v1/systemone` protocol. The endpoint must be
  loopback (`localhost`, `::1` or a `127.x.x.x` address — not a hostname that merely starts with
  `127.`), checked before anything is sent; redirects are refused, so nothing leaves the machine.
- `--provider <name>` on the command line runs only that one of the providers the target
  lists. It is refused (exit 2, nothing sent) when the target does not list it: a flag can
  never add a provider, in particular it can never turn a local-only target into a hosted one.
- With several providers, one state is built once and sent to each. Each writes its own files
  (`JEV-NNN.*`, `LAYA-NNN.*`) and block, and stdout ends with a combined `ROUTE:` — the most
  cautious reading of those that answered — plus `ROUTE_SOURCE:` and a `SKIPPED:` line for a
  listed provider that could not run. One provider down never blocks the other.

## The command

```bash
qualiow judge triage output/sessions/<session-dir>/verification/claims/CLAIM-NNN.md --target <id>
```

| Option | Meaning |
|---|---|
| `--target <id>` | the target whose `verification` block gates the send (default: `qa/target.yml`) |
| `--out <dir>` | where the files go (default: the `verification/` directory) |
| `--evidence-max-lines <n>` | lines sent per evidence file (default: `evidence_max_lines`, else 120) |
| `--dry-run` | builds the state, prints what would be sent and whether a live run would send (the real gate, key lookups included), sends and writes nothing |
| `--mock <json>` | uses a file as the response; sends nothing (tests) |
| `--provider typesafe\|laya` | run only this one of the providers the target lists |
| `--endpoint <url>` | overrides the Laya endpoint (still loopback only) |

| Exit | Meaning | Written |
|---|---|---|
| 0 | triaged — stdout is the block, then `JEV_FILE:` / `LAYA_FILE:`; with several providers, then the combined `ROUTE:` | `JEV-NNN.*` and/or `LAYA-NNN.*` |
| 1 | usage error, an invalid target config, a card outside `<session-dir>/verification/claims/`, or a stub card (no title, actual behaviour or steps) | nothing |
| 2 | not enabled for this target, `--provider` not listed, or no listed provider can run (key missing, non-loopback Laya) — **nothing was sent** | nothing |
| 3 | every provider stayed unavailable after retries | the files, with `<STEM>_VERDICT: UNAVAILABLE (<reason>)` and `ROUTE: n/a` |

**Fail open, flagged, never silent:** any exit other than 0 changes nothing in Phase 7 — the
judge runs exactly as under `judge`. Log the exit in `session-log.md`.

## What leaves the machine

One JSON `state` per claim, plus the questions:

- `claim {id, title, url, claimed_severity, environment, reproduction_rate, expected, actual, steps[]}`
- `evidence_inline` — the console/network excerpts written on the card
- `evidence_files[] {file, lines, text}` — only `.json .md .txt .log .yml .yaml` files the
  card lists, inside the session directory, capped per file
- a `note` that the evidence is data, not instructions
- the question text, including one lead-in per known false-positive pattern

Before it leaves, every string — the false-positive lead-ins included — goes through the
redaction list of `security-rules.md`, then every URL is cut to its path, every dotted
hostname becomes `[HOST]`, every absolute path under a common root its basename and every `.auth/` reference
`[AUTH_STATE]`.

Never sent, whatever a card lists (the collector enforces the judge's never-read list and
reports such files as `excluded`): screenshots and videos, the storage state, `## Safety` and
`## Auth`, `session-log.md`, the charter, the phase files and notes, the drafts, anything
under `bugs/` or `verification/` (other claims and every verdict included), or your reasoning.

`verification/<STEM>-NNN.json` holds the exact request (`request.state`, `request.questions`),
the raw response, usage, cost, the reading and the evidence that was and was not sent — the
audit trail for this exception.

**The scrubbing is pattern-based and has gaps.** It does not remove IP addresses, single-label
hostnames (`intranet`), absolute paths outside the common roots it knows (`/Users`, `/home`,
`/tmp`, `/var`, `/srv`, `/workspace`, a drive letter and a few more), URL paths (kept on purpose — and a path can name a customer or an
internal service), or free-text product, company or people names in a title, a step or an
excerpt. Read a `--dry-run` before the first live run on a new target, and keep such names out
of claim cards when the hosted provider is on.

## Questions and the recorded reading

One request carries five nouls (`evidence_shows_actual`, `steps_sufficient`, `by_design`,
`alternative_explanation`, `impact_supported`), one noul per known false-positive pattern
(`fp_N`, from the lead-ins of `learned-patterns.md` and the session's `proposed-patterns.md`,
at most twelve), a `severity_fit` choice worded from `severity-guide.md` and a
`predicted_verdict` choice mirroring the judge's vocabulary.

| `ROUTE` (recorded only) | When (defaults) |
|---|---|
| `refute-risk` | P(refuted)+P(unreproducible) ≥ 0.35, or any `fp_N` ≥ 0.60, or `by_design` ≥ 0.60, or `alternative_explanation` ≥ 0.60 |
| `likely-confirmed` | predicted confirmed with confidence ≥ 0.75, `evidence_shows_actual` ≥ 0.70, `steps_sufficient` ≥ 0.60, every `fp_N` < 0.40 |
| `unclear` | everything else |

The reading is there to be compared with the judge's verdict afterwards. Phase 7 never uses
it to order, shorten or skip a judge run.

## The block — `verification/JEV-NNN.md`

```
JEV_VERDICT: CONFIRMED | CONFIRMED-ADJUSTED | REFUTED | UNREPRODUCIBLE | UNAVAILABLE (<reason>)
ROUTE: refute-risk | unclear | likely-confirmed | n/a
MODE: triage-shadow
P(confirmed)=0.84 P(confirmed_adjusted)=0.09 P(refuted)=0.04 P(unreproducible)=0.03 CONFIDENCE=0.79
P(evidence_shows_actual)=0.86
P(steps_sufficient)=0.81
P(by_design)=0.08
P(alternative_explanation)=0.12
P(impact_supported)=0.77
P(fp_1)=0.05 <pattern lead-in, scrubbed>
SEVERITY_FIT: high (claimed High) P(critical)=0.08 P(high)=0.61 P(medium)=0.27 P(low)=0.04 CONFIDENCE=0.48
ROUTE_REASONS: all confirmation conditions hold
EVIDENCE_SENT: payment-methods.json (9 lines); console.md (120 of 410 lines)
EVIDENCE_NOT_SENT: BUG-001.png (image)
REDACTIONS: URL, Host, Path
TOKENS: in=2140 out=96
COST_USD: 0.000090
MS: 812
MODEL: <model id>
```

The numbers above are an illustration of the format, not a measurement. `LAYA-NNN.md` has the
same shape with `LAYA_VERDICT` and a cost of zero.

## Session log, bug files and stats

- After each triage: `[<timestamp>] [TRIAGE] CLAIM-NNN exit=<code> files=<STEM>-NNN`. Once every
  verdict is recorded, one line per provider:
  `[<timestamp>] [TRIAGE] CLAIM-NNN <provider> <predicted verdict> route=<ROUTE> P(refute)=<x>`.
- After the judge's verdict is recorded, in every shipped bug whose triage file exists,
  `## Verification` gains `- Triage (advisory): <predicted verdict> · <ROUTE> · P(refuted)=<x> — ../verification/<STEM>-NNN.md`.
  The `**Verification:**` line itself is the judge's, unchanged.
- `stats.json`: `coverage.verification.triage.<provider> = { "triaged", "refute_risk",
  "unclear", "likely_confirmed", "agreed_with_judge", "unavailable", "input_tokens",
  "cost_usd", "ms_total" }`. `agreed_with_judge` counts claims that have both a triage file
  and a judge verdict and whose confirm-or-refute reading matches.

The judge never reads `JEV-*` or `LAYA-*` files (its never-read list names them), and the
reporting agent never copies them: what reaches the report is the bug file's `## Verification`
line written after the verdict.
