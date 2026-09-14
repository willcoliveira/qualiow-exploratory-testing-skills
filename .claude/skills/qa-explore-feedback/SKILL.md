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

### 2. Review Bugs with User

For each bug found, ask the user:
- **Valid bug?** Keep as-is
- **False positive?** Mark as false positive, ask WHY (the pattern that triggered it incorrectly)
- **Severity wrong?** Adjust the `**Severity:**` line in `bugs/BUG-NNN.md` and the row in `output/bugs/all-bugs.md`

### 3. Capture Missed Bugs

Ask: "Did you find any bugs manually that the session missed?"

For each missed bug:
- Record it as an additional finding
- Extract the PATTERN: What should have been checked? Which heuristic would have caught it?

### 4. Rate Session Quality

Ask user to rate (1-5):
- Coverage completeness
- Bug detection accuracy
- Report quality

### 5. Update Learned Patterns

Append to `$PWD/data/knowledge/learned-patterns.md` (create it from the shipped copy under
`<data>/knowledge/` if the project has none; never write into a plugin directory):

**False positives → add to skip list:**
```markdown
## False Positive Patterns (skip these)
- [NEW] <description of what was incorrectly flagged and why>
```

**Missed bugs → add to must-check list:**
```markdown
## Missed Bug Patterns (always check these)
- [NEW] <description of what was missed and the pattern to always check>
```

**Domain insights → add to domain section:**
```markdown
## Domain-Specific Insights
### <domain>
- [NEW] <insight learned from this session>
```

### 6. Update Session Index

Set the session's `Status` column in `output/sessions/INDEX.md` to `reviewed`, and set
`Status` to `false-positive` or `closed` in `output/bugs/all-bugs.md` for bugs the user
rejected.

### 7. Summary

Present to user:
- Changes made (false positives removed, patterns added)
- How this will improve future sessions
