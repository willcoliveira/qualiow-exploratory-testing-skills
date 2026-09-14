# Phase 5: Reporting

## Step 1: The AC Traceability Matrix

`ac-matrix.md` is the headline deliverable. One row per AC:

| AC | Claim | Verdict | Evidence | Note |
|----|-------|---------|----------|------|

Verdicts:

| Verdict | Means |
|---------|-------|
| **PASS** | Verified with cited evidence |
| **PARTIAL** | The intent is met but something material deviates from the stated spec |
| **FAIL** | The AC as written is not true |
| **BLOCKED** | Not verifiable with available access — probe command attached |
| **NOT-REACHABLE** | This environment does not run the changed code path — a flag, a config value or an undeployed commit. Not a pass and not a failure |
| **UNVERIFIABLE** | The AC has no falsifier as written — a DoR defect |

Never leave a row at `PENDING`. If you did not check it, the verdict is `BLOCKED` and
you say why.

**Scope every verdict to an environment**, in the row itself: `PASS (dev)` and `PASS` are
different claims, and only one of them is honest when the change is behind a flag that is
off everywhere else. Where the ticket claims several environments, give the matrix a
column per environment rather than one merged verdict.

Lead the matrix with the fingerprint from `evidence/fingerprint.md` — build id or commit
per component, and which implementation each environment selected. A reader who does not
know what was running cannot use the rest of the table.

## Step 2: Bug Reports

One bug per file, `bugs/BUG-NNN.md`, in the format of
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md` (the template
`<data>/templates/bug-report.md` is the same format with guidance). The first two lines are
the confidentiality header, verbatim:

```
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.
```

then `# BUG-NNN: [Component] fails [Condition] causing [Impact]`, then `**Severity:**`,
`**Priority:**`, `**Component:**`, `**URL:** <endpoint, table, queue or resource ARN>`,
`**Environment:** <env kind + build/commit per component from the fingerprint>`,
`**Reproduction rate:**`, then `## Summary`, `## Expected Behavior`, `## Actual Behavior`,
`## Steps to Reproduce` (the probe command or trigger sequence), `## Business Impact`,
`## Evidence` (`- Screenshot:`, `- Video:`, `- Log: evidence/<file>` — the raw probe
output —, `- Console errors:`, `- Network failures:`) and `## Recommended Fix Priority`.

Backend findings need translation — nobody funds a fix for
"StreamViewType is NEW_AND_OLD_IMAGES".

Write the **Business Impact** in terms of consequence:
- What can go wrong for a customer, an operator, or an auditor?
- What does it cost to fix now versus after the dependent work ships?
- For audit, identity and privacy findings: what happens during an incident review or a
  regulatory request when this gap is discovered by someone else?

Give every reproducible finding a copy-pasteable reproduction — the probe command or
the trigger sequence — so the developer can confirm in under a minute.

Two shapes deserve their own reports rather than a line in someone else's:

- **A fix that cannot reach users.** If the changed path is off in the environments that
  matter, the ticket is not done, however green the dev environment is. Say what has to
  happen for it to reach production, and that the switch carries its own risk.
- **A discrepancy between the endpoint and the screen.** When the API is honest and the
  UI is not — an error rendered as an empty result, a value re-scaled, a field dropped —
  that is a client defect with its own owner, independent of the backend verdict.

**Collapse a crash family into one report.** Nine inputs that fail on the same unescaped
character are one bug with nine examples, not nine bugs.

## Step 2b: Carry-Overs

Defects you found that pre-date the change under test go in their own section:
**pre-existing, not caused by this change, tracked separately.** Mixing them into the
results inflates the apparent risk of shipping this change and buries the findings that
belong to it.

The reverse holds too — a defect that exists only because two changes met in this build
belongs to the report even though neither change owns it alone. Say which two.

## Step 3: DoD and DoR Gaps

Separate from bugs, list where the ticket's own Definition of Done is not met:
tests missing for an AC, documentation still describing the removed design,
monitoring absent for a new failure mode, manual work described in a runbook but never
executed and never evidenced.

List DoR gaps too — untestable ACs, missing acceptance criteria for behaviour the
change clearly has. These improve the next ticket rather than this one.

## Step 3b: Coverage, Honestly

Where the session covered a set of ACs rather than one, keep a coverage map with four
states — not two:

| State | Means |
|-------|-------|
| ✅ tested and passing | Observed, with evidence |
| ⚠️ partially tested | Exercised, but a named part of the AC was not |
| ❌ not tested | In scope, never reached |
| 🔍 code-verified only | Read in the source and believed. **This is `UNVERIFIABLE`, not a pass** |

