# Domain: Identity & Access Platforms

Covers identity and account platforms **and** the internal admin consoles that
configure them (tenant/scope configuration, consent definitions, audit history).

## Priority Areas

1. **Audit Trail Integrity** - every change attributable, complete, ordered, immutable
2. **Identity Propagation** - the real human reaches the persisted record
3. **Consent & Privacy** - capture, versioning, data minimisation
4. **Configuration Correctness** - tenant isolation, validation, promotion
5. **Admin RBAC** - write gating enforced at the API, not just the UI
6. **Log & Data Hygiene** - no personal data leaking into logs or downstream platforms

## Feature Risk Ranking

| Tier | Features | Rationale |
|------|----------|-----------|
| P0 | Authentication, consent & privacy, audit trail integrity, tenant configuration, personal data handling | A gap here is a regulatory and incident-response failure, not a UX annoyance. |
| P1 | Registration journeys, account recovery, admin RBAC, config promotion | Core operator and end-user workflows; failure blocks the business. |
| P2 | Config search & filtering, notifications, reporting views | Supporting features; failure is friction. |
| P3 | Static help content, about/version pages | Informational. |

## Completeness Checklist

- [ ] Every state-changing action on identity or configuration data produces an audit record (who, what, when)
- [ ] Audit records are immutable — no update or delete path exists for the actor who wrote them
- [ ] Actor identity on an audit record is the authenticated user, never a service account or `unknown`
- [ ] Consent capture records purpose, version, timestamp and locale for every tenant
- [ ] Personal data is never written to application logs, traces or error payloads
- [ ] Admin writes are gated by role — a read-only operator cannot save configuration
- [ ] Configuration changes are scoped per tenant
- [ ] Config promotion between environments preserves the audit chain and does not rewrite authorship
- [ ] Deletion of a configuration entity is auditable and reversible via the audit trail
- [ ] Every environment has the same audit guarantees — ephemeral envs are not a special case

## Data Integrity Checks

> After every state-changing action in an identity system, verify these.

1. **Audit entry exists per change** — exactly one record per modified item. Not zero, not duplicated.
2. **Actor is correct** — equals the logged-in user's identity; not `unknown`, not the previous editor, not a service role.
3. **Timestamp ordering holds** — two rapid changes produce two distinct, ordered records; neither overwrites the other.
4. **Snapshot fidelity** — the stored post-change snapshot matches the config store field for field.
5. **Delete attribution** — a deletion names the deleter, not the last editor.
6. **Tenant isolation** — changing tenant A produces records only for tenant A.
7. **No silent loss** — a downstream failure surfaces (error, DLQ, alarm); it never disappears behind a success response.
8. **Personal data containment** — audit record, log stream and error path carry no personal data beyond what the design authorises.

## Cross-Feature Journeys

### Journey 1: Config Change to Audit Trail
`Login → Open tenant config → Change one field → Save → Verify config store → Verify audit record → Verify actor/timestamp/snapshot/version`
- Verify: attributable, chronologically sortable, matches the config store exactly.

### Journey 2: Rapid Successive Edits
`Open config → Save change 1 → Immediately save change 2 → Query audit store`
- Verify: **two** distinct records with distinct sort keys. Same-second collisions are a classic audit-loss bug.

### Journey 3: Delete and Attribute
`Login as A → Edit and save → Logout → Login as B → Delete → Query audit store`
- Verify: the deletion record names **B**.

### Journey 4: Degraded Identity
`Trigger a write where the token carries no identity claim`
- Verify: rejected, or recorded with an explicit flag and an alert. `unknown` actors must never be silently accepted.

## Testing Guidance

The strongest bugs in this domain are **absences**: the audit record that was never
written, the permission that was never checked, the cleanup that was never run.

Never accept "the happy path wrote a record" as evidence the audit trail works.
Test the failure path, the same-second path, the delete path, and the
missing-identity path — that is where audit trails actually break.

**Heuristic focus:**
- **SFDIPOT** — Data (stored vs should-be), Operations (who may write), Time (ordering, collisions, skew)
- **FEW HICCUPPS** — Claims (does it do what the ticket claims?), Standards (data protection law, least privilege), Product (does the producer match the consumer's contract?)

## Compliance

- **Data protection law** — lawful basis, consent records, right to erasure, data minimisation on audit payloads
- **Audit Trail Integrity** — attributable, tamper-evident, retained for the stated period
- **Least Privilege** — producers hold write-only; readers are separate principals
- **Encryption** — at rest with managed keys, in transit end to end
- **Log Hygiene** — no personal data or credentials in logs; production log levels constrained
- **Separation of Environments** — ephemeral/dev data never mixed with production
