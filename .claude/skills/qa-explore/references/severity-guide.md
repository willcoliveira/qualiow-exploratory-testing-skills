# Severity Definitions (Strict)

| Level | Definition | Example |
|-------|-----------|---------|
| **Critical** | Data loss, security breach, financial loss, system unusable | Unauthorized admin access, wrong prices at checkout, funds stolen via negative transfer |
| **High** | Major feature broken for many users, major flow blocked | Can't complete purchase, login broken, core search returns wrong results |
| **Medium** | Feature partially broken, workaround exists, or important missing feature | Sort doesn't work (can still browse), missing delivery address field |
| **Low** | Cosmetic, rare edge case, minor inconvenience | Button slightly misaligned, single console warning, placeholder text grammar |

## The Golden Rule

**When in doubt, go one level LOWER, not higher.** Severity inflation destroys credibility.

A bug you call "Critical" that turns out to be "Medium" makes stakeholders distrust every future report. A bug you call "Medium" that turns out to be "Critical" gets escalated naturally -- and your credibility stays intact.
