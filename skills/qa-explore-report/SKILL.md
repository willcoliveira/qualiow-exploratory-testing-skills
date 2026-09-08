---
name: qa-explore-report
description: >
  Generate, regenerate, or reformat reports from existing exploratory testing sessions.
  Use when user says: "show report", "generate report", "reformat bugs", "session summary",
  or wants to review past session findings.
argument-hint: "[<session-dir> | latest] [--format markdown|summary|bugs-only|coverage-map] [--overwrite]"
allowed-tools: Read, Write, Glob, Grep
---

# Exploratory Testing Report Generator

Reads any session kind (`explore`, `quick`, `mobile`, `backend`) written in the format of
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md` and produces a report in the
same format. Session directories, index columns and the data-resolution order come from
`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`. Security:
`${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md` applies (redact before
writing; confidentiality header first on every file).

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
- `phase-3-discovery.md`, `phase-4-journeys.md`, `phase-5-features.md`, `phase-6-edge-cases.md` (explore and mobile sessions; quick sessions have none; backend sessions have `ac-matrix.md`, `evidence/`, `expected-behaviour.md` instead)
- `bugs/BUG-*.md`
- the existing `session-report.md`, if any (its coverage map is the coverage source)

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

All in `output/sessions/<session-dir>/`, confidentiality header first, redacted. Present the
result to the user. Never modify `bugs/BUG-*.md` from this skill; `/qa-explore-feedback` owns
severity changes.
