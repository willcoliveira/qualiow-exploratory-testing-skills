# Project Status — Qualiow Exploratory Testing Skills

**Date:** 2026-03-29
**Version:** 1.0.0-beta
**Status:** Functional prototype with production-ready TypeScript infrastructure

---

## What Was Built

An AI-powered exploratory testing tool that acts as a Principal QA Engineer — understands business context, risk-ranks features, tests end-to-end user journeys, verifies data integrity, finds what's missing, and writes bug reports with business impact.

### Results Across 6 Sessions

| Session | Target | Bugs | Critical | New Findings | Tokens |
|---------|--------|------|----------|-------------|--------|
| Round 1 | ParaBank | 11 | 3 | 11 (first run) | ~100K |
| Round 1 | Sauce Demo | 12 | 2 | 12 (first run) | ~111K |
| Round 2 | ParaBank | 10 | 2 | 10 (all new) | ~99K |
| Round 2 | Sauce Demo | 15 | 2 | 15 (all new) | ~107K |
| v2 Clean | ParaBank | 12 | 4 | 1 (plaintext pw) | ~117K |
| v2 Clean | Sauce Demo | 15 | 3 | 1 (form overwrite) | ~117K |
| **Total** | | **75 findings** | **16 critical** | **50 unique bugs** | |

### Human QA Benchmark
- Round 1: matched 5/12 human QA bugs (42%)
- Round 2: matched 12/12 human QA bugs (100%)
- v2 Clean: matched independently without prior knowledge

---

## What Works

### Skills (9 + 1 agent)
| Skill | Status | Notes |
|-------|--------|-------|
| `/qa-explore` | Working | Decomposed into 8 phases + 4 references. 70-line orchestrator. |
| `/qa-explore-quick` | Working | 15-min focused session |
| `/qa-explore-report` | Working | Report from existing sessions |
| `/qa-explore-feedback` | Working | Post-session learning |
| `/qa-explore-cleanup` | Working | Session management |
| `/qa-gather` | Working | Requirements analysis |
| `/qa-knowledge-add` | Working | Add to knowledge base |
| `/qa-knowledge-list` | Working | Browse knowledge |
| `/qa-target-setup` | Working | Configure targets |
| `qa-gather-agent` | Working | Sub-agent for requirements |

### TypeScript Infrastructure
| Component | Status | Tests |
|-----------|--------|-------|
| Type definitions | Done | 12 interfaces |
| Zod schemas | Done | 5 schemas, 26 tests |
| Credential redaction | Done | 7 patterns, 21 tests |
| Config validation | Done | 4 validators, 7 tests |
| Session parser | Done | 2 functions, 10 tests |
| Metrics utility | Done | JSONL read/write, 7 tests |
| HTML report formatter | Done | Dark-mode standalone, 12 tests |
| JSON report formatter | Done | Structured output |
| Jira CSV export | Done | Bulk import format |
| **Total** | **83 tests passing** | **325ms** |

### CLI
| Command | Status | Notes |
|---------|--------|-------|
| `qualiow init` | Working | Copies skills + data, creates dirs |
| `qualiow validate` | Working | Validates all configs, CI/CD exit codes |
| `qualiow list` | Working | Sessions, knowledge, targets, domains |
| `qualiow report` | Working | Generates HTML/JSON/Jira from real sessions |
| `qualiow explore` | Partial | Pre-flight only — sets up session, prints instructions |
| `qualiow gather` | Partial | Pre-flight only |

### Knowledge Base
- 13 YAML entries (5 heuristics, 5 techniques, 1 checklist, 2 references)
- Manifest with loading strategy (always-load, by-domain, by-tag)
- Learned patterns from 6 sessions
- 5 structured domain configs (YAML with completeness checklists, risk rankings, data integrity checks, user journeys)
- 10 target configs (8 POC sites + default + testers-ai)

---

## Known Issues

### ISSUE-001: Sub-Agent Bash Permissions (P0)
Sub-agents spawned via Agent tool cannot run Bash commands. This blocks background execution of the decomposed v2 skill phases.

**Workaround:** Use v1 pattern — embed full instructions in the Agent prompt. Proven to work across all 6 sessions.

