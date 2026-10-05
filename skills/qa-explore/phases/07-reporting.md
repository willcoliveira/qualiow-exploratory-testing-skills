# Phase 7: Reflection & Reporting (4 min + up to 15 min verification)

Every command carries `-s=<sid>` (omitted here). The browser stays open until the evidence is captured; it is closed before the judge runs and its data is deleted in the last step.

**Verification mode** was resolved in setup: `judge` unless the run carried `--no-judge` or
the target sets `verification.mode: off`. With `judge` follow every section below. With
`triage-shadow` follow every section below and also step 1b. With `off` this phase is the
unverified flow:

- write each bug straight to `bugs/BUG-NNN.md` in the format under **Write Bug Drafts**, with
  no `**Verification:**` line and no `## Verification` section;
- skip **Verify Bugs** and **Finalize Bug Reports**; create no `verification/` directory and
  no `bugs/refuted/`;
- leave `## Refuted Findings` out of `phase-7-notes.md` and `coverage.verification` out of
  `stats.json`;
- append `[<timestamp>] [VERIFY] verification off (<--no-judge | target>) — bugs ship unverified`
  to `session-log.md`.

With `off` the reporting agent finds no `verification/` directory and assembles the report
without the `Verification` column or the refuted appendix.

## Stop Recording

**Explore only — area evidence first.** While the browser is still open, `Glob`
`output/sessions/<session-dir>/screenshots/A*-*.png` against the charter's risk ranking: every
area you will report `tested` or `partial` needs at least one `A<N>-<slug>.png` (phase 4). Take
any that is missing now; once the browser is closed it can no longer be taken, and an area
without one cannot be reported `tested` or `partial`.

```bash
playwright-cli video-chapter "Reporting"
playwright-cli video-stop
playwright-cli tracing-stop
```

### Trace analysis (Playwright 1.59+, optional)

`tracing-stop` writes a trace under `traces/` (or the path it prints). To inspect it from
the command line: `npx playwright trace open <trace>` then `npx playwright trace actions --errors-only`,
`npx playwright trace requests --failed`, `npx playwright trace console`, and `npx playwright trace close`
(check `npx playwright trace --help` for the exact subcommands of the installed version).
Copy the trace into `output/sessions/<session-dir>/traces/` (never the session root) if it is
evidence for a bug or an area.

### Annotated video for Critical / High bugs (optional)

The session recording from phase 2 already has chapters. For a polished reproduction of a
Critical or High bug, record a second clip with action callouts:

```bash
playwright-cli video-start output/sessions/<session-dir>/videos/BUG-NNN.webm
playwright-cli video-show-actions
# ...reproduce the bug...
playwright-cli video-hide-actions
playwright-cli video-stop
```

Or write a scripted "hero" reproduction with `page.screencast.start()` / `showChapter()` /
`showOverlay()` (Playwright 1.59) and run it with `playwright-cli run-code --filename=<script.js>`.
A screenshot remains sufficient for Medium / Low.

## Reflect Before Writing

1. **What was the biggest risk I found?** (not the most bugs; the biggest RISK)
2. **What would I tell the CEO in one sentence?**
3. **What did I NOT test that still worries me?**
4. **Which heuristic was most useful? Which was useless?**
5. **What should the next session focus on?**

## Write Bug Drafts

One file per candidate bug, `verification/drafts/BUG-NNN.md`, in exactly the format of
`${CLAUDE_SKILL_DIR}/references/output-contract.md` (the template
`<data>/templates/bug-report.md` is the same format with guidance) — everything a shipped bug
carries EXCEPT the `**Verification:**` line and the `## Verification` section, which the
verdict adds later:

- the confidentiality header as the **first two lines**, verbatim:

  ```
  > CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
  > and application details. Do not share outside your organization without review.
  ```

- then `# BUG-NNN: [Component] fails [Condition] causing [Impact]`
- `**Severity:**` (per `severity-guide.md`; when in doubt go lower), `**Priority:**`,
  `**Component:**`, `**Area:**` (explore only, see below), `**URL:**`,
  `**Environment:** Playwright CLI, Chromium, <viewport>`, `**Reproduction rate:**`
