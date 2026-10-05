# Output Contract

One format for every session kind (explore, quick, mobile, backend). The templates in
`<data>/templates/` follow it, `qualiow report` parses it, and the feedback and cleanup
skills read it. A session that deviates from it is invisible to all of them.

## Confidentiality header

The first two lines of **every** markdown artefact (charter, phase files, bug reports,
session report, coverage map, AC matrix, expected-behaviour spec):

```
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.
```

## Session files

| File | Written by |
|---|---|
| `charter.md` | phase 2 |
| `session-log.md` | every phase, append-only |
| `progress.json` | phase 0, updated after every phase |
| `phase-3-discovery.md` … `phase-6-edge-cases.md` | phases 3–6 (file number = phase number) |
| `screenshots/BUG-NNN.png`, other `screenshots/*.png` | as taken |
| `screenshots/A<N>-<slug>.png` | explore and quick (contract 2) — one or more per charter area reported `tested` or `partial`, taken when the area is done |
| `videos/*.webm` (web) / `videos/*.mp4` (mobile) | recording |
| `traces/` | explore — Playwright traces copied in from `tracing-stop` (never the session root) |
| `evidence/` | explore — any other file an area or bug cites; backend — raw probe output |
| `snapshots/*.yml` | raw accessibility trees from `playwright-cli --raw snapshot`; working files, never shipped; the session's top-level `snapshots/` is the only directory excluded from the secrets scan |
| `phase-7-notes.md` | phase 7 (backend: phase 5) — the session's own executive summary, coverage rows, observations, areas not tested, recommendations and reflection; the input the report is assembled from |
| `verification/claims/CLAIM-NNN.md`, `verification/VERDICT-NNN.md`, `verification/proposed-patterns.md` | phase 7 verification (explore) — the claim card the `qa-bug-judge` sub-agent sees, its verdict copied verbatim, and the false-positive patterns it proposed; `verification/drafts/BUG-NNN.md` holds each draft until its verdict sorts it and is then left as a working file. All header-first, all secret-scanned. Under `verification.mode: triage-shadow`, also `verification/JEV-NNN.md` / `LAYA-NNN.md` (the advisory triage block) and `.json` (the exact request sent) |
| `bugs/refuted/BUG-NNN.md` | phase 7 — a candidate the judge REFUTED or found UNREPRODUCIBLE, with the verdict under `## Refutation (Judge)`. Excluded from `bugs_found`, the index rows and `## Bugs Found`; listed only in `## Refuted Findings` |
| `bugs/BUG-NNN.md` | phase 7 |
| `session-report.md` | the `qa-reporting-agent` sub-agent, from `phase-7-notes.md`, the bugs, `stats.json` and the phase files (quick sessions write it directly) |
| `stats.json` | phase 7 |
| `evidence-level.md` | contract 2 only — written by `qualiow session level <dir> --write`, never by hand: the coverage level overall and per risk tier, the findings line, the gaps and the "To raise this level" list. Its body is copied verbatim into the report's `## Coverage Level` |
| `backlog.md` | contract 2 only — rendered by the same command from the `coverage.areas` entries that are not `tested`; never hand-written. The only part of a session `--continue` carries forward, through `qualiow session continue-check` |
| mobile: `logs/BUG-NNN.log` · backend: `ac-matrix.md`, `evidence/`, `probes/`, `expected-behaviour.md` | as produced |

The coverage map lives inside `session-report.md`. There is no separate session-level
`coverage-map.md`; `/qa-explore-report` can export one on request.

Evidence a contract-2 session cites lives under `screenshots/`, `videos/`, `traces/`, `logs/`
or `evidence/` and nowhere else. `snapshots/` and `.auth/` are never evidence.

## Bug report — `bugs/BUG-NNN.md`

```markdown
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# BUG-NNN: [Component] fails [Condition] causing [Impact]

**Severity:** Critical | High | Medium | Low
**Priority:** P0 | P1 | P2 | P3
**Component:** <Component>
**Area:** A<N> | none
**URL:** <exact URL — mobile: screen name or deep link — backend: endpoint or resource>
**Environment:** <browser + viewport — mobile: mode / platform / device / OS — backend: env kind + build>
**Reproduction rate:** Always | Intermittent (~X%) | Once
**Verification:** Verified | Verified (severity adjusted from <X>) | Unverified (<reason>) | Refuted | Unreproducible

## Summary
<two sentences: what breaks and why it matters>

## Expected Behavior
<from the user's perspective>

## Actual Behavior
<be specific; quote error messages verbatim>

## Steps to Reproduce
1. <exact steps a developer can follow>

## Business Impact
- **Revenue impact:** <or "none identified">
- **Trust impact:** …
- **Regulatory risk:** …
- **Data risk:** …
- **Scale:** <who is affected, under what conditions>

## Evidence
- Screenshot: `screenshots/BUG-NNN.png`
- Video: `videos/<file>` (if recorded)
- Log: `logs/BUG-NNN.log` (mobile) / `evidence/<file>` (backend)
- Console errors: <or "none">
- Network failures: <or "none">

## Recommended Fix Priority
<why this priority, relative to the other findings>

## Verification
- Verdict: <CONFIRMED | CONFIRMED-ADJUSTED | UNVERIFIED> (<live-repro | evidence-only>, <confidence>)
- Judge repro result: <one line>
- Severity: <original X → final Y — only when adjusted>
- Full verdict: `../verification/VERDICT-NNN.md`
- Triage (advisory): <predicted verdict> · <ROUTE> · P(refuted)=<x> — `../verification/JEV-NNN.md` (only under `triage-shadow`)
```

