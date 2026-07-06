# Project Status

Where Spired! is right now. The backend is in active development; the frontend has not started. This file tracks what is built, what is in progress, and what is still to come, so anyone reading knows where the project stands and where they could help.

**Legend:** ✅ done · 🔨 in progress · ⬜ planned

## Current focus

The engineering foundations (security, authentication, authorization, CI, logging) are essentially complete. They were built before product features so that everything which follows inherits them instead of retrofitting. The next piece of work is a users-table corrections migration (soft-delete and email normalization), after which the content and library features begin.

## Foundations

- ✅ Monorepo with npm workspaces (backend, frontend, shared)
- ✅ Local PostgreSQL via Docker (separate dev and test databases)
- ✅ SQL migration runner (transactional, tracks what has run)
- ✅ Continuous integration (GitHub Actions: type check and full test suite on every push and pull request)
- ✅ Structured logging (pino, with a per-request logger)
- ✅ Consistent JSON error envelope across all responses

## Authentication

- ✅ Password hashing (bcrypt)
- ✅ Session tokens (JWT) in HttpOnly cookies
- ✅ Register, login, logout
- ✅ Current-user endpoint
- ⬜ Email verification
- ⬜ Password reset and change email / password
- ⬜ Account deletion and data export
- ⬜ Session revocation ("log out everywhere")
- ⬜ "Sign in with Discord" (OAuth)

## Authorization and security

- ✅ `requireAuth` (are you logged in)
- ✅ `requireRole` (role-based access, checked fresh from the database)
- ✅ `requireOwnership` (is this resource yours)
- ✅ Secure response headers
- ✅ Rate limiting on the auth endpoints
- ⬜ Users-table corrections: soft-delete and email normalization (next up)

## Content catalogue

- ⬜ Content items and their category tables (games, supplements, adventures, actual plays, tools)
- ⬜ Tags and slugs
- ⬜ Submission and moderation (approve / reject)
- ⬜ Full-text search
- ⬜ Aggregate community ratings

## Library, logs, and reviews

- ⬜ Personal library (status and ownership per item)
- ⬜ Log entries (the session diary)
- ⬜ Reviews

## Social

- ⬜ Follows
- ⬜ Activity feed
- ⬜ Block and mute
- ⬜ Notifications

## Lists

- ⬜ Ranked lists
- ⬜ Tier lists

## Trust and safety

- ⬜ Reporting and flagging of content and reviews
- ⬜ Moderation tooling
- ⬜ Admin audit log

## Frontend

- ⬜ Not started. The Next.js scaffold exists, but no pages yet: catalogue and search, content detail, user profiles, auth pages, notifications, and an admin dashboard are all to come.

## Deployment

- ⬜ Move migrations to a dedicated deploy step (out of app startup)
- ⬜ Backend and database on Railway, frontend on Vercel
- ⬜ Custom domain, plus production cookie and CORS hardening

## Where you can help

Most product features are still to build, so the best entry points are:

- **Bug reports and ideas** through [issues](https://github.com/edobusy/spired/issues). If you spot something wrong or have a suggestion, open one.
- **Planned items** above (marked ⬜). If one interests you, open an issue to discuss it before starting, so we can agree on the approach.
- Look for the **good first issue** label if you are new to the project.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up and submit changes, and [docs/](docs/) for the architecture, schema, and design decisions.