- `## Summary`, `## Expected Behavior`, `## Actual Behavior`, `## Steps to Reproduce`
- `## Business Impact` — MANDATORY; answer at least one of Revenue / Trust / Regulatory /
  Data / Scale, write "none identified" for the rest
- `## Evidence` — `Screenshot: screenshots/BUG-NNN.png` (take it now with
  `playwright-cli screenshot --filename=output/sessions/<session-dir>/screenshots/BUG-NNN.png`),
  console errors, network failures (`playwright-cli request <n>` output, redacted)
- `## Recommended Fix Priority`

**Explore only — `**Area:**`.** The charter ID of the area the bug was found in (`**Area:** A3`),
or `**Area:** none` when it belongs to no row. A bug found in an area you tested but never
ranked is a reason to append that row to the charter (and take its `A<N>-` screenshot while
the browser is still open), not to write `none`. A bug may not point at an area you will
report `not-tested`, `blocked` or `deferred`: if you found a bug there, you were in it, so it
is at least `partial`. The line stays out of the claim card.

Redact per `security-rules.md` before writing. Number from `BUG-001`; ids are final — a draft
the judge refutes keeps its number under `bugs/refuted/`, so a gap in `bugs/` is expected and
means exactly that. In judge mode nothing goes into `bugs/` yet.

## Verify Bugs (Second Opinion)

Judge mode only. Every candidate faces an adversarial audit BEFORE it ships. A separate `qa-bug-judge`
sub-agent — fresh context, strongest model, no knowledge of how the bug was found — tries to
REFUTE it. Only the survivors reach `bugs/`. This runs now, after exploration is complete,
never mid-session; it is the one bounded exception in
`${CLAUDE_SKILL_DIR}/references/delegation-rules.md`.

Zero drafts → append `[<timestamp>] [VERIFY] no candidate bugs — verification skipped` to
`session-log.md` and continue with the notes. No `verification/` directory exists then, so
skip `## Refuted Findings` and `coverage.verification` exactly as in off mode.

### 1. Claim cards

For each draft write `verification/claims/CLAIM-NNN.md` — the confidentiality header first,
then ONLY this:

```markdown
# CLAIM-NNN

**Title:** [Component] fails [Condition] causing [Impact]
**URL:** <exact URL>
**Claimed severity:** Critical | High | Medium | Low
**Environment:** Playwright CLI, Chromium, <viewport>
**Reproduction rate:** Always | Intermittent (~X%) | Once

## Expected Behavior
<verbatim from the draft>

## Actual Behavior
<verbatim from the draft>

## Steps to Reproduce
1. <exact step> — read-only | state-changing

## Evidence
- <absolute path of screenshots/BUG-NNN.png>
- Console / network excerpts: <verbatim, redacted, or "none">

## Safety
- Environment: production | staging | dev
- Live re-run allowed: yes | evidence-only — <reason>

## Auth
- Storage state: <absolute path of .auth/<target>.json, or "none"> — NEVER credentials
```

Excluded on purpose: Business Impact, Priority, Recommended Fix Priority, and anything from
`session-log.md`, the phase files or the charter. The judge must see the claim and the raw
evidence, nothing of your reasoning. The card carries no e-mail address, cookie value or
token — `qualiow session finalize` scans `verification/` for secrets like every other file.

### 1b. Advisory triage (only when `verification.mode` is `triage-shadow`)

For each card (files only — no browser is needed):

```bash
qualiow judge triage output/sessions/<session-dir>/verification/claims/CLAIM-NNN.md [--target <id>]
```

Pass `--target <id>` only when the session was started with one; without it the command reads
`qa/target.yml` like the session did. Write every claim card in its final form before this
step and do not edit a card afterwards. The command writes `verification/JEV-NNN.*` and/or
`LAYA-NNN.*` — the block and the exact request sent — and prints the blocks; note only the
file paths and the exit code now, and do not read the blocks until every verdict is in.
Append `[<timestamp>] [TRIAGE] CLAIM-NNN exit=<code> files=<STEM>-NNN` to `session-log.md`;
exit 2 (not enabled) or 3 (unavailable) is logged the same way and changes nothing. **Nothing
below changes because of this step**: every claim goes to the judge as written, in the same
order, with the same prompt and budget. Once the verdicts are recorded, read the blocks and
append one line per provider:
`[<timestamp>] [TRIAGE] CLAIM-NNN <provider> <predicted verdict> route=<ROUTE> P(refute)=<x>`.
The predicted verdict is a guess at the judge's, never a verdict —
`${CLAUDE_SKILL_DIR}/references/evidence-triage.md`.

