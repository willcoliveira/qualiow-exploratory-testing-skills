# Domain: SaaS (Software as a Service)

## Priority Areas

1. **Authentication & Authorization** - Login flows, MFA, session security
2. **Role-Based Access Control** - Permissions enforced at every level
3. **Multi-Tenancy** - Strict data isolation between organizations
4. **Billing & Subscriptions** - Plan management, upgrades, downgrades, cancellations
5. **Data Integrity** - Export, import, backup, and consistency across views
6. **Onboarding** - First-time user experience, setup wizards, guided tours
7. **API Integrations** - Third-party connections, webhooks, OAuth flows

## Feature Risk Ranking

| Tier | Features                                                  | Rationale                                                        |
|------|-----------------------------------------------------------|------------------------------------------------------------------|
| P0   | Authentication, permissions/RBAC, data CRUD, billing      | Security breaches, unauthorized access, data loss, or billing errors are existential risks. |
| P1   | Dashboard, search, data export                            | Core daily workflows. Broken dashboards or export = users cannot do their job. |
| P2   | Settings, notifications, integrations                     | Supporting features. Failure is annoying but does not block primary tasks. |
| P3   | Help center, about page, changelog                        | Informational. Rarely impacts user workflows or business outcomes. |

## Completeness Checklist

> Minimum features a SaaS application should have. Verify these exist and function before deep-testing.

- [ ] Role-based access control enforced (admin vs member vs viewer at minimum)
- [ ] Multi-tenancy isolation -- user cannot see another organization's data
- [ ] Data export available (CSV, JSON, or PDF for key data)
- [ ] Audit log present for sensitive actions (who did what, when)
- [ ] Session management -- timeout, concurrent session handling, logout
- [ ] Account deletion or deactivation flow exists
- [ ] Empty states for all list views (new account with no data shows guidance, not a blank page)
- [ ] Onboarding flow or first-use guidance for new users
- [ ] Billing/subscription page shows current plan, usage, and upgrade path
- [ ] Settings page allows profile, notification, and security configuration

## Data Integrity Checks

> After every state-changing action in SaaS, verify these.

1. **Created item appears in list** -- After creating any entity (project, record, user, etc.), it should immediately appear in the relevant list/table view with correct data.
2. **Edited fields persist after reload** -- Edit an item, save, reload the page. Every changed field should retain its new value. Check all field types (text, dates, dropdowns, toggles).
3. **Deleted items do not appear** -- After deletion, the item should vanish from all list views, search results, dashboards, and reports. Check that direct URL access to the deleted item returns a proper 404 or "not found" message.
4. **Data isolated between tenants/users** -- Switch to a different user account or organization. The created/edited/deleted item should NOT be visible. Verify in list views, search, API responses, and exports.
5. **Aggregations update** -- Dashboard counts, totals, and charts should reflect the change immediately (or after a documented refresh interval).
6. **Audit trail records the action** -- If an audit log exists, verify the create/edit/delete action is logged with correct timestamp, user, and details.

## Cross-Feature Journeys

> End-to-end flows that cross feature boundaries. Bugs often hide at the seams.

### Journey 1: Full Data Lifecycle
`Register -> Complete Onboarding -> Create Item -> Edit Item -> Delete Item -> Verify Empty State`
- Verify: onboarding completes and does not reappear, created item is visible everywhere, edits persist, deletion is clean with no orphaned references, empty state is shown.

### Journey 2: Role-Based Access Verification
`Login as Admin -> Change User Role to Viewer -> Logout -> Login as Viewer -> Verify Read-Only Access -> Logout -> Login as Admin -> Restore Role`
- Verify: role change takes effect immediately, viewer cannot create/edit/delete, UI hides write controls AND API rejects write attempts, role restoration works cleanly.

### Journey 3: Billing and Feature Gating
`Login -> View Current Plan -> Upgrade Plan -> Verify New Features Unlocked -> Downgrade Plan -> Verify Features Locked`
- Verify: plan change reflects in billing page, new features are immediately accessible after upgrade, downgrade restricts access without data loss.

## Must-Test Patterns

### Authentication
- Email and password login
- Social login (Google, GitHub, SSO providers)
- Multi-factor authentication setup and verification
- Magic link login flow
- Password reset with email verification
- Session timeout and re-authentication prompts
- Concurrent session limits (same user, multiple devices)
- Account lockout after failed attempts
- SSO/SAML integration for enterprise accounts
- Token refresh and expiration handling

### Authorization & Roles
- Admin can access all features
- Member restricted from admin-only pages
- Viewer cannot modify data (read-only enforcement)
- Custom role creation and assignment
- Permission changes take effect immediately (no stale cache)
- API endpoints enforce same permissions as UI
- Shared links respect permission boundaries
- Invitation flow assigns correct role
- Role downgrade removes access to restricted features
- Owner transfer flow

