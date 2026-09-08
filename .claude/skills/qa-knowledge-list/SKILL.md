---
name: qa-knowledge-list
description: >
  Browse and search the QA knowledge base. List entries by type, domain, or tag.
  Show changelog and stats.
  Use when user says: "list knowledge", "show heuristics", "what's in the knowledge base",
  "knowledge stats", "show changelog".
argument-hint: "[--domain <id>] [--tag <tag>] [--type <type>] [--entry <id>] [--changelog] [--stats]"
allowed-tools: Read, Glob, Grep
---

# Browse QA Knowledge Base

Read the base from `<data>/knowledge/` (resolution order in
`${CLAUDE_SKILL_DIR}/../qa-explore/references/paths.md`), plus any `$PWD/data/knowledge/custom/*.yml`.
Never paste a full entry into a session report or a website; the knowledge base is internal
(`${CLAUDE_SKILL_DIR}/../qa-explore/references/security-rules.md`). Cite an entry by id in
the `## Observations` section of a session report instead — see
`${CLAUDE_SKILL_DIR}/../qa-explore/references/output-contract.md`.

## Commands

### List All
Read `<data>/knowledge/manifest.yml` and display:
- Total entries by type (heuristics, techniques, checklists, references, patterns), counted
  from the `entries:` registry; if `stats` disagrees with the count, say so (run `npx qualiow kb sync`)
- Active releases
- Last updated date

Then list all entries grouped by type:
```
## Heuristics (N)
- SFDIPOT - Product Elements (v0.1.0) [high] [tags: exploration, what-to-test]
- FEW HICCUPPS - Consistency Oracles (v0.1.0) [high] [tags: oracles, recognize-problems]
...

## Techniques (N)
...
```

### Filter by Domain
`/qa-knowledge-list --domain ecommerce`
Show only entries where `domains` includes the specified domain or "all".

### Filter by Tag
`/qa-knowledge-list --tag security`
Show only entries with the specified tag.

### Filter by Type
`/qa-knowledge-list --type heuristic`
Show only entries of the specified type.

### Show Entry Detail
`/qa-knowledge-list --entry heuristic-sfdipot`
Read and display the full YAML entry content.

### Show Changelog
`/qa-knowledge-list --changelog`
Read `<data>/knowledge/changelog.yml` and display recent changes.

### Show Stats
`/qa-knowledge-list --stats`
Display from manifest: entry counts, release history, loading strategy summary.
