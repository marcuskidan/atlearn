# Security Policy

## Reporting a vulnerability

Email **marcuskidan@gmail.com** with the subject line "HKR security". Please
include steps to reproduce and, if relevant, which surface (the app, the
Firestore rules, or the GitHub Actions workflows) is affected. Best-effort
response within a week; please allow a reasonable window for a fix before
public disclosure. No bounty program — but reporters are credited (with
permission) in the fix's release notes.

## Scope

Highest-interest areas:
- **`firestore.rules`** — the entire server-side security boundary: role
  checks (overseer/maintainer), per-user data isolation, shape/size
  enforcement on community submissions.
- Stored user data: progress/notes documents in Firestore and localStorage.
- XSS via community-submitted text (all user text must pass through `esc()`
  before touching innerHTML — see CLAUDE.md).
- The landing pipeline: `tools/land.mjs`, the Actions workflows, and the
  service-account secret handling.

## Out of scope

Content disputes (use the in-app suggestion tools), link-rot reports, and
denial-of-service against the free-tier deployment.
