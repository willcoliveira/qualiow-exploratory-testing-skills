---
name: qa-explore-report
description: >
  Generate, regenerate, or reformat reports from existing exploratory testing sessions.
  Use when user says: "show report", "generate report", "reformat bugs", "session summary",
  or wants to review past session findings.
allowed-tools: Read, Write, Glob, Grep
---

# Exploratory Testing Report Generator

## Input

- **session**: Session directory name or "latest" (optional — defaults to latest)
- **format**: Output format (optional — "markdown" default, "summary", "bugs-only")

## Flow

### 1. Find Session

```
# If "latest" or no session specified:
Read output/sessions/INDEX.md → find most recent session

# If specific session:
Read output/sessions/<session-dir>/
```

### 2. Read Session Data

Read all phase files from the session directory:
- `charter.md` — session charter
- `phase-1-discovery.md` — discovery findings
- `phase-2-functional.md` — functional testing findings
- `phase-3-edge-cases.md` — edge case findings
- `session-log.md` — full session log
- `bugs/BUG-*.md` — all bug reports
- `coverage-map.md` — coverage data

### 3. Generate Report

Based on requested format:

**markdown** (default): Full session report following `data/templates/session-report.md`
- Session metadata, charter summary, stats
- Coverage map, bugs grouped by severity
- Observations, questions, recommendations

**summary**: Brief executive summary
- Target, date, duration
- Bug count by severity
- Top 3 findings
- Key recommendation

**bugs-only**: Just the bug list
- All bugs sorted by severity
- One-line summary each with link to full report

### 4. Write Output

Save to `output/sessions/<session-dir>/session-report.md` (or specified filename).
Present to user.