### 2. Close the finder browser

```bash
playwright-cli close
```

(with `-s=<sid>`; do NOT `delete-data` yet — the storage state and the screenshots are still
evidence). The judge opens its own session; two browsers on one target and one storage state
would race each other.

### 3. Spawn the judge — one sub-agent per claim, sequentially

Highest claimed severity first. Invoke the `qa-bug-judge` sub-agent (`qualiow:qa-bug-judge`
under a plugin install) with exactly this prompt:

> Verify the claim in `<absolute path>/verification/claims/CLAIM-NNN.md`. Read ONLY that file
> and the evidence files it lists. Return your verdict block per your agent definition.

- **One spawn per claim — never batch.** A verdict on one claim must not anchor the next.
- **Sequential, not parallel** — the target and the storage state are shared resources.
- **Budget: about 5 minutes per claim, 15 minutes in total, on top of the 45-minute cap.**
  Verification never eats exploration time. Out of budget → the remaining drafts ship as
  `Unverified (not judged — budget)`, and each still gets a `verification/VERDICT-NNN.md`
  you write yourself with `VERDICT: UNVERIFIED (not judged — budget)`, so its
  `Full verdict:` link resolves.

### 4. Record the verdicts

Copy the returned fenced block VERBATIM — confidentiality header first, then the block — to
`verification/VERDICT-NNN.md`. Do not edit or summarise it. If the judge fails, times out or
returns no parseable block, write the file yourself with
`VERDICT: UNVERIFIED (judge unavailable: <reason>)`. **Fail open, flagged, never silent** —
the bug still ships, marked Unverified.

For every REFUTED verdict append its `FALSE_POSITIVE_PATTERN` line to
`verification/proposed-patterns.md` (header first, one bullet per pattern, tagged with the
bug id). NEVER write to `<data>/knowledge/learned-patterns.md` from a session — a human
reviews `proposed-patterns.md` and promotes what holds up by hand (a review step in
`/qa-explore-feedback` is planned, not shipped).

Append the tally to `session-log.md`:
`[<timestamp>] [VERIFY] 4 judged — 2 confirmed, 1 adjusted, 1 refuted, 0 unreproducible, 0 unverified`.
The `stats.json` counts are defined in `output-contract.md`.

## Finalize Bug Reports

Sort every draft by its verdict. The verdict is the judge's; the decision to ship, the final
severity, the business impact and the priority are yours:

- **CONFIRMED / CONFIRMED-ADJUSTED / UNVERIFIED / not judged** → `bugs/BUG-NNN.md`. Add
  `**Verification:** Verified` (or `Verified (severity adjusted from <X>)`, or
  `Unverified (<reason>)`) directly after `**Reproduction rate:**`, and a `## Verification`
  section after `## Recommended Fix Priority`: verdict with method and confidence, the judge's
  repro result in one line, the severity change if any, and
  `Full verdict: ../verification/VERDICT-NNN.md`. Accept an adjusted severity unless you can
  say why not; when you keep yours, write `Verified (severity kept at X; judge proposed Y)`
  and the reason.
- **Under `triage-shadow`**, after the verdict is in: in every shipped bug whose triage file
  exists, add `- Triage (advisory): <predicted verdict> · <ROUTE> · P(refuted)=<x> — ../verification/<STEM>-NNN.md`
  to `## Verification`. The `**Verification:**` line stays the judge's.
- **REFUTED / UNREPRODUCIBLE** → `bugs/refuted/BUG-NNN.md` with `**Verification:** Refuted`
  or `Unreproducible` and, instead of `## Verification`, a `## Refutation (Judge)` section
  holding the verdict block verbatim. These are excluded from `bugs_found`, the index rows and
  `## Bugs Found`; they appear only in `## Refuted Findings`. You may overrule a refutation
  you can disprove — ship it as `Verified (judge overruled: <reason>)` and say so in
  `## Verification`.

