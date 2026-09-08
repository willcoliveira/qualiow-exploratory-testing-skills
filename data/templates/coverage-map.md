> CONFIDENTIAL: This report may contain internal URLs, security vulnerabilities,
> and application details. Do not share outside your organization without review.

# Coverage Map

## Session Reference

| Property   | Value                          |
|------------|--------------------------------|
| Session ID | [session directory, e.g. 2026-09-08-1420-explore-parabank] |
| Target     | [application or feature name]  |
| Date       | [YYYY-MM-DD]                   |

---

## Overall Coverage

| Area | Risk | Status | Bugs | Notes |
|---|---|---|---|---|
| [Area 1] | P0 | tested | 0 | [heuristics applied, notes] |
| [Area 2] | P1 | partial | 0 | [what was not reached and why] |
| [Area 3] | P2 | not-tested | — | [reason] |

### Status Legend

- **tested** -- Area was fully explored with the planned heuristics.
- **partial** -- Area was visited but not all heuristics or paths were exercised.
- **not-tested** -- Area was in scope but was not reached during the session.
- **code-verified-only** -- Believed correct from reading the source, never observed
  running. This is `UNVERIFIABLE`, **not** a pass -- keep it visually distinct so it
  cannot be skimmed as green.

Two distinctions that routinely produce a false **tested**:

- **Consistent is not causal.** A setting whose current value happens to match the output
  proves nothing until the setting is changed and the output is watched to follow.
- **The data has to reach the case.** An area whose behaviour depends on values no
  reachable record has -- a negative, a zero, an empty collection -- is **not-tested** for
  that behaviour. Find such a record, create one, or say plainly what data would settle it.

Name the single **not-tested** item that carries the most risk. In a map full of green rows
that is the line the reader acts on.

---

## SFDIPOT Dimension Coverage

_Coverage across each dimension of the SFDIPOT heuristic._

| Dimension    | Description                        | Status | Bugs Found | Notes |
|--------------|------------------------------------|--------|------------|-------|
| **Structure**   | UI layout, elements, visual hierarchy | tested / partial / not-tested | 0 | [notes] |
| **Function**    | Features work as expected             | tested / partial / not-tested | 0 | [notes] |
| **Data**        | Input handling, storage, retrieval    | tested / partial / not-tested | 0 | [notes] |
| **Interface**   | Interactions between components/APIs  | tested / partial / not-tested | 0 | [notes] |
| **Platform**    | Browser, OS, device compatibility     | tested / partial / not-tested | 0 | [notes] |
| **Operations**  | Performance, logging, error handling  | tested / partial / not-tested | 0 | [notes] |
| **Time**        | Timeouts, sessions, scheduling        | tested / partial / not-tested | 0 | [notes] |

---

## Page / Feature Coverage

_Detailed tracking of individual pages or features tested._

| Page / Feature | URL / Path | Status | Actions Tested | Bugs Found | Notes |
|----------------|------------|--------|----------------|------------|-------|
| [e.g., Login Page] | /login | tested / partial / not-tested | [e.g., valid login, invalid password, empty fields] | 0 | [notes] |
| [e.g., Dashboard] | /dashboard | tested / partial / not-tested | [e.g., load, filter, sort] | 0 | [notes] |
| [e.g., Settings] | /settings | tested / partial / not-tested | [e.g., update profile, change password] | 0 | [notes] |

---

## Test Tour Coverage

_Tracking which exploration tours were executed and their outcomes._

| Tour | Description | Status | Areas Covered | Bugs Found | Notes |
|------|-------------|--------|---------------|------------|-------|
| **Guidebook Tour**        | Follow documentation, verify stated behaviors  | completed / partial / not-started | [areas] | 0 | [notes] |
| **Money Tour**            | Test the most critical business features        | completed / partial / not-started | [areas] | 0 | [notes] |
| **Landmark Tour**         | Hit all major navigation points                 | completed / partial / not-started | [areas] | 0 | [notes] |
| **FedEx Tour**            | Follow data through the entire system           | completed / partial / not-started | [areas] | 0 | [notes] |
| **Garbage Collector Tour**| Test least-used features                        | completed / partial / not-started | [areas] | 0 | [notes] |
| **Bad Neighborhood Tour** | Revisit areas known for previous bugs           | completed / partial / not-started | [areas] | 0 | [notes] |
| **Supermodel Tour**       | Test with various screen sizes and viewports    | completed / partial / not-started | [areas] | 0 | [notes] |
| **Antisocial Tour**       | Provide invalid, unexpected, or hostile inputs  | completed / partial / not-started | [areas] | 0 | [notes] |