Two distinctions worth being pedantic about, because both routinely produce a false pass:

- **Consistent is not causal.** A setting whose current value happens to match the output
  proves nothing until you change the setting and watch the output follow.
- **The data has to reach the case.** An AC about negative values cannot be verified
  against records that are all zero. If no reachable record exercises it, that AC is
  untested — find one, create one, or say plainly it is unproven and name what data would
  settle it.

Then name, in one sentence, **which untested item carries the most risk**. In a report full
of green rows that is the line the reader acts on.

## Step 3c: Write the Spec Where None Exists

Most of what an API probe finds has no acceptance criterion behind it, so there is nothing
to file the finding against and it turns into an argument instead of a fix. Produce an
expected-behaviour specification using `<data>/templates/expected-behaviour.md`: observed
against expected, grouped by cause rather than by case, with the decisions the fix forces
made explicit (reject or clamp; an error or an empty result; where validation lives), and
ranked by what real users can reach **today** rather than by how bad each one reads.

Close it with the same content in plain English, ready to paste into a ticket comment. That
section is what gets the work scheduled.

## Step 4: Session Notes

The matrix, the bugs, the spec and the DoD findings above are yours. So is the judgement that
goes into the report — but not the assembling of it. Write
`phase-7-notes.md` (the same file name the reporting agent reads in every session kind), the
confidentiality header first, then exactly these sections:

- `## Executive Summary` — 3 sentences: what was verified, what was found, the biggest risk
- `## AC Matrix Summary` — `n PASS / n PARTIAL / n FAIL / n BLOCKED / n NOT-REACHABLE /
  n UNVERIFIABLE`, all six verdicts, every time, so that what could not be observed stays
  visible; it goes into the report right after the executive summary
- `## Coverage Map` — rows for `| Area | Risk | Status | Bugs | Notes |`, with
  `code-verified-only` for anything whose only evidence is a code reading
- `## Observations` — the findings ranked by severity
- `## Areas Not Tested` — what you could not check and exactly what access would unblock it
- `## Recommendations` — closing with the disposition below
- `## Reflection`

Write `stats.json` with `"kind": "backend"` and the verdict counts under `coverage.verdicts`;
the report and the index rows are written in Step 5.

Recommend a disposition in one line: ship, ship-with-follow-ups, or hold — and say what
would change your mind. Where the scope of what you checked is narrower than the question
being asked, say so in the same breath; a recommendation with an unstated scope is one
someone will over-read.

For a release-level session covering many tickets against one build, follow
`${CLAUDE_SKILL_DIR}/references/release-readiness.md` instead of this phase's per-AC shape: the deployment
table first, then a fixed result vocabulary per ticket that keeps *not testable here* and
*not tested* visible rather than letting them vanish between passed and failed.

## Step 5: Assemble, Finalize and Confidentiality

Invoke the `qa-reporting-agent` sub-agent (`qualiow:qa-reporting-agent` under a plugin
install) with the session directory and `kind: backend`. It assembles `session-report.md` from
`phase-7-notes.md`, `ac-matrix.md`, the bugs and `stats.json`, copying your summary,
recommendations and reflection verbatim, and then runs `qualiow session finalize`.

That scans every artefact with the same redaction list `src/utils/redact.ts` implements — the
list in `security-rules.md`: tokens, keys, cookies, real user emails, consumer PII, account
ids not already in the target — and the raw probe output under `evidence/` is scanned like
everything else. It also checks the confidentiality header on every markdown file and
validates `stats.json`, then appends the session row to `output/sessions/INDEX.md` (`Kind` =
`backend`) and one row per bug to `output/bugs/all-bugs.md`, and records the session metrics.
It is idempotent.

Read its return (at most 8 lines). If it reports a missing notes section or a violation it
could not fix, fix that yourself — replace the value with `[REDACTED]`, add the missing
header, fix the stats key — and re-run the check:

```bash
qualiow session finalize output/sessions/<session-dir> --check
```

`--check` validates and writes nothing, naming each offending file. Resolve the `qualiow`
prefix per `${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`.

If sub-agents are unavailable, do the step yourself as in 2.1.0: write `session-report.md`
from the notes in the contract's format and run `qualiow session finalize output/sessions/<session-dir>`.

Session output stays local; never transmit it anywhere. If a browser session was opened for
the API lane, end it now: `playwright-cli -s=<sid> close` then
`playwright-cli -s=<sid> delete-data`.