Leave `verification/drafts/` in place once every draft is sorted: it is a working directory,
header-checked and secret-scanned like the rest, and nothing reads it for the report. Every
file under `bugs/`, `bugs/refuted/` and `verification/` starts with the confidentiality header.

## Write phase-7-notes.md

Your judgement, in your own words, in `output/sessions/<session-dir>/phase-7-notes.md`. The
confidentiality header first, then exactly these sections — the report is assembled from
them, so a section you leave out is a section nobody can write for you:

- `## Executive Summary` — 3 sentences: what was tested, what was found, the biggest risk
- `## Coverage Map` — rows for `| Area | Risk | Status | Bugs | Notes |`
  (Status: tested / partial / not-tested / code-verified-only). Explore only: one row per
  charter area, the Area cell starting with its ID (`A3 Checkout`) and the Status the same as
  that area's `coverage.areas` entry (`blocked` and `deferred` included)
- `## Observations` — including what's MISSING and the data-integrity results
- `## Areas Not Tested` — each with its reason
- `## Recommendations` — for the next session
- `## Reflection` — the five answers above
- `## Refuted Findings` (judge mode only) — `| ID | Claimed Title | Claimed Severity | Verdict | Refutation |`,
  one row per file in `bugs/refuted/` with the judge's reason in one line, or the sentence
  "All candidate bugs survived verification."

## Session Stats

Write `output/sessions/<session-dir>/stats.json` exactly as `output-contract.md` defines it
(`session_id`, `kind: "explore"`, `target`, `date`, `duration_min`, `bugs_found`,
`severity_counts`, `pages_explored`, plus the optional `domain`, `started_at`,
`completed_at`, `phases_completed`, `total_phases: 8`, `coverage`, `evidence`,
`areas_not_tested`, `blocked_by`). In judge mode put the judge's tally under `coverage.verification` —
`{ "judged", "verified", "unverified", "refuted", "unreproducible", "budget_min" }` —
and count shipped bugs only in `bugs_found` and `severity_counts`. Under `triage-shadow` add
`coverage.verification.triage.<provider>` as `evidence-triage.md` defines it. The `## Session Stats` table in
the report is rendered from this file.

**Explore only — session contract 2.** Also write `"contract": 2`, `"continues"` (the prior
session directory name under `--continue`, otherwise `null`) and one `coverage.areas` entry
per row of the charter's risk ranking — no more, no fewer:

```json
"contract": 2,
"continues": null,
"coverage": {
  "areas": [
    { "id": "A1", "status": "tested", "evidence": ["screenshots/A1-login.png"] },
    { "id": "A2", "status": "partial", "evidence": ["screenshots/A2-transfer.png", "videos/session.webm"], "reason": "negative amounts only; scheduled transfers not reached" },
    { "id": "A3", "status": "deferred", "evidence": [], "reason": "not reached in the time box" }
  ]
}
```

- `status` is one of `tested` (every planned heuristic run), `partial` (visited, not every
  path), `blocked` (could not be reached — auth, environment, the read-only rule; say which),
  `not-tested` (in scope, decided against; say why) or `deferred` (not reached in the time box).