The `**Verification:**` line and the `## Verification` section are present only when the
session ran the adversarial judge (`/qa-explore` does unless verification is `off`). A bug
under `bugs/refuted/` carries `**Verification:** Refuted` or `Unreproducible` and, instead of
`## Verification`, a `## Refutation (Judge)` section holding the verdict block verbatim.

The `**Area:**` line is present only in a contract-2 session (`/qa-explore`,
`/qa-explore-quick`): the ID of the charter risk row the bug was found in, or `none`. It never
points at an area reported `not-tested`, `blocked` or `deferred`, and it stays out of the
claim card. Mobile and backend bug files do not carry it.

Rules: numbered from `BUG-001` per session; one bug per file; Business Impact is mandatory
(answer at least one bullet, write "none identified" for the rest); severity per
`severity-guide.md`, and when in doubt go one level lower. Ids are assigned to the drafts
and never renumbered: a gap in `bugs/` means that candidate moved to `bugs/refuted/`.

## Session report — `session-report.md`

```markdown
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Session Report — <target>

## Session Metadata
| Field | Value |
|---|---|
| Session ID | <session-dir> |
| Kind | explore / quick / mobile / backend |
| Target | <target id or name> |
| URL | <base url> |
| Date | <YYYY-MM-DD> |
| Duration | <N> min |
| Charter | charter.md |

## Executive Summary
<three sentences: what was tested, what was found, the biggest risk>

## Coverage Level
<the body of evidence-level.md, verbatim — contract 2 only>

## Summary Stats
| Metric | Count |
|---|---|
| Pages explored | |
| Actions performed | |
| Bugs — Critical | |
| Bugs — High | |
| Bugs — Medium | |
| Bugs — Low | |
| **Total bugs** | |

## Coverage Map
| Area | Risk | Status | Bugs | Notes |
|---|---|---|---|---|
| <area> | P0 | tested | 2 | |
| <area> | P1 | partial | 1 | keyboard covered submit |
| <area> | P2 | not-tested | — | time ran out |

## Bugs Found
| # | ID | Title | Severity | Report | Verification |
|---|---|---|---|---|---|
| 1 | BUG-001 | <title> | High | bugs/BUG-001.md | Verified |

## Observations
## Areas Not Tested
| Area | Reason |
|---|---|

## Recommendations
## Reflection
## Session Stats
| Metric | Value |
|---|---|

## Refuted Findings
| ID | Claimed Title | Claimed Severity | Verdict | Refutation |
|---|---|---|---|---|
```

Coverage `Status` ∈ `tested` · `partial` · `not-tested` · `code-verified-only` (believed
correct from reading source, never observed: this is UNVERIFIABLE, not a pass, and must not
be skimmed as green). A contract-2 session also uses `blocked` and `deferred` (not reached in
the time box), one row per charter area, the Area cell starting with its ID.

`## Coverage Level` is present only in a contract-2 session (`stats.json` has
`"contract": 2`, so `evidence-level.md` exists), directly after `## Executive Summary`, and is
the body of that file — everything after its confidentiality header — copied verbatim. Nobody
recomputes, rounds or rewords it. The level (`unassessed`, `incomplete`, `qualified`,
`complete`, overall and per risk tier) is a computed coverage fact, never a ship probability
or a release verdict; the findings line beside it is reported separately and never folded
into it.

Mobile appends `## Mobile Context` and `## Deferred Tests`; backend inserts
`## AC Matrix Summary` (all six verdicts counted) after the executive summary. A session
that ran the bug judge (a `verification/` directory exists) carries the sixth
`Verification` column in `## Bugs Found` and appends `## Refuted Findings` after
`## Session Stats` — one row per file in `bugs/refuted/`, or the sentence "All candidate
bugs survived verification." A session without `verification/` has neither.

## `stats.json`

