# Spired!

**Letterboxd for tabletop RPGs.** Log the games you have played, rate them, write reviews, build lists, and follow the people whose taste you trust.

[![CI](https://github.com/edobusy/spired/actions/workflows/ci.yml/badge.svg)](https://github.com/edobusy/spired/actions/workflows/ci.yml)

> 🚧 **Status: backend in active development.** The API and its foundations are being built and tested feature by feature. The frontend has not started yet. See [STATUS.md](STATUS.md) for a full breakdown of what is built, in progress, and planned.

## The problem

Tabletop RPGs are having a moment, but there is no good place to keep track of them. Film has Letterboxd. Books have Goodreads. Tabletop games have scattered forums, wikis, and spreadsheets.

Spired! is that missing home. You log what you have played, rate it from 1 to 10 (shown as spires, not stars), review it, and organise it into lists — and everything you make lives on a clean public page you can share with no login wall. The product is built around a simple loop: read, rate, review, list, share. Following the curators whose taste you trust comes as the community grows.

## Tech stack

The stack was chosen to stay light, stay explicit, and be easy to reason about.

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | [Hono](https://hono.dev) on Node.js (TypeScript) | Small, fast, and typed. The whole app collapses into one request-to-response function, which makes it easy to test. |
| Database | PostgreSQL | Relational data fits the domain. Full-text search is built in, so no extra search service for v1. |
| DB access | [postgres.js](https://github.com/porsager/postgres) with raw SQL | No ORM. Every query is visible and parameterised, so there is no hidden behaviour and no SQL injection. |
| Auth | JWT stored in an HttpOnly cookie | Stateless sessions. HttpOnly keeps the token out of reach of JavaScript, which blocks XSS token theft. |
| Frontend (planned) | Next.js (React) | Server rendering for fast first loads and good SEO on public profiles. |
| Repo | npm workspaces monorepo | Backend, frontend, and shared code live together with one install. |

## Architecture

Spired! is a monorepo with three workspaces:

- `backend/` - the Hono API, database client, migrations, and tests.
- `frontend/` - the Next.js app (scaffold only for now).
- `shared/` - types shared between the two.

The backend is layered: routes handle HTTP, middleware handles cross-cutting concerns (auth, rate limiting, logging), and a thin data layer talks to Postgres with raw SQL. Database changes are applied by a small migration runner that tracks what has already run and applies each migration inside a transaction.

For the full picture, see [`docs/architecture.md`](docs/architecture.md) and the database design in [`docs/schema.md`](docs/schema.md).

## Engineering highlights

This is a portfolio project, so the goal is production-grade code, not the shortest path. Every decision and trade-off is written up in [`docs/decisions.md`](docs/decisions.md). A few things worth calling out:

- **Test-driven throughout.** Every feature starts with a failing test (vitest), then the code to pass it. Tests run against a real Postgres database, isolated per test.
- **Security-first auth.** Passwords are hashed with bcrypt at a deliberate cost factor. Sessions use signed JWTs in HttpOnly cookies. Login and register are rate limited, and every response ships secure headers.
- **A real authorization layer.** Three composable gates: `requireAuth` (are you logged in), `requireRole` (are you an admin or moderator), and `requireOwnership` (is this yours to change). Roles are checked fresh from the database, so access can be revoked instantly.
- **Continuous integration.** Every push and pull request runs a type check and the full test suite against a Postgres service container. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **Structured logging.** Requests are logged with pino, and each request carries its own logger so logs can be traced end to end.

## Getting started

You need [Node.js 22.6 or newer](https://nodejs.org) (for native TypeScript execution) and [Docker](https://www.docker.com/products/docker-desktop/).

```bash
# 1. Clone and install
git clone https://github.com/edobusy/spired.git
cd spired
npm install

# 2. Set up environment variables
cp .env.example .env
# then open .env and set a value for JWT_SECRET

# 3. Start the databases (dev on :5432, test on :5433)
docker compose up -d

# 4. Run the API (migrations apply automatically on startup)
npm run dev:backend
```

The API now listens on `http://localhost:4000`. Check it is alive:

```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

Run the tests:

```bash
npm test          # watch mode
npm run test:run  # run once
```

## Roadmap

The foundations are built. [STATUS.md](STATUS.md) has the live, detailed breakdown. The plan is ordered so the readable, shareable product ships first — nobody is drawn in by a backend they cannot see, so the frontend is not a final phase; it enters at Stage 1.

**Stage 1 — a public, readable product**
- The content catalogue (games, supplements, adventures, actual plays, tools), with tags, search, and aggregate community ratings.
- Public, server-rendered content pages readable with no account, and a hand-seeded catalogue with founder reviews.

**Stage 2 — the contributor loop**
- One-tap ratings, reviews, a personal library, and lists and tier lists.
- Sign in with Discord, and email account recovery (verification, password reset, change email/password).

**Stage 3 — retention and social**
- Follows, a personalised activity feed, notifications, and likes.

**Stage 4 — hardening and launch**
- Trust and safety, account deletion and data export, and the deploy pipeline (Vercel and Railway).

## Contributing

Contributions are welcome, whether that is a bug report, an idea, or a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up the project and submit changes, and please open an [issue](https://github.com/edobusy/spired/issues) before starting anything substantial. This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
