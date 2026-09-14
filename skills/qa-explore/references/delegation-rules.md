# Delegation Rules

What is allowed to leave this context, and what never is. The pack routes bulk input/output
away from the session and keeps the QA reasoning in it. Read this before reaching for a whole
file: most large reads have a cheaper route that returns the same facts.

## Tiers

| Tier | What runs there | Use it for |
|---|---|---|
| **0 — deterministic code** | the `qualiow` CLI (`${CLAUDE_SKILL_DIR}/references/paths.md` resolves the binary) | anything with a fixed contract: knowledge digests, index rows, `stats.json` validation, the redaction scan, session listing and archival |
| **1 — cheap-model sub-agents** | not in this release — **arrives in 2.2.0** | bounded reads that need light judgement and return a structured digest |
| **2 — this session** | the model reading these rules | exploration, interaction, bug finding, every judgement below |

Tier 0 beats tier 1 whenever the answer is deterministic: a command costs no tokens and
cannot hallucinate a row.

## Never delegate

These stay in this session, always, whatever the tiering:

- **Severity and priority** — and the "when in doubt go LOWER" call
- **Business impact** — revenue, trust, regulatory, data, scale
- **Bug reports** — the decision that something *is* a bug, and every word of `bugs/BUG-NNN.md`
- **The charter** and the risk ranking (P0/P1/P2/P3) behind it
- **What's MISSING** — the negative-space question no extraction pass can ask
- **Verdicts** — `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `NOT-REACHABLE`, `UNVERIFIABLE`
- **The executive summary** and the recommendations
- **The reflection** — what worried you, what you did not test, what to do next

A delegate that returns any of these has exceeded its brief; discard that part of its answer
and make the call yourself.

## What a delegate must return

Bounded (say the maximum size in the request), structured (a table or a fixed heading set),
cited (`file:line`, a ref, or a probe command), and free of opinions — no "looks fine", no
"this is probably a bug", no severity. You then reason over its output; you never paste it
into a report unchanged.

## Thresholds

| Input | Ceiling | Route instead |
|---|---|---|
| A qualiow data file (manifest, release entry, learned patterns) | 300 lines | `qualiow kb digest`, `qualiow list knowledge --entry <id>`, or `Grep` |
| A raw accessibility snapshot | 300 lines | `snapshot --depth=3`, `snapshot <ref>` to zoom, `find "<text>"` for one label |
| Any other file | 300 lines | `Read` with `offset`/`limit` after a `Grep` for the heading you need |
| A branch diff | 25 files or 1,500 lines | `git diff --stat` first, then `git show <branch>:<path>` for the files that map to an AC |

Check before you read when you are unsure: `wc -l <file>`.

**Never `Read` `manifest.yml` or a knowledge release entry whole.** Use
`qualiow kb digest --for <explore|backend|mobile>` for the session's working set,
`qualiow list knowledge --entry <id>` for one entry in full, or `Grep` the release file for
the one heading you need.

## Overrides

- `QUALIOW_READ_MAX_LINES=<n>` — moves the 300-line ceiling for a project
- `QUALIOW_HOOKS=off` — disables the enforcement layer for a project

Both are read by the hook layer, so they take effect in 2.2.0; until then the thresholds above
are a discipline, not a block.
