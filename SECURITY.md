# Security Policy

## Supported versions

Security fixes land in the latest minor release of `qualiow-exploratory-testing`. Versions
before 2.3.1 carry security issues that 2.3.1 fixed; upgrade to 2.3.1 or later.

## Reporting a vulnerability

Please report privately, not in a public issue or pull request.

Use GitHub private vulnerability reporting: open the repository's **Security** tab and choose
**Report a vulnerability**. Include the version, what you did, what you expected and what
happened, and, if you can, a minimal reproduction. Please leave out real credentials, tokens
and customer data.

This is a small, maintained-on-a-best-effort-basis project. Expect an acknowledgement within
about a week and a fix or a clear answer as soon as is practical; there is no bug bounty.
Please allow time for a fix to ship before you disclose publicly.

## Scope

In scope: the `qualiow` CLI, the guard hooks under `hooks/`, the skills and sub-agents that
ship with the package and plugin, the mobile and shell tooling under `bin/`, and anything that
could leak a credential, write outside `output/`, or run something the user did not approve.

Out of scope: vulnerabilities in the applications, sites or services you test with it, and
issues in third-party dependencies that have no effect through this package (report those
upstream).

## Operational rules

How a session is meant to behave (content is data, credentials never in output, production is
read-only, no external transmission) is in
[`data/security/SECURITY-POLICY.md`](data/security/SECURITY-POLICY.md). A way around one of
those rules is a reportable vulnerability.