### Multi-Tenancy
- User A cannot see User B's data (different organizations)
- Switching between organizations loads correct data
- Search results scoped to current organization only
- API responses never leak cross-tenant data
- Shared resources (templates, integrations) scoped correctly
- Organization deletion removes all associated data
- Subdomain or workspace slug routing to correct tenant
- Invitation to wrong organization prevented
- Audit logs scoped to correct organization

### Dashboards & Data Views
- Dashboard loads with correct data for the current user
- Widgets display accurate numbers (totals, averages, counts)
- Date range filters update all widgets consistently
- Real-time data updates (if applicable) without full reload
- Empty states for new accounts with no data
- Large dataset performance (1000+ records in tables)
- Sort, filter, and pagination on data tables
- Export matches what is displayed on screen
- Chart tooltips show correct values
- Dashboard customization persists across sessions

### Data Export & Import
- CSV export contains all visible columns
- Export with filters applied exports only filtered data
- Large export does not time out (background job with download link)
- CSV import with valid data
- Import with missing required fields (error handling)
- Import with duplicate records (merge or skip strategy)
- Import encoding issues (UTF-8, special characters)
- PDF report generation accuracy
- API data export matches UI data

### Settings & Configuration
- Organization settings saved and applied
- User profile settings (name, avatar, timezone, language)
- Notification preferences (email, in-app, push)
- Integration settings (connect, disconnect, reconfigure)
- Billing settings accessible only to billing admins
- Danger zone actions (delete account, reset data) require confirmation
- Settings changes propagate to all active sessions

### Billing & Subscriptions
- Plan selection and upgrade flow
- Downgrade with feature restriction warnings
- Trial expiration behavior (grace period, feature lockout)
- Payment method add, update, remove
- Invoice history and download
- Proration calculation on mid-cycle plan change
- Cancellation flow with retention offer
- Reactivation after cancellation
- Failed payment retry and dunning notifications
- Seat-based pricing (add/remove seats updates billing)
- Annual vs monthly billing toggle

### API & Integrations
- OAuth connection flow (connect, authorize, callback)
- API key generation and revocation
- Webhook delivery and retry on failure
- Rate limiting behavior (correct error codes and headers)
- API pagination consistency
- API error responses follow documented format
- Third-party integration data sync accuracy
- Disconnecting integration cleans up related data
- API versioning (deprecated endpoints still work or return clear error)

### Onboarding
- First login guided tour or setup wizard
- Skip onboarding option
- Onboarding checklist progress tracking
- Sample data population for new accounts
- Invite team members during onboarding
- Onboarding completion state persists
- Re-trigger onboarding from settings

### Notification System
- Email notifications delivered for configured events
- In-app notification bell shows unread count
- Mark as read and mark all as read
- Notification links navigate to correct resource
- Notification preferences respected (no unwanted emails)
- Real-time notifications (WebSocket or polling)
- Notification for mentions and assignments
- Digest email frequency settings

## Common Bugs

- **Permission escalation** - User discovers admin endpoint via URL manipulation, API does not check permissions on update/delete, role change cached and stale
- **Data leakage between tenants** - Search index not scoped, autocomplete suggests other tenant's data, export includes cross-tenant records, error messages reveal other tenant info
- **Broken role-based access** - New feature added without permission check, UI hides button but API allows action, permission matrix incomplete for custom roles
- **Billing edge cases** - Double charge on retry, downgrade does not reduce invoice, cancelled account still charged, proration math incorrect
- **Session management** - Token not invalidated on password change, session persists after role removal, refresh token reuse after revocation
- **Onboarding state bugs** - Wizard reappears after completion, skip does not properly set all defaults, onboarding blocks access to needed features
- **Data consistency** - Dashboard totals do not match detail view, export numbers differ from UI, cached aggregations stale after data change
- **Integration failures** - OAuth token expired silently, webhook payload format changed, rate limit not communicated to user, disconnected integration still sends data
- **Multi-device conflicts** - Same record edited on two devices, last write wins without warning, real-time sync delays cause confusion

## Compliance Requirements

- **SOC 2 Type II** - Access controls, audit logging, data encryption at rest and in transit
- **GDPR** - Data portability (export), right to erasure, consent management, DPA availability
- **CCPA** - California consumer data rights, opt-out of data sale
- **HIPAA** (if health data) - BAA availability, PHI encryption, access logging
- **ISO 27001** - Information security management practices
- **Accessibility (WCAG 2.1 AA)** - All core workflows usable by keyboard and screen reader
- **Audit Trail** - All data modifications logged with timestamp, user, and action
- **Data Residency** - Data stored in region matching customer requirements
