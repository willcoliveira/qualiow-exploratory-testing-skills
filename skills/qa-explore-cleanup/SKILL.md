---
name: qa-explore-cleanup
description: >
  Manage exploratory testing sessions — list, archive, or delete old sessions.
  Use when user says: "cleanup sessions", "delete old sessions", "archive", "list sessions".
argument-hint: "[list | archive <session-dir> | delete <session-dir> | delete-older-than <days>]"
allowed-tools: Read, Write, Glob, Grep, Bash(ls:*), Bash(du:*), Bash(tar:*), Bash(rm:*)
---

# Session Cleanup & Management

Session directories follow `output/sessions/<YYYY-MM-DD-HHmm>-<kind>-<slug>/`
(`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`). Archives are still CONFIDENTIAL
(`${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md`): keep them under
`output/`, never upload them. What a complete session directory contains — and which files
must survive an archive — is defined in
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md`.

## Commands

### List Sessions
Read `output/sessions/INDEX.md` (columns `| Date | Kind | Target | Bugs | Duration | Status | Report |`)
and display all sessions with:
- Date, kind, target, bug count, duration, status
- Directory size (via `du -sh`; `videos/` and `traces/` are usually the bulk)
- Directories present on disk but missing from the index (flag as `unindexed`)

### Archive Session
```bash
# Archive a specific session to .tar.gz
tar -czf output/sessions/<session-dir>.tar.gz -C output/sessions <session-dir>
```
Then optionally remove the original directory.

### Delete Session
**Always confirm with user before deleting.**
Show what will be removed (file count, size), then:
- Remove the session directory
- Remove its row from `output/sessions/INDEX.md`
- Remove its rows (matched on the `Session` column) from `output/bugs/all-bugs.md`

### Delete Old Sessions
Delete all sessions older than N days.
**Always list what will be deleted and confirm first.**

### Rules
- NEVER auto-delete — always show and confirm
- Keep INDEX.md updated after any changes
- Suggest archiving before deleting
- Remind the user of the 90-day retention default from the security policy when listing sessions older than that
