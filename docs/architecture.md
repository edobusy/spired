# Architecture

This document describes the system design. For what is built today versus what is still planned, see [STATUS.md](../STATUS.md).

## Overview

Spired! is a web application split into three parts that each do one job: a frontend that draws the interface, a backend that handles logic and data, and a database that stores everything. They live in a single repository (a monorepo) but stay clearly separated, so each part is easy to understand and work on on its own.

## The three parts

**Frontend.** The part users see. Built with Next.js (a React framework). It draws pages, handles navigation, and calls the backend when it needs data. It never talks to the database directly.

**Backend.** The layer between the frontend and the database. Built with Hono, a lightweight Node.js framework. It receives requests, runs the logic, queries the database, and sends data back. All business logic lives here.

**Database.** The permanent store for users, games, reviews, lists, and follows. Built on PostgreSQL. It runs locally in a Docker container during development.

## Repository layout

```
spired/
├── package.json          npm workspaces root, ties the packages together
├── docker-compose.yml    local Postgres (dev on :5432, test on :5433)
├── .env.example          template listing every environment variable
├── docs/                 public design documentation (this folder)
├── shared/               TypeScript types shared by frontend and backend
├── backend/
│   └── src/
│       ├── index.ts          entry point: run migrations, start the server
│       ├── app.ts            the Hono app and its routes
│       ├── config.ts         reads and validates environment variables
│       ├── db/
│       │   ├── client.ts     opens the database connection
│       │   ├── migrate.ts    applies migration files on startup
│       │   └── migrations/   numbered SQL files that define the schema
│       ├── routes/           one file per feature area (auth, ...)
│       ├── middleware/       auth, rate limiting, request logging
│       └── lib/              password hashing, token creation
└── frontend/             the Next.js app (not started yet)
```

## How a request flows

When a user opens a page:

1. The browser asks the frontend for the page.
2. The frontend asks the backend for the data it needs.
3. The backend queries the database.
4. The database returns the data.
5. The backend returns it to the frontend.
6. The frontend draws the page.

## Authentication and authorization

**Login.** The backend checks the email and password against the database. If they match, it creates a signed token (a JWT) and stores it in an HttpOnly cookie. The browser sends that cookie automatically on every later request, so the backend always knows who is asking. Logout clears the cookie.

The cookie is HttpOnly (JavaScript cannot read it, which blocks token theft through XSS), SameSite=Lax, marked Secure in production, and lasts 30 days.

**Authorization** is handled by three small gates that stack together:

- `requireAuth` answers "are you logged in?" and blocks anyone without a valid session.
- `requireRole` answers "are you an admin or moderator?" It checks roles fresh from the database on every request, so access can be revoked instantly.
- `requireOwnership` answers "is this yours to change?" by comparing the logged-in user against the resource's owner.

Because they stack, a route like "delete a review" can require login, then allow it only if you are the author or a moderator.

## Database migrations

The schema is defined and changed through numbered SQL files called migrations. Each file describes one set of changes.

- On startup, any migration that has not run yet is applied, in order, inside a transaction.
- Migrations that have already run are skipped.
- A migration file is never edited after it has run. New changes go in a new file.

This keeps the full history of the schema in version control, and any developer can build a fresh database from scratch just by starting the app.

> Note: running migrations on startup is a deliberate shortcut for the current single-instance setup. Before running more than one instance in production, migrations will move to a dedicated deploy step and the app will only check the schema version on boot.

## Logging

Every request is logged as a structured JSON line, so a log service can search and group entries rather than scanning free text. Each request is tagged with a unique id, which means all the lines belonging to one request can be pulled together when tracing a problem, and each records the method, path, status code, and how long the request took. Unexpected server errors are logged too; expected refusals (a bad login, a rate-limited request) are not, so genuine failures stand out.

Logging goes through pino. In development the output is piped through a formatter (`pino-pretty`) so it reads as clean, colorized lines; in production it stays raw JSON for a log service to ingest. A single `LOG_LEVEL` setting controls how much is shown: `info` in normal use, `debug` when investigating, `silent` during tests.

## Shared types

The `shared` package holds TypeScript types that both sides agree on: what a `User` is, what a `ContentItem` is, and so on. Writing them once keeps the frontend and backend from drifting apart.

## Stack summary

| Part | Technology | Why |
|---|---|---|
| Frontend | Next.js (React) | Server rendering for fast first loads and good SEO on public profiles |
| Backend | Hono (Node.js) | Small, fast, and TypeScript-first |
| Database | PostgreSQL | Reliable, open-source, excellent for relational data |
| DB client | postgres.js | Thin library for raw SQL, no hidden magic |
| Auth | JWT in HttpOnly cookies | Secure, stateless, no third-party dependency |
| Dev database | Docker | Isolated, easy to reset, no cloud account needed |
| Monorepo | npm workspaces | One install, one repo, shared types |

## Planned

These are part of the design but not built yet:

- **Image uploads (Cloudflare R2).** Avatars and cover art upload straight from the browser to R2 using a short-lived presigned URL, so large files never pass through the backend.
- **Search (Postgres full-text).** A `tsvector` column on content, indexed from its migration. No extra search service for v1.
- **Deployment.** Frontend on Vercel, backend and database on Railway. Deferred until the app is worth deploying.

## Environment variables

All secrets and environment-specific values live in `.env` (gitignored). `.env.example` is committed and lists every variable so a new developer knows what to fill in.

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_TEST_URL` | Connection string for the test database |
| `JWT_SECRET` | Secret used to sign and verify JWTs. Must be long and random. |
| `CORS_ORIGIN` | The frontend origin the backend allows |
| `PORT` | Port the backend listens on |
| `LOG_LEVEL` | How much logging to emit (`debug`, `info`, `warn`, `error`, `silent`). Defaults to `info`. |
| `R2_*` | Cloudflare R2 credentials (for planned image uploads) |
