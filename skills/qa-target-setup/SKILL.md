---
name: qa-target-setup
description: >
  Interactive setup for a new target application. Navigates to the URL, detects auth requirements,
  walks through login flow creation, auto-detects scope, and saves target config.
  Use when user says: "setup target", "add target", "configure app", "new target".
allowed-tools: Bash(playwright-cli:*), Bash(npx playwright-cli:*), Read, Write, Glob, Grep
---

# Target Application Setup

Interactive wizard to create a new target config in `data/targets/`.

## Flow

### 1. Gather Basic Info

Ask user for:
- **Target name** (slug for filename, e.g., "company-staging")
- **Base URL** (e.g., "https://staging.company.com")
- **Domain type** (ecommerce, saas, fintech, marketing, or auto-detect)

### 2. Navigate and Analyze

```bash
playwright-cli open <base_url>
playwright-cli snapshot
```

From the snapshot, detect:
- Is this a login page? (look for password fields, "Sign in" buttons)
- What's the main navigation structure?
- What kind of application is this? (helps auto-detect domain)

### 3. Handle Authentication

**If no login detected:**
- Set `auth.strategy: none`
- Skip to step 4

**If login detected:**

Ask user which auth strategy to use:

**Option A: Storage State (recommended)**
1. Ask user to provide env var names for credentials
2. Login via playwright-cli:
   ```bash
   playwright-cli snapshot  # Find form fields
   playwright-cli fill <email_ref> "$<username_env>"
   playwright-cli fill <password_ref> "$<password_env>"
   playwright-cli click <submit_ref>
   ```
3. Verify login succeeded (snapshot shows dashboard/profile)
4. Save state: `playwright-cli state-save .auth/<target-name>.json`
5. Set `auth.strategy: storage_state` with `state_file: ".auth/<target-name>.json"`

**Option B: Token**
1. Ask for token env var name and injection method (cookie/localStorage)
2. Set `auth.strategy: token`

### 4. Detect Scope

After login (or on the landing page):
```bash
playwright-cli snapshot
```

From the snapshot, identify:
- Top-level navigation sections → suggest as `start_pages`
- Suggest `include_patterns` based on URL structure
- Suggest `exclude_patterns` for common exclusions (/admin, /api, *.pdf)

Ask user to confirm/modify scope.

### 5. Configure Browser Settings

Suggest defaults:
- `headless: false` (so user can watch)
- `viewport: { width: 1280, height: 720 }`
- Ask if mobile testing is needed (add device emulation)

### 6. Safety Settings

Ask if this is a production environment:
- If yes: set `safety.read_only: true`, `safety.no_form_submit: true`
- If no: no safety restrictions

### 7. Save Config

Write `data/targets/<target-name>.yml` with all gathered configuration.

Close browser:
```bash
playwright-cli close
```

Update `.env.example` with any new env var names.

### 8. Confirm

Present the saved config to user:
- Target name and URL
- Auth strategy configured
- Scope defined
- How to use: `/qa-explore --target <target-name>`
