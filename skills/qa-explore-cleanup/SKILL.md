---
name: qa-explore-cleanup
description: >
  Manage exploratory testing sessions — list, archive, or delete old sessions.
  Use when user says: "cleanup sessions", "delete old sessions", "archive", "list sessions".
argument-hint: "[list | archive <session-dir> | delete <session-dir> | delete-older-than <days>]"
allowed-tools: Read, Grep, Bash(qualiow:*), Bash(npx:*)
---

# Session Cleanup & Management

This skill is a thin wrapper around `qualiow session`. Run it in this context — never hand
the delete paths to anything that cannot stop and ask.

Session directories follow `output/sessions/<YYYY-MM-DD-HHmm>-<kind>-<slug>/`
(`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`, which also resolves the `qualiow`
prefix — write it literally). Archives are still CONFIDENTIAL
(`${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md`): keep them under
`output/`, never upload them. What a complete session directory contains — and which files
must survive an archive — is defined in
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md`.

## Commands

### List Sessions

```bash
qualiow session list
```

Prints every row of `output/sessions/INDEX.md` and flags directories
present on disk but missing from the index as `unindexed`. Show the output as it comes.

### Archive Session

```bash
qualiow session archive <session-dir>
```

Writes `output/sessions/<session-dir>.tar.gz`. Add `--remove` to drop the original directory
afterwards and mark its index row `archived` — offer that, don't assume it.

### Delete Session

**Always confirm with the user before deleting.** The command is a dry run until `--yes`:

```bash
qualiow session delete <session-dir>
```

Show its output — file count, size, and the index rows that would go — then ask the user
whether to proceed. Only on an explicit yes:

```bash
qualiow session delete <session-dir> --yes
```

That removes the directory, its row from `output/sessions/INDEX.md` and its rows from
`output/bugs/all-bugs.md`.

### Delete Old Sessions

Same two steps, by age:

```bash
qualiow session prune --older-than <days>
```

Show the list of sessions it would remove, ask, then run it again with `--yes`.

### Rules
- NEVER auto-delete — always show and confirm
- Suggest archiving before deleting
- Remind the user of the 90-day retention default from the security policy when listing
  sessions older than that
