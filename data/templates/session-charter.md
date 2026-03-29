# Session Charter

```
CHARTER: Explore [target area]
WITH: [resources/tools/heuristics]
TO DISCOVER: [what we're looking for]
TIME BOX: [duration]
PRIORITY: [P0/P1/P2]
```

---

## Mission

_Clear, one-sentence statement of what this session aims to accomplish._

> [Describe the primary testing objective for this session.]

## Areas to Explore

_Specific pages, features, or flows to cover during this session._

- [ ] [Area 1 - e.g., Login flow]
- [ ] [Area 2 - e.g., Dashboard rendering]
- [ ] [Area 3 - e.g., Form validation on settings page]

## Heuristics to Apply

_Testing heuristics selected from the knowledge base to guide exploration._

- [ ] **SFDIPOT**: Structure, Function, Data, Interface, Platform, Operations, Time
- [ ] **Consistency**: Compare behavior across similar features
- [ ] **CRUD**: Create, Read, Update, Delete operations
- [ ] **Boundaries**: Edge values, empty states, limits
- [ ] **Interruptions**: Cancel mid-flow, navigate away, timeout
- [ ] **Input Variation**: Special characters, long strings, empty fields, SQL injection patterns
- [ ] [Add or remove heuristics as needed]

## Test Tours Selected

_Exploration strategies from the tours framework to follow._

- [ ] **Guidebook Tour**: Follow documentation, verify stated behaviors
- [ ] **Money Tour**: Test the most critical business features
- [ ] **Landmark Tour**: Hit all major navigation points
- [ ] **FedEx Tour**: Follow data through the entire system
- [ ] **Garbage Collector Tour**: Test least-used features
- [ ] **Bad Neighborhood Tour**: Revisit areas known for previous bugs
- [ ] [Add or remove tours as needed]

## Focus Constraints

_Boundaries for the session -- what is in scope and what is explicitly out of scope._

### In Scope

- [Feature/area 1]
- [Feature/area 2]

### Out of Scope

- [Feature/area excluded and reason]
- [Feature/area excluded and reason]

## Environment Notes

_Technical details about the testing environment._

| Property       | Value                          |
|----------------|--------------------------------|
| URL            | [target URL]                   |
| Browser        | [e.g., Chrome 125]            |
| Viewport       | [e.g., 1920x1080]             |
| OS             | [e.g., macOS 15.x]            |
| Auth State     | [e.g., logged in as test user] |
| Test Data      | [any pre-conditions or seeds]  |
| Tools Used     | [Playwright, DevTools, etc.]   |
