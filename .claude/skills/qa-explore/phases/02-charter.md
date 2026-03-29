# Phase 2: Business Context & Charter (~5 min)

**This is the most important phase. Skip it and everything else is shallow.**

## Step 1: Use the App as a Real User

Before any testing, spend 2-3 minutes USING the app the way a customer would. Not testing -- USING.

```bash
playwright-cli open <url>
playwright-cli snapshot
```

Ask yourself:
- **What does this application exist to do?** (sell products? manage money? connect people?)
- **Who are the users?** (customers? employees? admins?)
- **What outcomes matter?** (successful purchase? correct balance? data saved?)
- **What would make a user lose trust?** (wrong prices? lost data? broken checkout?)

Write your answers in the charter. This is your north star for the session.

**If context was provided**, also check:
- Do the acceptance criteria match what you see in the app?
- Does the UI match the design specs?
- Are the features described in the requirements actually present?
- What does the context say the RISKS are? Do you agree after seeing the app?

## Step 2: Identify Critical User Journeys

**If context provided:** Derive journeys from the requirements -- what user flows does the story describe? What should the user be able to accomplish?

**If no context:** Define journeys from what you observed. Examples:

- E-commerce: "Browse -> Add to cart -> Checkout -> Confirm order -> Verify in order history"
- Banking: "Register -> Login -> Open account -> Transfer funds -> Verify in account history -> Pay a bill"
- SaaS: "Sign up -> Complete onboarding -> Create first item -> Edit -> Delete -> Verify empty state"

## Step 3: Risk-Rank Features

List every feature/page discovered and assign risk:

| Risk | Criteria | Time allocation |
|------|----------|----------------|
| **P0 -- Critical** | Moves money, stores sensitive data, auth/security | 40% of testing time |
| **P1 -- High** | Core user workflow, data creation/modification | 30% of testing time |
| **P2 -- Medium** | Secondary features, settings, search, filtering | 20% of testing time |
| **P3 -- Low** | Static content, about pages, help docs | 10% of testing time |

**Write the risk ranking in your charter.** This drives how you spend your time.

## Step 4: Select Heuristics by Context

Don't apply all SFDIPOT dimensions equally. Based on the app type, choose the 3 most relevant:

- **Fintech**: Data (money correctness), Function (transactions), Time (concurrent operations)
- **E-commerce**: Function (buy flow), Data (prices/inventory), Interfaces (payment gateway)
- **SaaS**: Function (CRUD), Platform (browsers), Operations (permissions/roles)

Also select 2 Test Tours:
- Always include **Bad Neighborhood** or **Saboteur**
- Pick one that matches the app: **Money Tour** (e-commerce/fintech), **FedEx Tour** (data-heavy), **Landmark Tour** (complex navigation)

## Step 5: Write Charter

Save to `output/sessions/<session-dir>/charter.md`:

```markdown
# Session Charter

## Context Source
**Mode:** [blind | context-file | inline-context]
**Source:** [filename or "none -- discovering from app"]

## Requirements Summary (if context provided)
**Acceptance Criteria:**
- [ ] [AC from requirements -- each becomes a test checkpoint]
**What Changed:** [code changes, MR scope, or "unknown"]
**Design Intent:** [expected behavior from specs, or "discovering from app"]
**Known Risks:** [from requirements analysis, or "assessing from exploration"]

## Business Context
**What this app does:** [one sentence]
**Who uses it:** [target users]
**What matters most:** [key business outcomes]
**What would break trust:** [worst-case scenarios for users]

## Critical User Journeys
1. [Journey A: step -> step -> step -> verification]
2. [Journey B: step -> step -> step -> verification]

## Feature Risk Ranking
| Feature | Risk | Why | Time |
|---------|------|-----|------|
| [feature] | P0 | [reason] | 40% |
| [feature] | P1 | [reason] | 30% |
...

## Heuristics Selected
- SFDIPOT dimensions: [X, Y, Z -- and WHY these 3]
- Test Tours: [A, B -- and WHY these 2]
- FEW HICCUPPS oracles: Focus on [Users, Claims, Product]

## Session Parameters
- Time box: [duration]
- Domain: [domain]
- Focus: [focus area or "full exploration"]
```

Start trace: `playwright-cli tracing-start`
