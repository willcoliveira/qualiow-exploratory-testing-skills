# Context Integration

How the `--context` parameter changes the session.

## Mode 1: Context File (`--context <file>`)

Read the file. It may be a `tool-qa-workflow` output (structured markdown with Jira data, Confluence specs, GitLab MR diffs, Figma design notes) or any document describing what to test.

Extract and use:

| Context Element | How It Changes the Session |
|----------------|---------------------------|
| **Acceptance criteria** | Add as explicit checkpoints -- verify each AC during testing |
| **What changed** (MR diff, commits) | Focus testing on changed areas -- highest regression risk |
| **Design specs** (Figma, mockups) | Compare live app against intended design -- spot deviations |
| **User stories / requirements** | Test against INTENT, not just what's visible |
| **Known risks** (from risk analysis) | Prioritize testing on flagged risk areas |
| **API contracts** (OpenAPI, endpoints) | Verify UI matches API behavior |
| **Previous test results** | Don't re-test what passed -- focus on gaps |

## Mode 2: Inline Context

Extract from the user's message any descriptions of: what the feature does, acceptance criteria, what changed, what the design should look like, known risks, user personas.

## Mode 3: Blind Exploration (no context)

That's fine -- run in blind exploration mode. The agent discovers everything on its own. **Context makes exploration sharper but NEVER blocks it.** A QA walking up to a random app with zero documentation should still get a full, valuable session. Context is a boost, not a gate.

## Charter Annotation

When context is loaded, note in the charter:
```
CONTEXT SOURCE: [filename or "inline" or "none -- blind exploration"]
ACCEPTANCE CRITERIA: [list extracted ACs or "none provided -- discovering from app"]
CHANGE SCOPE: [what changed or "unknown -- full exploration"]
```

### Context-Driven Adjustments

**If context was provided**, during the charter phase also check:
- Do the acceptance criteria match what you see in the app?
- Does the UI match the design specs?
- Are the features described in the requirements actually present?
- What does the context say the RISKS are? Do you agree after seeing the app?
