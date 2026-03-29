---
name: qa-explore-feedback
description: >
  Capture post-session feedback to improve future exploratory testing sessions.
  Identifies false positives, missed bugs, and extracts patterns for the knowledge base.
  Use after completing an exploratory session or when user says: "review session", "false positive",
  "missed bug", "session feedback".
allowed-tools: Read, Write, Glob, Grep
---

# Post-Session Feedback Capture

## Flow

### 1. Load Latest Session

Read `output/sessions/INDEX.md` to find the most recent session (or user-specified session).
Read the session's `session-report.md` and all `bugs/BUG-*.md` files.

### 2. Review Bugs with User

For each bug found, ask the user:
- **Valid bug?** Keep as-is
- **False positive?** Mark as false positive, ask WHY (the pattern that triggered it incorrectly)
- **Severity wrong?** Adjust severity

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

Append to `data/knowledge/learned-patterns.md`:

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

Update the session's row in `output/sessions/INDEX.md` with feedback status.

### 7. Summary

Present to user:
- Changes made (false positives removed, patterns added)
- How this will improve future sessions
