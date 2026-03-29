---
name: qa-knowledge-add
description: >
  Add new QA knowledge to the knowledge base — heuristics, techniques, checklists,
  references, or patterns. Supports text input, URLs, and file ingestion.
  Use when user says: "add knowledge", "add heuristic", "learn this", "save this technique",
  "add to knowledge base", or provides QA documentation to ingest.
allowed-tools: Read, Write, Glob, Grep, WebFetch
---

# Add QA Knowledge

## Input Options

1. **Text**: User pastes a heuristic, technique, article excerpt
2. **URL**: User provides a URL to documentation — fetch and extract
3. **File**: User provides a local file path to ingest
4. **Session pattern**: Extract patterns from recent session bugs/findings

## Flow

### 1. Parse Input

Determine the input type and extract the raw content.
For URLs: use WebFetch to retrieve and summarize the content.

### 2. Classify Entry Type

Determine the best type:
- **heuristic**: A named method for deciding what/how to test (e.g., SFDIPOT, Goldilocks)
- **technique**: A specific testing technique with steps (e.g., Boundary Value Analysis)
- **checklist**: A list of items to verify (e.g., WCAG checklist)
- **reference**: A pointer to external documentation with key takeaways (e.g., OWASP Top 10)
- **pattern**: A learned pattern from real-world testing (e.g., "login forms often miss autocomplete")

### 3. Structure as YAML

Create entry following the schema:

```yaml
id: <type>-<slug>
version: "<current_version>"
type: <heuristic|technique|checklist|reference|pattern>
name: "<Name>"
description: "<One-line description>"
author: "<Author if known>"
source: "<Source if known>"
source_url: "<URL if available>"
tags: [<relevant tags>]
domains: [all]  # or specific domains
priority: <high|medium|low>
added: "<today's date>"
updated: "<today's date>"

content:
  summary: "<Brief summary>"
  # ... type-specific content structure
```

### 4. Ask User to Review

Present the structured entry and ask:
- Is the classification correct?
- Any tags to add/change?
- Which domains does this apply to?
- Priority level?

### 5. Determine Release Version

Read `data/knowledge/manifest.yml` for current version.
- If adding to existing release: place in current version's entries/
- If user wants a new release: bump version, create new release directory

Default: add to current release unless user specifies otherwise.

### 6. Write Files

1. Write YAML entry to `data/knowledge/releases/<version>/entries/<id>.yml`
   (or `data/knowledge/custom/<id>.yml` for user-custom entries)
2. Update `data/knowledge/manifest.yml`:
   - Increment stats for the entry type
   - Add to loading rules (always, by_domain, or by_tag)
3. Update `data/knowledge/changelog.yml`:
   - Add entry to current release's `entries_added` list

### 7. Confirm

Tell user:
- What was added (name, type, location)
- How it will be used (which sessions will load it, based on loading rules)
- Current knowledge base stats
