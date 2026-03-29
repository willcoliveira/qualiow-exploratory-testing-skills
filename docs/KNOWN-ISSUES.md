# Known Issues

## ISSUE-001: Sub-agent Bash Permission Inheritance (P0)

**Status:** Open
**Impact:** Blocks background exploratory sessions in v2
**Workaround:** Run sessions in main conversation (requires manual approval) or use v1 monolithic prompt approach

### Problem

When spawning background agents via Claude Code's Agent tool, the sub-agents cannot execute Bash commands (including `npx playwright-cli`). Every Bash call requires user approval, which defeats the purpose of autonomous background sessions.

**v1 behavior (worked):** The full exploratory prompt was passed directly to the Agent tool. The agent ran autonomously with ~170-200 Bash calls, completing in ~20 minutes without user interaction.

**v2 behavior (broken):** The agent is told to read phase files then execute playwright-cli commands. The Bash permission is not inherited by the sub-agent, causing it to request permission and fail.

### Root Cause

Claude Code's Agent tool has a permission boundary. The parent conversation's `settings.local.json` permissions (`Bash(playwright-cli:*)`) are not automatically inherited by spawned sub-agents. The Agent tool description says `allowed-tools` in the skill frontmatter should control this, but Bash permissions specifically require runtime approval.

### Why v1 Worked

In v1, we passed the ENTIRE instruction set (all testing phases, heuristics, rules) directly in the Agent prompt. The Agent tool then executed Bash commands because the prompt explicitly included the commands to run. The key difference: v1 agents were given explicit commands in the prompt, v2 agents are told to read files first then decide what commands to run.

### Possible Fixes

1. **Revert to v1 pattern for sessions:** Pass the full session instructions in the Agent prompt (include phase content directly, not "read this file"). Keep v2 decomposed files for the skill slash-command path.

2. **TypeScript CLI orchestrator:** The `npx qualiow explore` command handles all Bash execution in TypeScript, passes structured results to Claude for reasoning. No sub-agent Bash needed.

3. **Hooks-based approach:** Use Claude Code hooks to pre-approve Bash commands matching `playwright-cli*` for sub-agents.

4. **Hybrid:** Main session runs in foreground (with approvals auto-accepted via settings), sub-agents handle only non-Bash tasks (reporting, analysis).

### Recommended Fix

Option 1 for immediate fix (keep background sessions working). Option 2 for v2.x (proper architecture with TypeScript orchestration).

---

## ISSUE-002: playwright-cli Negative Number Parsing

**Status:** Open — needs upstream bug report
**Impact:** Cannot test negative amounts directly via `fill` command
**Workaround:** Use `eval` to set values programmatically

### Problem

`npx playwright-cli fill e54 "-100"` fails because `-100` is parsed as a CLI flag (`--1`). This prevents testing negative number inputs directly.

### Workaround

```bash
npx playwright-cli eval "el => el.value = '-100'" e54
```

### Upstream

File issue at: https://github.com/anthropics/playwright-cli or the appropriate Microsoft repo.

---

## ISSUE-003: v2 Benchmark Was Not Clean

**Status:** Acknowledged
**Impact:** v2 benchmark results are not comparable to v1

### Problem

The v2 benchmark provided the list of 21/27 known bugs in the agent prompt, then confirmed they still exist. This is confirmation testing, not exploratory testing. A fair benchmark requires a clean agent with no prior knowledge of expected bugs.

### Fix

Run a clean benchmark session with:
- No bug list in the prompt
- Same decomposed skill phases
- Same time allocation
- Compare independently-found bugs against the known 48
