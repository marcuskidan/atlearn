# Security Policy

## Reporting a vulnerability

Email **marcuskidan@gmail.com** with the subject line "HKR security". Please
include steps to reproduce and, if relevant, which deployment (app origin or
API worker) is affected. Best-effort response within a week; please allow a
reasonable window for a fix before public disclosure. No bounty program — but
reporters are credited (with permission) in the fix's release notes.

## Scope

Highest-interest areas:
- Authentication: Google/Apple ID-token verification, HMAC session tokens,
  the DEV_MODE demo-token gate (`server/worker.js`).
- Authorization: overseer/maintainer role checks on moderation, merge,
  maintainer-assignment, dump, and overlay-clear endpoints.
- Stored user data: progress/notes documents in KV and localStorage.
- XSS via community-submitted text (all user text must pass through `esc()`
  before touching innerHTML — see CLAUDE.md).
- The GitHub PR bridge and its repo token.

## Out of scope

Content disputes (use the in-app suggestion tools), link-rot reports, and
denial-of-service against the free-tier deployment.
