# Delegation Rules

What is allowed to leave this context, and what never is. The pack routes bulk input/output
away from the session and keeps the QA reasoning in it. Read this before reaching for a whole
file: most large reads have a cheaper route that returns the same facts.

## Tiers

| Tier | What runs there | Use it for |
|---|---|---|
| **0 — deterministic code** | the `qualiow` CLI (`${CLAUDE_SKILL_DIR}/references/paths.md` resolves the binary) | anything with a fixed contract: knowledge digests, index rows, `stats.json` validation, the redaction scan, session listing and archival, the contract-2 coverage level, `evidence-level.md` and `backlog.md` (`qualiow session level`), and the `--continue` carry-forward (`qualiow session continue-check`) |
| **1 — cheap-model sub-agents** | `qa-reporting-agent` (sonnet), `qa-page-mapper-agent` (haiku), `qa-diff-indexer-agent` (haiku), `qa-gather-agent` (sonnet) | bounded reads that need light judgement and return a structured digest |
| **1b — adversarial verification** | `qa-bug-judge` (opus, effort high) | one claim card in, one verdict block out: a second opinion on a candidate bug from a context that never saw how it was found |
| **0b — decision model (opt-in, advisory)** | `qualiow judge triage`, only when the target sets `verification.mode: triage-shadow` | probabilities over one scrubbed claim card, recorded beside the verdict and never acted on (`${CLAUDE_SKILL_DIR}/references/evidence-triage.md`) |
| **2 — this session** | the model reading these rules | exploration, interaction, bug finding, every judgement below |

Tier 0 beats tier 1 whenever the answer is deterministic: a command costs no tokens and
cannot hallucinate a row.

## Delegates

Prefix every name with `qualiow:` under a plugin install (`qualiow:qa-reporting-agent`).

| Agent | Input | Returns | Used by |
|---|---|---|---|
| `qa-reporting-agent` | session directory + kind | `session-report.md` assembled from the notes, bugs and phase files, `qualiow session finalize` run, a summary of at most 8 lines | phase 7 of explore and mobile, phase 5 of backend, `/qa-explore-report` |
| `qa-page-mapper-agent` | a `snapshots/<page>.yml` over 300 lines + the page URL | forms with field refs, nav text → ref, interactive controls, visible error and empty-state text, hidden/disabled counts | phase 3 discovery |
| `qa-diff-indexer-agent` | repo, base, branch, the AC list | file → symbols → line ranges → candidate ACs, plus files matching no AC and ACs matching no file | phase 2 static review |
| `qa-gather-agent` | files, URLs or pasted text in the invocation | the context file under `output/context/`, gaps and assumptions marked | `/qa-gather` (always forks) |
| `qa-bug-judge` | one `verification/claims/CLAIM-NNN.md` (claim + evidence + safety block, nothing of the finder's reasoning) | a fenced verdict block: `CONFIRMED`, `CONFIRMED-ADJUSTED`, `REFUTED`, `UNREPRODUCIBLE` or `UNVERIFIED`, with method, confidence, repro result and reasoning | phase 7 of explore, one spawn per candidate bug, sequential; not at all when verification is `off` |

If sub-agents are unavailable, do the step yourself as in 2.1.0 — the thresholds below still
apply; read in windows instead.

## Never delegate

These stay in this session, always, whatever the tiering:

- **Severity and priority** — and the "when in doubt go LOWER" call
- **Business impact** — revenue, trust, regulatory, data, scale
- **Bug reports** — the decision that something *is* a bug, and every word of `bugs/BUG-NNN.md`
- **The charter** and the risk ranking (P0/P1/P2/P3) behind it
- **What's MISSING** — the negative-space question no extraction pass can ask
- **AC verdicts** — `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `NOT-REACHABLE`, `UNVERIFIABLE`
- **The executive summary** and the recommendations
- **The reflection** — what worried you, what you did not test, what to do next
- **The disposition** — what the session's findings mean for shipping. The coverage level is
  computed by the CLI and is a coverage fact, never a ship probability or a release verdict;
  reading it as one is a judgement, and it stays here
- **Each area's status and reason** in `coverage.areas` — the CLI checks them, it does not set
  them

A delegate that returns any of these has exceeded its brief; discard that part of its answer
and make the call yourself.

**The one bounded exception is the bug judge.** `qa-bug-judge` rules on exactly two things:
whether the claim in a card reproduces or is carried by its evidence, and — advisory only —
whether the claimed severity fits `severity-guide.md`. It runs on the strongest model in a
fresh context precisely because a second opinion from the context that found the bug is not a
second opinion. Everything else stays here: whether to ship (a REFUTED verdict may be
overruled with the reason written into `## Verification`), the final severity (write
`Verified (severity kept at X; judge proposed Y)` when you disagree), business impact,
priority, and every word of the shipped report.

**The triage is not a second exception.** Under `verification.mode: triage-shadow` the
`qualiow judge triage` command returns probabilities, and its predicted verdict is a guess at
what the judge will say — not a verdict. It does not replace the judge, gate it, order it or
shorten it: every claim is judged as if the triage had not run. Severity, impact, priority
and the ship decision never leave this session.

## What a delegate must return

Bounded (say the maximum size in the request), structured (a table or a fixed heading set),
cited (`file:line`, a ref, or a probe command), and free of opinions — no "looks fine", no
"this is probably a bug", no severity. You then reason over its output; you never paste it
into a report unchanged.

Tier-0 output is different: it is computed, not judged. The body of `evidence-level.md` is
copied into the report's `## Coverage Level` verbatim — by the reporting agent or by you —
precisely so that nobody recomputes or rewords it. Never edit `evidence-level.md`,
`backlog.md` or `stats.json` `coverage_level` by hand; change the inputs and run
`qualiow session level <dir> --write` again.

## Thresholds

| Input | Ceiling | Route instead |
|---|---|---|
| A qualiow data file (manifest, release entry, learned patterns) | 300 lines | `qualiow kb digest`, `qualiow list knowledge --entry <id>`, or `Grep` |
| A raw accessibility snapshot | 300 lines | `snapshot --depth=3`, `snapshot <ref>` to zoom, `find "<text>"` for one label |
| Any other file | 300 lines | `Read` with `offset`/`limit` after a `Grep` for the heading you need |
| A branch diff | 25 or more files, or 1,500 or more changed lines | `git diff --stat` first, then `git show <branch>:<path>` for the files that map to an AC |

Check before you read when you are unsure: `wc -l <file>`.

**Never `Read` `manifest.yml` or a knowledge release entry whole.** Use
`qualiow kb digest --for <explore|backend|mobile>` for the session's working set,
`qualiow list knowledge --entry <id>` for one entry in full, or `Grep` the release file for
the one heading you need.

## Overrides

- `QUALIOW_READ_MAX_LINES=<n>` — moves the 300-line ceiling for a project
- `QUALIOW_HOOKS=off` — disables the enforcement layer for a project

Both are read by the hook layer — `hooks/hooks.json` in the plugin, or `qualiow init --hooks`
in an npm project — and belong in the `env` block of the project's `.claude/settings.json`.

- `CLAUDE_CODE_SUBAGENT_MODEL` — overrides the model of every sub-agent, whatever each agent
  file pins — `qa-bug-judge` included: under that override the second opinion comes from the
  overriding model
- `model: inherit` in a project's own copy of an agent file — that one delegate runs on the
  session's model instead of the cheap one
