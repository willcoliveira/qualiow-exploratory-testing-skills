---
name: qa-explore-report
description: >
  Generate, regenerate, or reformat reports from existing exploratory testing sessions.
  Use when user says: "show report", "generate report", "reformat bugs", "session summary",
  or wants to review past session findings.
argument-hint: "[<session-dir> | latest] [--format markdown|summary|bugs-only|coverage-map] [--overwrite]"
allowed-tools: Read, Write, Glob, Grep, Bash(qualiow:*), Bash(npx:*), Bash(wc:*)
context: fork
agent: qa-reporting-agent
---

# Exploratory Testing Report Generator

Reads any session kind (`explore`, `quick`, `mobile`, `backend`) written in the format of
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md` and produces a report in the
same format. Session directories, index columns and the data-resolution order come from
`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`. Security:
`${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md` applies (redact before
writing; confidentiality header first on every file). This skill runs in the
`qa-reporting-agent` sub-agent (`qualiow:qa-reporting-agent` under a plugin install), in a
forked context: it assembles what the session already wrote and never invents a finding, a
severity or a verdict.

## Input

- **session**: session directory name or `latest` (default: latest)
- **format**: `markdown` (default), `summary`, `bugs-only`, `coverage-map`
- **--overwrite**: allow replacing an existing `session-report.md`

## Flow

### 1. Find the Session

`latest` = the alphabetically last directory under `output/sessions/` matching
`<YYYY-MM-DD-HHmm>-<kind>-<slug>` (the scheme in `paths.md`; date-first means last = newest).
Cross-check with `output/sessions/INDEX.md`. A name given by the user must match exactly one
directory; list the candidates if it is ambiguous.

### 2. Read Session Data

- `charter.md`
- `session-log.md`
- `progress.json`, `stats.json`
- `phase-7-notes.md` — the session's own summary, coverage rows, observations, recommendations and reflection; copy those sections, never invent them
- `phase-3-discovery.md`, `phase-4-journeys.md`, `phase-5-features.md`, `phase-6-edge-cases.md` (explore and mobile sessions; quick sessions have none; backend sessions have `ac-matrix.md`, `evidence/`, `expected-behaviour.md` instead)
- `bugs/BUG-*.md`
- the existing `session-report.md`, if any (its coverage map is the coverage source)

Size a file before you open it (`wc -l <file>`). A phase file or a report over 300 lines is
read in windows: `Grep '^## ' <file>` for the headings, then `Read` with `offset`/`limit` on
the sections you need. `snapshots/` is raw page structure, not session evidence — never read
it here.

### 3. Generate the Report

**markdown** (default): the full session report per `output-contract.md`
(`# Session Report — <target>`, Session Metadata, Executive Summary, Summary Stats, Coverage
Map with `| Area | Risk | Status | Bugs | Notes |`, Bugs Found, Observations, Areas Not
Tested, Recommendations, Reflection, Session Stats; mobile and backend additions preserved).

**summary**: a brief executive summary: target, date, duration; bug count by severity; top 3
findings; key recommendation.

**bugs-only**: all bugs sorted by severity, one line each with a link to `bugs/BUG-NNN.md`.

**coverage-map**: a standalone coverage map from `<data>/templates/coverage-map.md`, filled
from the session report's coverage table.

### 4. Write Output

- `markdown` → `session-report.md` only if it does not exist or `--overwrite` was given; otherwise `session-report.regenerated.md`
- `summary` → `session-summary.md`
- `bugs-only` → `bugs-summary.md`
- `coverage-map` → `coverage-map.md`

All in `output/sessions/<session-dir>/`, confidentiality header first, redacted. Never modify
`bugs/BUG-*.md` from this skill; `/qa-explore-feedback` owns severity changes.

Then check what you wrote:

```bash
qualiow session finalize output/sessions/<session-dir> --check
```

`--check` writes nothing; it validates `stats.json`, the confidentiality header on every
artefact and the redaction list, and on exit 1 prints a numbered list of violations naming
each file. Fix header and format violations and run it again; report anything you did not
fix. Resolve the `qualiow` prefix per
`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`.

Present the result to the user.
