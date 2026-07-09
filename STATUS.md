# Project Status

Where Spired! is right now. Stage 0 — the engineering foundations — is essentially complete; the next work is the public, readable product. This file tracks what is built, in progress, and planned, so anyone reading knows where the project stands and where they could help.

The plan is ordered so the **readable, shareable product ships first**: the frontend is not a final phase — it enters at Stage 1, because the public page is the product. See [docs/](docs/) for the architecture, schema, and design decisions.

**Legend:** ✅ done · 🔨 in progress · ⬜ planned

## Current focus

Finishing the last Stage 0 item — a users-table corrections migration (soft-delete and email normalization) — and then starting Stage 1: the content catalogue backend and the first public, no-login content pages, hand-seeded with real entries and founder-written reviews.

## Stage 0 — Foundations and auth core

- ✅ Monorepo with npm workspaces (backend, frontend, shared)
- ✅ Local PostgreSQL via Docker (separate dev and test databases)
- ✅ SQL migration runner (transactional, tracks what has run)
- ✅ Continuous integration (GitHub Actions: type check and full test suite on every push and pull request)
- ✅ Structured logging (pino, with a per-request logger)
- ✅ Consistent JSON error envelope across all responses
- ✅ Password hashing (bcrypt); session tokens (JWT) in HttpOnly cookies
- ✅ Register, login, logout, current-user
- ✅ `requireAuth`, `requireRole` (checked fresh from the database), `requireOwnership`
- ✅ Secure response headers; rate limiting on the auth endpoints
- 🔨 Users-table corrections: soft-delete and email normalization (the final Stage 0 item)

## Stage 1 — The public, readable product

- ⬜ Content items and their category tables (games, supplements, adventures, actual plays, tools)
- ⬜ Tags, slugs, and content relations
- ⬜ Full-text search
- ⬜ Aggregate community ratings (as a computed view)
- ⬜ Public, server-rendered content pages, readable with no account
- ⬜ Public catalogue and search
- ⬜ Hand-seeded catalogue with founder-written reviews
- ⬜ Minimal frontend shell (layout, navigation, the pages above)

## Stage 2 — The contributor loop

- ⬜ One-tap ratings
- ⬜ Personal library (status and ownership per item), log entries, and reviews
- ⬜ Public profiles with basic stats
- ⬜ Ranked lists and tier lists
- ⬜ Onboarding taste-picker
- ⬜ Sign in with Discord
- ⬜ Content submission with an approve/reject moderation queue
- ⬜ Account recovery: email verification, password reset, change email / password (transactional email)

## Stage 3 — Retention and social

- ⬜ Follows
- ⬜ Personalised activity feed
- ⬜ Notifications
- ⬜ Likes on reviews and lists

## Stage 4 — Hardening, trust and safety, and launch

- ⬜ Reporting and flagging, block and mute, moderation tooling, admin audit log
- ⬜ Trusted-contributor role and richer role management
- ⬜ Account deletion and data export; session revocation ("log out everywhere")
- ⬜ Deploy hardening: migrations as a dedicated deploy step, split DB credentials, cross-site cookie and CORS lockdown, backups, error tracking, health checks
- ⬜ Deployment: backend and database on Railway, frontend on Vercel, custom domain

## Where you can help

Most product features are still to build, so the best entry points are:

- **Bug reports and ideas** through [issues](https://github.com/edobusy/spired/issues). If you spot something wrong or have a suggestion, open one.
- **Planned items** above (marked ⬜). If one interests you, open an issue to discuss it before starting, so we can agree on the approach.
- Look for the **good first issue** label if you are new to the project.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up and submit changes, and [docs/](docs/) for the architecture, schema, and design decisions.
