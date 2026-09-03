# API Probe Matrix

> CONFIDENTIAL — internal QA artifact. Contains endpoint behaviour and environment
> configuration. Keep local. Redact response bodies before saving.

## Session Reference

| Property        | Value                                   |
|-----------------|-----------------------------------------|
| Session ID      | [e.g., SESSION-2026-03-28-001]          |
| Ticket          | [ticket id, or "none"]                  |
| Endpoint        | [`POST /api/v1/…` — note the verb]      |
| Date            | [YYYY-MM-DD]                            |
| Observation mode| [in-page fetch / out-of-browser request / unauthenticated] |
| Identity        | [role or persona used — never a credential] |

---

## Environment Fingerprint

Fill this in **before** the matrix. Without it the results below are uninterpretable.

| Component        | Environment A `[name]` | Environment B `[name]` |
|------------------|------------------------|------------------------|
| Frontend build   | [build id / date]      | [build id / date]      |
| API build        | [build id / commit]    | [build id / commit]    |
| Service under test | [build id / commit]  | [build id / commit]    |
| Changed path selected? | [yes / no — name the flag or config that decides it] | [yes / no] |
| Commit under test deployed? | [ancestor / not an ancestor] | [ancestor / not an ancestor] |

> **Same build, different behaviour ⇒ configuration, not deploy lag.**
> If the changed path is not selected in an environment, every AC that depends on it is
> `NOT-REACHABLE` there — not `PASS`, not `FAIL`.

---

## Cases

One row per case. The **label** is the stable identifier the report, the bug and the
re-run all refer to. Record passes as well as failures — a matrix of only failures
cannot show a regression later.

| # | Label | Request | Expected | Env A: status / count / rows | Env B: status / count / rows | Verdict |
|---|-------|---------|----------|------------------------------|------------------------------|---------|
| 1 | identity | `{"query":"<known value>"}` | 200, stable non-zero | 200 / 77 / 20 | 200 / 91 / 20 | ✅ |
| 2 | empty string | `{"query":""}` | 400 + error body | | | |
| 3 | body absent | `{}` | 400 + error body | | | |
| 4 | metachar — lone `(` | `{"query":"("}` | 400 or escaped 200 | | | |
| 5 | limit above cap | `?limit=<cap+1>` | 400, or capped | | | |
| 6 | invalid enum | `{"filter":["<nonsense>"]}` | 400 + error body | | | |
| 7 | second identity | same request, other user | scoped result | | | |

> **Compare status codes and shapes. Never compare absolute counts** — different
> environments hold different data and it drifts between runs.

### Case families to cover

Boundary lengths · tokenisation and whitespace · metacharacters of the underlying query
language · empty / null / absent / whitespace-only · enum values valid, invalid, empty,
wildcard, injected · pagination bounds and types · type confusion · casing and
normalisation · second identity and second scope.

---

## Findings

One row per finding, not one per failing case — a family of inputs failing on the same
character is **one** bug with several examples.

| ID | Cases | Finding | Surface | Severity | Bug report |
|----|-------|---------|---------|----------|------------|
| F1 | 4, 9–14 | [what is wrong, in one line] | API / UI / both | High | `bugs/BUG-0xx-….md` |

**Surface** classifies where the defect lives, from the differential pass:

| Surface | Meaning | Owner |
|---------|---------|-------|
| **Both** | The UI faithfully reflects the endpoint | Service |
| **API only** | Real defect the client's guard is hiding — reachable by every other client | Service |
| **UI only** | The client invents or masks behaviour the service does not have | Client |
| **Neither** | Environment or access noise, not a product defect | — |

---

## Evidence

| File | Contents |
|------|----------|
| `evidence/fingerprint.md` | Build ids, flag values, commit ancestry |
| `evidence/<case-set>-raw.json` | Raw per-case output, redacted |
| `probes/<probe>.js` | The probe script, so this is repeatable |

---

## Notes and Open Questions

- [What could not be checked, and exactly what access would unblock it]
- [Which environment would answer a `NOT-REACHABLE` verdict]
- [Counts recorded here are valid for the date above only]
