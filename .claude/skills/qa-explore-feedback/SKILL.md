---
name: qa-explore-feedback
description: >
  Capture post-session feedback to improve future exploratory testing sessions.
  Identifies false positives, missed bugs, and extracts patterns for the knowledge base.
  Use after completing an exploratory session or when user says: "review session", "false positive",
  "missed bug", "session feedback".
argument-hint: "[<session-dir> | latest]"
allowed-tools: Read, Write, Glob, Grep
---

# Post-Session Feedback Capture

Security: `${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md` applies (redact
anything the user pastes before it is written; confidentiality header on any new file).
Paths: `${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md` (session-directory scheme,
index columns; learned patterns are written to the project's own `data/`). The artefacts
this skill reads back — `session-report.md`, `bugs/BUG-NNN.md`, `stats.json` — are defined
in `${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md`.

## Flow

### 1. Load Latest Session

Read `output/sessions/INDEX.md` (columns `| Date | Kind | Target | Bugs | Duration | Status | Report |`)
to find the most recent session, or take the user-specified directory. Any session kind
(`explore`, `quick`, `mobile`, `backend`) is valid. Read the session's `session-report.md`
and all `bugs/BUG-*.md` files.

The phase files and `snapshots/` are not needed for feedback — the report and the bugs carry
every claim the user is reviewing. A `session-report.md` over 300 lines is read in windows:
`Grep '^## '` for the headings, then `Read` with `offset`/`limit` on Coverage Map, Bugs Found,
Observations and Reflection.

**Finalized?** A session is finalized once `output/sessions/INDEX.md` has its row
(`Grep '<session-dir>/' output/sessions/INDEX.md`) — `qualiow session finalize` wrote it.
Its files are then fixed: `finalize --check` and `--continue` re-verify the bugs,
`stats.json`, the coverage level and `evidence-manifest.json`, and the level cannot be
recomputed after finalize, so an edit there breaks the session for good. Never edit
`bugs/*.md`, `stats.json` or any other file of a finalized session. Every correction goes
into `<session-dir>/feedback.md` (step 6) instead.

### 2. Review Bugs with User

For each bug found, ask the user:
- **Valid bug?** Keep as-is
- **False positive?** Record it, and ask WHY (the pattern that triggered it incorrectly)
- **Severity wrong?** Record `BUG-NNN: <old> → <new> — <the user's reason>`

Recorded means `feedback.md` — never the bug file, and never the Severity cell of
`output/bugs/all-bugs.md`, which must keep matching the file it points at. Only a session
that is **not finalized yet** is corrected in place: change the bug's `**Severity:**` line
and `stats.json` `severity_counts` together, then tell the user to re-run
`qualiow session level <dir> --write` (explore and quick: severity is an input to the level)
before `qualiow session finalize <dir>`.

### 3. Capture Missed Bugs

Ask: "Did you find any bugs manually that the session missed?"

For each missed bug:
- Record it in `feedback.md` — never as a new `bugs/BUG-NNN.md` in a finalized session
- Extract the PATTERN: What should have been checked? Which heuristic would have caught it?

### 4. Rate Session Quality

Ask user to rate (1-5):
- Coverage completeness
- Bug detection accuracy
- Report quality

### 5. Update Learned Patterns

Append to `$PWD/data/knowledge/learned-patterns.md` (create it from the shipped copy under
`<data>/knowledge/` if the project has none; never write into a plugin directory). Every
bullet opens with a bold lead-in: `qualiow kb digest` carries only the lead-ins into later
sessions, so the lead-in is the pattern and the rest is grepped when it looks relevant.
Write each pattern in your own words, generalised: never paste wording from the tested page,
an error message a bug quotes or the user's paste of either — every later session loads
these lines as guidance.

**False positives → add to skip list:**
```markdown
## False Positive Patterns (skip these)
- **[NEW] <short pattern>** — <what was incorrectly flagged, why, and the disqualifier>
```

**Missed bugs → add to must-check list:**
```markdown
## Missed Bug Patterns (always check these)
- **[NEW] <short pattern>** — <what was missed and the check that would have caught it>
```

**Domain insights → add to domain section:**
```markdown
## Domain-Specific Insights
### <domain>
- **[NEW] <short insight>** — <what this session taught about the domain>
```

### 6. Write `feedback.md` and Update the Index

Write `<session-dir>/feedback.md` at the session root — never under `screenshots/`,
`videos/`, `traces/`, `logs/` or `evidence/`, which the evidence manifest covers. It is held
to the same header and redaction checks as every session file:

```markdown
> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Feedback — <session-dir>

**Reviewed:** <YYYY-MM-DD>

## Severity Changes
- BUG-NNN: <old> → <new> — <reason>

## False Positives
- BUG-NNN — <why it is not a bug; the pattern that produced it>

## Missed Bugs
- <what was missed, where, and the check that would have caught it>

## Session Rating
Coverage <1-5> · Detection accuracy <1-5> · Report quality <1-5>
```

Leave out a section with nothing in it; a later review appends its own `**Reviewed:**` block.

Then set the session's `Status` cell in `output/sessions/INDEX.md` to `reviewed`, and the
`Status` cell in `output/bugs/all-bugs.md` to `false-positive` or `closed` for bugs the user
rejected. Change no other cell.

### 7. Summary

Present to user:
- What `feedback.md` records and which patterns were added
- How this will improve future sessions