- `evidence` lists session-relative paths under `screenshots/`, `videos/`, `traces/`, `logs/`
  or `evidence/` — plain ASCII, no leading `/` or `~`, no `\` or `:`, never `snapshots/` or
  `.auth/`, each an existing, non-empty file, at most 20 per area. A `tested` or `partial` area
  cites at least one `A<N>-…` file from `screenshots/` or `evidence/`.
- `reason` is required for every status but `tested`: at most 160 characters, no URL, and no
  name, e-mail, account number or other personal data — the redaction list does not catch
  every kind.
- Never write `coverage_level`: `qualiow session level --write` does, below.

The schema is strict. The top-level keys are exactly: `session_id`, `kind`, `target`, `date`,
`duration_min`, `bugs_found`, `severity_counts`, `pages_explored`, `domain`, `started_at`,
`completed_at`, `phases_completed`, `total_phases`, `coverage`, `evidence`,
`areas_not_tested`, `blocked_by`, and, for a contract-2 session only, `contract`, `continues`
and the CLI-written `coverage_level`. Nothing else.

## Compute the Coverage Level (explore only)

Before the reporting agent runs — it copies the result, it does not compute it:

```bash
qualiow session level output/sessions/<session-dir> --write
```

It validates the session against contract 2 — the charter table, every `coverage.areas`
entry, every evidence path, every bug's `**Area:**` and `**Verification:**` line — and on
exit 1 prints one violation per line, each naming the area or bug and the fix. Fix what it
names and run it again. On exit 0 it prints the level and writes three things:
`evidence-level.md`, `backlog.md` (the rows not `tested`, rendered from `coverage.areas`) and
`stats.json` `coverage_level`. **Never write or edit any of the three by hand.** Change
`stats.json`, the charter or a bug file afterwards and the level is stale: run it again, or
finalize refuses the session.

The level — `unassessed`, `incomplete`, `qualified` or `complete`, overall and per risk tier —
is a computed coverage fact, never a ship probability or a release verdict, and the findings
line beside it is separate on purpose. What the session ships, what it recommends and how it
summarises the risk stay your judgement: cite the level in `## Executive Summary` or
`## Recommendations` in your own words if it helps (its "To raise this level" list is a good
start for the next session), never restate it as a verdict. `phase-7-notes.md` is not an
input to the level, so editing the notes afterwards does not make it stale.

## Assemble and Finalize

The bugs, the stats and the notes are yours; assembling them into the report is not. Invoke
the `qa-reporting-agent` sub-agent (`qualiow:qa-reporting-agent` under a plugin install) with
the session directory and `kind: explore`. It reads `charter.md`, `stats.json`, `bugs/*.md`,
the phase files in windows and `phase-7-notes.md`, writes `session-report.md` in the format
of `${CLAUDE_SKILL_DIR}/references/output-contract.md` — copying your Executive Summary,
Recommendations, Reflection and Refuted Findings verbatim, adding the `Verification`
column to `## Bugs Found` from each bug file, and copying the body of `evidence-level.md`
verbatim into `## Coverage Level` — and then runs `qualiow session finalize`, which
validates `stats.json` against the strict schema, checks the confidentiality header on every
artefact, scans the directory against the redaction list, re-checks a contract-2 session and
refuses it while anything is missing or the level is stale, appends the session row to
`output/sessions/INDEX.md` and one row per bug to `output/bugs/all-bugs.md`, records the
session metrics and sets `progress.json` to `complete`. It is idempotent.

Read its return (at most 8 lines). If it reports a missing notes section or a violation it
could not fix, fix that yourself and re-run the check:

```bash
qualiow session finalize output/sessions/<session-dir> --check
```

`--check` writes nothing and prints a numbered list of violations naming each file. A
violation that ends "re-run `qualiow session level <dir> --write`" means the level is missing
or stale: fix the cause, run that command, then finalize again. Resolve
the `qualiow` prefix per `${CLAUDE_SKILL_DIR}/references/paths.md`; if the CLI is unavailable,
write the index rows by hand in the column order defined there — and since no level can be
computed by hand, leave `contract`, `continues` and `coverage.areas` out of `stats.json` and
say in the notes that the session has no coverage level.

If sub-agents are unavailable, do the step yourself as in 2.1.0: write `session-report.md`
from the notes in the contract's format (with `## Coverage Level` copied from
`evidence-level.md`) and run `qualiow session finalize output/sessions/<session-dir>`.

## Close the Browser Session

Last, once every screenshot, trace and video is on disk and every verdict is recorded — the
finder session was closed before the judge ran; `close` again is harmless if it still is:

```bash
playwright-cli close
playwright-cli delete-data
```

(both with `-s=<sid>`; also close and `delete-data` any extra session such as `-s=<sid>-race`,
and any `-s=judge-<HHmm>-<NNN>` session a judge left open when it ran out of turns).
Append to `session-log.md`: `[<timestamp>] [PHASE] Reporting complete — <N> bugs, session closed`.
