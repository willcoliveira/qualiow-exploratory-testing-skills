---
name: qa-explore-cleanup
description: >
  Manage exploratory testing sessions — list, archive, or delete old sessions.
  Use when user says: "cleanup sessions", "delete old sessions", "archive", "list sessions".
allowed-tools: Read, Write, Glob, Grep, Bash(ls:*), Bash(du:*), Bash(tar:*), Bash(rm:*)
---

# Session Cleanup & Management

## Commands

### List Sessions
Read `output/sessions/INDEX.md` and display all sessions with:
- Date, target, bug count, duration, status
- Directory size (via `du -sh`)

### Archive Session
```bash
# Archive a specific session to .tar.gz
tar -czf output/sessions/<session-dir>.tar.gz -C output/sessions <session-dir>
```
Then optionally remove the original directory.

### Delete Session
**Always confirm with user before deleting.**
Show what will be removed (file count, size), then:
- Remove session directory
- Remove entry from INDEX.md
- Remove associated bugs from all-bugs.md

### Delete Old Sessions
Delete all sessions older than N days.
**Always list what will be deleted and confirm first.**

### Rules
- NEVER auto-delete — always show and confirm
- Keep INDEX.md updated after any changes
- Suggest archiving before deleting
