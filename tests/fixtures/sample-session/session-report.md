# Exploratory Testing Session Report -- Example App

## Session Info
- **Date:** 2026-03-28
- **Tester:** Principal QA Engineer
- **Application:** Example App (https://example.com)
- **Session ID:** sample-session
- **Duration:** ~25 minutes

---

## Executive Summary

Exploratory testing of the Example App login and dashboard features revealed 3 bugs. The most critical finding is an XSS vulnerability in the search component. The login form lacks input length validation, creating a potential denial-of-service vector. Overall the application handles the happy path well but breaks under adversarial input.

---

## Bugs Found

| Bug ID | Title | Severity | Category |
|--------|-------|----------|----------|
| BUG-001 | Password field accepts unlimited length causing potential DoS | High | Input Validation |
| BUG-002 | Stored XSS via search query parameter | Critical | Security |
| BUG-003 | Dashboard tooltip truncated in German locale | Low | i18n |

---

## Observations

- Page load time on dashboard averages 1.2s, acceptable but could be improved
- Error messages are generic and do not leak implementation details
- Session cookie is HttpOnly and Secure, good security practice

---

## Recommendations

1. **Fix XSS vulnerability** -- sanitize all user input rendered in HTML context (BUG-002)
2. **Add input length limits** -- enforce max-length on all text inputs server-side (BUG-001)
3. **Internationalization audit** -- review all UI text for truncation in longer locales (BUG-003)