**Proper fix:** TypeScript CLI orchestrator handles Bash execution, passes structured data to Claude for reasoning.

### ISSUE-002: playwright-cli Negative Number Parsing
`npx playwright-cli fill e54 "-100"` fails — the `-100` is parsed as a CLI flag.

**Workaround:** Use `eval` to set values programmatically.

**Fix:** File upstream issue with playwright-cli team.

### ISSUE-003: Decomposed Skill Phase Reading
The orchestrator SKILL.md tells agents to "Read phases/00-setup.md" — but sub-agents can't read files and run Bash in the same session due to ISSUE-001.

**Workaround:** For background sessions, embed phase content in the agent prompt. Decomposed files remain useful for the `/qa-explore` slash-command path (runs in main conversation with full permissions).

---

## Architecture Proven

| Pattern | Verdict |
|---------|---------|
| Playwright CLI for browser control | Works well — token-efficient, 50+ commands |
| Domain YAML configs with checklists | Improves coverage — v2 clean found more with checklists |
| Learned patterns in prompts | Works — brute force, empty states, legal links caught automatically |
| Risk-ranked time allocation | Works — P0 features get deeper testing |
| Data integrity verification | Works — found audit trail gaps, verified math |
| Business Impact in bug reports | Works — reports are actionable for stakeholders |
| Background Agent sessions | Works with v1 pattern (full prompt), fails with v2 pattern (read files) |
| TypeScript for validation/formatting | Works — 83 tests, clean build, CLI functional |

---

## Next Steps (Priority Order)

### P0: Ship v1.0.0
1. Fix .gitignore for dist/ and coverage/
2. Add `skills/` directory at project root for npm distribution (copy from .claude/skills/)
3. Run `npm publish` (or prepare for it)
4. Write changelog

### P1: Fix Session Architecture
1. Design the hybrid session executor: TypeScript handles Bash, Claude handles reasoning
2. Implement `qualiow explore` as a full executor (not just pre-flight)
3. Solve the sub-agent permission gap

### P2: Improve Quality
1. Run clean benchmarks on remaining 6 POC sites
2. Add more knowledge entries (from awesome-testing, MoT resources)
3. File playwright-cli negative number bug
4. Add visual testing (screenshot analysis) via Playwright MCP vision mode

### P3: Enterprise
1. Jira integration for bug creation
2. GitHub Actions workflow for CI/CD
3. Quality metrics dashboard from metrics.jsonl
4. Team/multi-user support

---

## File Inventory

| Category | Count |
|----------|-------|
| TypeScript source | 23 files |
| Test suites | 6 (83 tests) |
| Test fixtures | 4 |
| Skills | 10 (1 orchestrator + 8 phases + 4 refs + 8 others) |
| Knowledge entries | 13 YAML |
| Domain configs | 10 (5 YAML + 5 markdown legacy) |
| Target configs | 10 |
| Templates | 4 |
| Documentation | 8 (README, LICENSE, GETTING-STARTED, CLAUDE.md, ARCHITECTURE-DECISIONS, PRODUCTION-READINESS, SECURITY-POLICY, KNOWN-ISSUES) |
| Session outputs | 6 sessions with reports, bugs, screenshots |
| **Total project files** | **~120** |

---

## Lessons Learned

1. **Domain knowledge improves testing more than better heuristics.** The fintech completeness checklist found more bugs than any individual heuristic.

2. **"What's missing?" is the most powerful question.** It found more bugs than "What's broken?" across all sessions.

3. **Data integrity testing catches what functional testing misses.** The audit trail gap (transfers missing from receiving account history) was invisible to feature-by-feature testing.

4. **User personas are gold mines.** Testing all 6 Sauce Demo users found 4x more bugs than testing only standard_user.

5. **The v1 agent pattern works better than v2 decomposition for background sessions.** Full prompt > read-file instructions when Bash permissions are needed.

6. **Learned patterns create a flywheel.** Each session's findings feed the next session's must-check list.

7. **Bug reports with Business Impact get attention.** "Negative transfer accepted" is forgettable. "Any user can steal funds via negative transfer — regulatory violation" gets fixed.
