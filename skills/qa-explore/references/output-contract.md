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
| `videos/*.webm` (web) / `videos/*.mp4` (mobile) | recording |
| `snapshots/*.yml` | raw accessibility trees from `playwright-cli --raw snapshot`; working files, never shipped, and excluded from the secrets scan |
| `bugs/BUG-NNN.md` | phase 7 |
| `session-report.md` | phase 7 |
| `stats.json` | phase 7 |
| mobile: `logs/BUG-NNN.log` · backend: `ac-matrix.md`, `evidence/`, `probes/`, `expected-behaviour.md` | as produced |

The coverage map lives inside `session-report.md`. There is no separate session-level
`coverage-map.md`; `/qa-explore-report` can export one on request.

## Bug report — `bugs/BUG-NNN.md`

```markdown
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# BUG-NNN: [Component] fails [Condition] causing [Impact]

**Severity:** Critical | High | Medium | Low
**Priority:** P0 | P1 | P2 | P3
**Component:** <Component>
**URL:** <exact URL — mobile: screen name or deep link — backend: endpoint or resource>
**Environment:** <browser + viewport — mobile: mode / platform / device / OS — backend: env kind + build>
**Reproduction rate:** Always | Intermittent (~X%) | Once

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
```

Rules: numbered from `BUG-001` per session; one bug per file; Business Impact is mandatory
(answer at least one bullet, write "none identified" for the rest); severity per
`severity-guide.md`, and when in doubt go one level lower.

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
| # | ID | Title | Severity | Report |
|---|---|---|---|---|
| 1 | BUG-001 | <title> | High | bugs/BUG-001.md |

## Observations
## Areas Not Tested
| Area | Reason |
|---|---|

## Recommendations
## Reflection
## Session Stats
| Metric | Value |
|---|---|
```

Coverage `Status` ∈ `tested` · `partial` · `not-tested` · `code-verified-only` (believed
correct from reading source, never observed: this is UNVERIFIABLE, not a pass, and must not
be skimmed as green).

Mobile appends `## Mobile Context` and `## Deferred Tests`; backend inserts
`## AC Matrix Summary` (all six verdicts counted) after the executive summary.

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
  "coverage": { "checklist_total": 22, "checklist_verified": 15, "data_integrity_checks": 6, "data_integrity_passed": 5 },
  "evidence": { "screenshots": 9, "console_errors_found": 2, "network_failures_found": 1 },
  "areas_not_tested": ["settings — time ran out"],
  "blocked_by": null
}
```

The first eight keys are required; the rest are optional. No other top-level keys (the
schema is strict). Mobile puts its device block under `coverage.mobile`; backend puts the
verdict counts under `coverage.verdicts`.

## Index rows

Every session ends by appending one row to `output/sessions/INDEX.md` and one row per bug
to `output/bugs/all-bugs.md`. Both rows are written by `qualiow session finalize <session-dir>`,
which refuses the session — exit 1, naming the file — when an artefact is missing the
confidentiality header, an unredacted secret survives the scan, or `stats.json` does not
conform. The column order (defined once in `paths.md`) is:

```
| Date | Kind | Target | Bugs | Duration | Status | Report |
| ID | Session | Title | Severity | Status | Report |
```

A session that skips these rows is invisible to `/qa-explore-report`,
`/qa-explore-feedback`, `/qa-explore-cleanup` and `qualiow list sessions`.
