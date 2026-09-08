# Severity, Priority and Risk

## Severity (strict)

| Level | Definition | Example |
|-------|-----------|---------|
| **Critical** | Data loss, security breach, financial loss, system unusable | Unauthorized admin access, wrong prices at checkout, funds stolen via negative transfer |
| **High** | Major feature broken for many users, major flow blocked, no reasonable workaround | Can't complete purchase, login broken, core search returns wrong results |
| **Medium** | Feature partially broken, workaround exists, or important missing feature | Sort doesn't work (can still browse), missing delivery address field |
| **Low** | Cosmetic, rare edge case, minor inconvenience | Button slightly misaligned, single console warning, placeholder text grammar |

### The Golden Rule

**When in doubt, go one level LOWER, not higher.** Severity inflation destroys credibility.

A bug you call "Critical" that turns out to be "Medium" makes stakeholders distrust every
future report. A bug you call "Medium" that turns out to be "Critical" gets escalated
naturally, and your credibility stays intact.

## Risk = Likelihood × Impact

|                    | **Impact: Low** | **Impact: Med** | **Impact: High** |
|--------------------|-----------------|-----------------|-------------------|
| **Likelihood: High** | Medium        | High            | Critical          |
| **Likelihood: Med**  | Low           | Medium          | High              |
| **Likelihood: Low**  | Low           | Low             | Medium            |

Likelihood: how often a real user hits it (every time, common path, rare edge case).
Impact: how bad it is when they do (data loss, blocked task, annoyance).

## Priority (the `**Priority:**` field of every bug report)

| Priority | Meaning | Typical SLA |
|----------|---------|-------------|
| P0 | Fix immediately, interrupt the sprint | Hours |
| P1 | Fix this sprint | Days |
| P2 | Fix next sprint | 1–2 weeks |
| P3 | Backlog, fix when convenient | When capacity allows |

Priority is severity adjusted by workaround and blast radius: a High bug with an easy
workaround is usually P1, not P0. Say why in `## Recommended Fix Priority`.