```json
{
  "session_id": "<session-dir>",
  "kind": "explore",
  "target": "<target id or url>",
  "date": "<YYYY-MM-DD>",
  "duration_min": 42,
  "bugs_found": 5,
  "severity_counts": { "critical": 1, "high": 2, "medium": 2, "low": 0 },
  "pages_explored": 14,
  "domain": "ecommerce",
  "started_at": "<ISO timestamp>",
  "completed_at": "<ISO timestamp>",
  "phases_completed": 8,
  "total_phases": 8,
  "contract": 2,
  "continues": null,
  "coverage": {
    "checklist_total": 22, "checklist_verified": 15, "data_integrity_checks": 6, "data_integrity_passed": 5,
    "verification": { "judged": 5, "verified": 3, "unverified": 1, "refuted": 1, "unreproducible": 0, "budget_min": 15 },
    "areas": [
      { "id": "A1", "status": "tested", "evidence": ["screenshots/A1-checkout.png"] },
      { "id": "A2", "status": "deferred", "evidence": [], "reason": "not reached in the time box" }
    ]
  },
  "evidence": { "screenshots": 9, "console_errors_found": 2, "network_failures_found": 1 },
  "areas_not_tested": ["settings — time ran out"],
  "blocked_by": null
}
```

The first eight keys are required; the rest are optional. The schema is strict: the
top-level keys are exactly `session_id`, `kind`, `target`, `date`, `duration_min`,
`bugs_found`, `severity_counts`, `pages_explored`, `domain`, `started_at`, `completed_at`,
`phases_completed`, `total_phases`, `coverage`, `evidence`, `areas_not_tested`, `blocked_by`,
`contract`, `continues` and `coverage_level`. Mobile puts its device block under
`coverage.mobile`; backend puts the verdict counts under `coverage.verdicts`; a session that ran the bug judge puts its counts
under `coverage.verification` (`bugs_found` and `severity_counts` count shipped bugs only —
never the refuted ones). Its keys: `judged` = candidate bugs (drafts), whether or not the judge
reached them; `verified` = CONFIRMED + CONFIRMED-ADJUSTED, including overruled refutations;
`unverified` = UNVERIFIED plus not judged; `refuted`; `unreproducible` (the five sum to
`judged`); `budget_min` = the minutes allotted, not spent. The report's `## Session Stats`
renders them as one row, `| Bugs judged | <judged> (verified <n>, unverified <n>, refuted <n>, unreproducible <n>) |`. Under
`verification.mode: triage-shadow` the triage counts go under `coverage.verification.triage.<provider>`
(`triaged`, `refute_risk`, `unclear`, `likely_confirmed`, `agreed_with_judge`, `unavailable`,
`input_tokens`, `cost_usd`, `ms_total`).

**Session contract 2** (`/qa-explore` and `/qa-explore-quick` from 2.4.0; mobile and backend
never write it). `"contract": 2` turns on the coverage checks; a session without it is
contract 1 and is validated exactly as before.

- `continues` — under `/qa-explore --continue`, the directory **name** (never a path) of the
  finalized session of the same `target` that this one continues; otherwise `null`.
- `coverage.areas` — one entry per row of the charter's `## Feature Risk Ranking` table, no
  more and no fewer: `{ "id": "A<N>", "status": "tested" | "partial" | "blocked" | "not-tested" | "deferred", "evidence": [<paths>], "reason": "<text>" }`.
  `deferred` = not reached in the time box. `reason` is required unless the status is
  `tested`: at most 160 characters, no URL. `evidence` holds session-relative paths under
  `screenshots/`, `videos/`, `traces/`, `logs/` or `evidence/`, each an existing non-empty
  file; a `tested` or `partial` area cites at least one `A<N>-…` file under `screenshots/` or
  `evidence/`.
- `coverage_level` — written only by `qualiow session level <dir> --write`, never by the
  session: `{ level, tiers: { P0, P1, P2, P3 }, findings: { highest_shipped, unverified, on_p0 }, gaps: [...], inputs_digest }`,
  where a tier with no rows is `n/a`. `finalize` recomputes it and refuses the session when it
  is missing or stale.

The charter table is `| ID | Feature | Risk | Why | Time |` (quick: `| ID | Feature | Risk |`,
1–3 rows), IDs `A1`, `A2`, … Rows may be appended in any phase and are never renumbered or
removed.

## Index rows

Every session ends by appending one row to `output/sessions/INDEX.md` and one row per bug
to `output/bugs/all-bugs.md`. Both rows are written by `qualiow session finalize <session-dir>`,
which refuses the session — exit 1, naming the file — when an artefact is missing the
confidentiality header, an unredacted secret survives the scan, or `stats.json` does not
conform; for a contract-2 session also when an area, its evidence or a bug's `**Area:**` fails
the checks above, or the level is missing or stale ("re-run
`qualiow session level <dir> --write`"). The column order (defined once in `paths.md`) is:

```
| Date | Kind | Target | Bugs | Duration | Status | Report |
| ID | Session | Title | Severity | Status | Report |
```

A session that skips these rows is invisible to `/qa-explore-report`,
`/qa-explore-feedback`, `/qa-explore-cleanup` and `qualiow list sessions`.
