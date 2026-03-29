---
name: qa-knowledge-list
description: >
  Browse and search the QA knowledge base. List entries by type, domain, or tag.
  Show changelog and stats.
  Use when user says: "list knowledge", "show heuristics", "what's in the knowledge base",
  "knowledge stats", "show changelog".
allowed-tools: Read, Glob, Grep
---

# Browse QA Knowledge Base

## Commands

### List All
Read `data/knowledge/manifest.yml` and display:
- Total entries by type (heuristics, techniques, checklists, references, patterns)
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
Read `data/knowledge/changelog.yml` and display recent changes.

### Show Stats
`/qa-knowledge-list --stats`
Display from manifest: entry counts, release history, loading strategy summary.
