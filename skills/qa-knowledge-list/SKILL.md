---
name: qa-knowledge-list
description: >
  Browse and search the QA knowledge base. List entries by type, domain, or tag.
  Show changelog and stats.
  Use when user says: "list knowledge", "show heuristics", "what's in the knowledge base",
  "knowledge stats", "show changelog".
argument-hint: "[--domain <id>] [--tag <tag>] [--type <type>] [--entry <id>] [--changelog] [--stats]"
allowed-tools: Read, Grep, Bash(qualiow:*), Bash(npx:*)
---

# Browse QA Knowledge Base

This skill is a thin wrapper around the `qualiow` CLI, which reads the base from
`<data>/knowledge/` plus any `$PWD/data/knowledge/custom/*.yml`. Resolve the `qualiow` prefix
once per `${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md` and write it literally.

Never paste a full entry into a session report or a website; the knowledge base is internal
(`${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md`). Cite an entry by id in
the `## Observations` section of a session report instead — see
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md`.

## Flag mapping

| The user asks for | Run |
|---|---|
| everything | `qualiow list knowledge` |
| `--domain <id>` | `qualiow list knowledge --domain <id>` |
| `--tag <tag>` | `qualiow list knowledge --tag <tag>` |
| `--type <type>` | `qualiow list knowledge --type <type>` |
| `--entry <id>` | `qualiow list knowledge --entry <id>` |
| `--changelog` | `qualiow list knowledge --changelog` |
| `--stats` | `qualiow list knowledge --stats` |

Flags combine; pass them through exactly as given. `--type` ∈ `heuristic` · `technique` ·
`checklist` · `reference` · `pattern`.

```bash
qualiow list knowledge --domain fintech --tag security
qualiow list knowledge --entry heuristic-sfdipot
```

## Rules

- Print the command output verbatim. Do not re-order it, re-summarize it, or add entries
  from memory.
- Never `Read` `<data>/knowledge/manifest.yml` or a release entry directly — `--entry <id>`
  returns one entry in full, and `Grep` answers a single-line question. The reasoning behind
  this is in `${CLAUDE_SKILL_DIR}/../qa-explore/references/delegation-rules.md`.
- If the CLI is unavailable, say so and offer to `Grep` the manifest for what was asked
  rather than reading it whole.
