# Design Decisions

The record of why Spired! is built the way it is, and the trade-offs knowingly accepted along the way. Each entry states the decision, the reasoning, the alternatives rejected, and (where the choice is a deliberate shortcut) the condition that would make us revisit it.

## Tech stack

### TypeScript everywhere

**Decision:** TypeScript on frontend, backend, and shared code.
**Why:** One `User` type defined once in `shared/` and imported by both sides means the two cannot silently drift apart. A mismatch becomes a compile error, not a production bug.
**Trade-off:** A compile/strip step between writing code and running it.

### Monorepo (npm workspaces)

**Decision:** `frontend`, `backend`, and `shared` as three packages under one repo, one `npm install`.
**Why:** The `shared` package is imported directly by both sides with no publishing step.
**Alternatives:** Separate repos (would force publishing `shared` as a package); Turborepo (adds caching and pipelines not needed yet).
**Trade-off:** All three packages share one dependency tree. Fine at this size.

### Hono (backend framework)

**Decision:** Hono as the HTTP framework.
**Why:** TypeScript-first, minimal, and transparent. It does not hide what is happening. Good cookie and middleware support.
**Alternatives:** Express (aged, not TS-native), Fastify (fine), NestJS (too much abstraction for this project).
**Trade-off:** Smaller ecosystem than Express, so some integrations are wired up by hand (see the node-server adapter below).

### PostgreSQL (database)

**Decision:** PostgreSQL.
**Why:** The data is inherently relational (users to reviews to content items, and content-to-content relations). Postgres also provides full-text search, UUID keys, check constraints, and generated columns out of the box.
**Alternatives:** MySQL (weaker advanced features), SQLite (too simple for concurrent networked use), MongoDB (a document model fights relational data).
**Trade-off:** A schema to design and migrate up front, rather than schemaless flexibility.

### postgres.js, raw SQL, no ORM

**Decision:** The `postgres.js` client, with SQL written by hand.
**Why:** The SQL is explicit and visible. There is no generated-query black box, and every query is parameterised (so it is safe from SQL injection).
**Alternatives:** Prisma or Drizzle. Great for shipping fast on a team, but they hide the query.
**Trade-off:** We write and maintain our own SQL and a light type mapping, instead of getting them generated.

### Vitest (testing)

**Decision:** Vitest as the test runner.
**Why:** Fast, zero-config for TypeScript, Jest-compatible API.

## Runtime

### Node over Bun or Deno

**Decision:** Run the backend on Node.js, not Bun or Deno.
**Why:** Maturity and ecosystem (almost every library works, and almost any bug has already been hit and solved); transferable and employable (Node knowledge matches the majority of real backend work); first-class hosting (Railway treats Node as the default path). The runtime fundamentals worth learning (engine, event loop, modules, the call stack) are the same across all three anyway.
**Trade-off:** Node has no built-in web-standard HTTP server, so Hono needs the `@hono/node-server` adapter to bridge Node's native networking to web-standard `Request`/`Response`. On Bun or Deno that adapter would be unnecessary. One extra dependency for Node's maturity, worth it.

### Native TypeScript execution, no build step

**Decision:** Run `.ts` files directly with Node's type stripping, never compile to JS (`noEmit: true`).
**Why:** The simplest possible dev loop. No separate build artifact, no `dist/` folder, edit and run.
**Trade-off:** Requires Node 22.6 or newer. Type stripping only removes annotations, it does not type-check, so type-checking is a separate `tsc --noEmit` and editor concern.

## Database

### Migrations run on application startup (deliberate shortcut)

**Decision:** For now, the backend runs the migration script as part of booting. Already-applied migrations are skipped (each is recorded in `schema_migrations`), and each runs inside a transaction, so re-running is idempotent.
**Why for now:** It is the simplest setup at current scale (a single instance, run by hand). One command starts everything and you cannot forget to migrate.
**The production-standard alternative:** run migrations as a separate, explicit step in the deploy pipeline, before the app goes live. The app may then check the schema is at the expected version on boot, but does not apply migrations itself.
**Why startup-migration breaks down at scale:**

1. **Multiple instances race.** In production you run several copies of the backend side by side. If they all boot at once and each tries to migrate, they collide. Idempotent is not the same as safe to run concurrently for the first time.
2. **It couples two different events.** App startup is routine and repeated; a migration is a one-time, irreversible schema change. Welded together, a bad migration can crash-loop the app.
3. **Permissions.** The running app should connect with a restricted account (read and write data, not alter structure). Migrating on boot forces the app's everyday credentials to also hold schema-altering power.
4. **Deploy control.** Zero-downtime deploys want migrations to run at one controlled moment, not whenever individual copies happen to boot.

CI confirmed the race is real, not theoretical: the first CI run failed because parallel test files ran concurrent migrations against a fresh database and collided on `CREATE EXTENSION IF NOT EXISTS` (which is not atomic). The test-level fix was to run test files serially. The production fix is the separation described above.
**Status:** Deliberate shortcut, acceptable only because we run one instance with one database account.
**Revisit when:** we run more than one backend instance, set up a real deploy pipeline, or split the database into separate app and migration credentials. Then lift migrations out of startup into a dedicated deploy step.

### Database rows are statically typed, not runtime-validated

**Decision:** Annotate query results with TypeScript generics to get a real type on each row, but do not run rows through zod (or any runtime validation) on the way out of the database.
**Why:** Validation belongs at the trust boundary, where data crosses in from somewhere we do not control (HTTP request bodies, third-party APIs, env vars). The database is not such a boundary: we own the schema, and the shape of a row is enforced by our own migrations. Runtime-validating every read defends against a threat that mostly cannot occur. Static typing is the part that pays off: it catches typo'd or missing columns at compile time and turns an otherwise-`any` row into a checked shape.
**Alternatives:** Runtime-validate every row with zod (gold-plating for a database we fully control); leave rows as `any` (lost type safety, not a deliberate shortcut).
**Trade-off:** Hand-written row types can drift from the actual table, since nothing forces them to match the migration. Accepted for now because the duplication is tiny.
**Revisit when:** the same table is selected across several routes (extract a single shared row type), or we add data the database cannot shape-enforce (JSONB, tables written by other services). Validate those reads at the point they are read.

## API design

### REST for resources, RPC for actions

**Decision:** Design the HTTP API in two deliberately mixed styles. REST for resources (the entities the app owns: users, reviews, lists, log entries), where the path names a noun and the method carries the verb. RPC for actions (register, login, logout), where the path names a verb grouped under a namespace prefix.

The REST pattern: a path identifies a resource, either a collection (`/reviews`) or a member (`/reviews/:id`). The method says what to do; the verb never goes in the path (no `/getReviews`, no `POST /createReview`).

| Method | Collection `/reviews` | Member `/reviews/:id` |
|--------|----------------------|----------------------|
| `GET` | list all | fetch that one |
| `POST` | create a new one | |
| `PUT` / `PATCH` | | update it |
| `DELETE` | | delete it |

**Why mix in RPC:** REST is excellent for resources but awkward for actions. Logging in is not really "create a session resource", it is "authenticate me". Register, login, and logout are processes, verbs at heart. Forcing them into noun shapes makes them less clear, so we name them as actions under an `/auth` prefix. `/auth/register` reads as "call the register procedure": `/auth` is a namespace, `register` is an action.
**Trade-off:** Two design vocabularies in one API instead of one pure model. Worth it: clarity per endpoint beats dogmatic consistency. The rule of thumb is REST when the thing is a noun you CRUD, RPC when it is a verb you perform.

### User-scoped read routes grouped under `/users`

**Decision:** Reads that are "things belonging to a user" hang off the user member path (`GET /users/:id/library`, `/logs`, `/reviews`, `/followers`, `/following`, plus a by-username lookup). Writes live in their own feature routers.
**Why:** The nested path reads naturally as "this user's library" and keeps all user-scoped reads discoverable in one place. Separating writes keeps each feature's mutation logic self-contained.
**Trade-off:** A feature like reviews is split across two routers (its reads under the users router, its writes under the reviews router). Accepted for the readability of the URL surface.

## Validation and error handling

### Request bodies validated with `zValidator` middleware

**Decision:** Validate request bodies with `@hono/zod-validator`'s middleware rather than hand-rolling parse plus `safeParse` inside each handler. It is wrapped in a small generic factory so the helper preserves each schema's specific type, and the handler reads typed, already-validated input.
**Why:** The validator runs before the handler, so the handler only ever sees parsed, valid, typed data: no `try/catch`, no `unknown`. One declarative line per route replaces the boilerplate.
**Alternatives:** Hand-rolled parse per handler (repeated boilerplate, body starts as `unknown`); a non-generic factory (a widened parameter type erases the schema's field types).
**Trade-off:** The validator owns JSON parsing, so the malformed-body message is the framework's wording, not ours. Acceptable, since the response is still a consistent `{ error }` 400.

### Centralised error envelope via `app.onError`

**Decision:** A single `app.onError` renders every error as a consistent JSON envelope `{ error: string }`. Known `HTTPException`s pass their message and status through; anything unexpected is logged and returns a deliberate 500.
**Why:** All error responses share one shape, matching the JSON success responses, so a client has a single parsing path. Unexpected failures get a deliberate 500 and a logging point instead of a stock plain-text default.
**Worth recording:** Hono surfaces validation errors two ways. Malformed JSON (not JSON at all) throws an `HTTPException(400)`, caught by `onError`. Well-formed JSON of the wrong shape returns a response from the validator hook, short-circuiting without throwing. Both lanes end up as the same `{ error }` shape.
**Revisit when:** we want a richer envelope (error codes, field-level detail, an OWASP-style no-disclosure auth response). Extend both the handler and the validator hook to a shared error shape.

## Authentication and authorization

### Registration discloses which field conflicts

**Decision:** When registration hits a unique violation, respond 409 with a field-specific message ("Username already taken" or "Email already registered") by branching on the violated constraint.
**Why:** It is the materially better UX: the frontend can point at the exact field to change. For Spired! specifically, "this person has an account here" is not sensitive, because all profiles are public by design. We sized the threat to the product rather than applying a blanket rule.
**Alternatives:** A generic 409 for both fields, rejected as security theatre (it is enumeration-vulnerable anyway: an attacker submits a guaranteed-unique username, so any conflict must mean the email exists, while still paying the worse UX). A no-disclosure email side-channel (the OWASP-correct form) is the right answer for enumeration-sensitive products but needs transactional email we do not have yet.
**Trade-off:** Field-specific errors permit account enumeration. Accepted because account existence is low-sensitivity on a public-profile platform, and the UX gain is concrete.
**Revisit when:** we add transactional email (then adopt the email side-channel and extend no-disclosure to login and password reset), or if the product takes on data that makes account existence sensitive.

### 401 versus 403: the authn/authz split

**Decision:** `requireAuth` rejects with 401 Unauthorized. `requireRole` and `requireOwnership`, when the user lacks the role or does not own the row, reject with 403 Forbidden.
**Why:** The two statuses answer two different questions. 401 means "I do not know who you are" (authentication failed: no cookie, bad or expired token). 403 means "I know exactly who you are, and you still may not do this" (authentication succeeded, authorization failed). The authz gates only run after `requireAuth` has established identity, so a rejection from them is by definition an authorization failure.
**Alternatives:** Return 401 from the authz gates too, rejected: it conflates "log in" with "you are logged in but not allowed", and a client cannot tell whether re-authenticating would help.

### `requireRole` reads roles fresh from the database

**Decision:** `requireRole(roleName)` runs a fresh existence check against `user_roles` and `roles` on each call, rather than embedding roles as claims in the session JWT.
**Why:** Privileged users are few, so privileged routes are rare: one extra indexed read there is negligible. The decisive benefit is freshness. Removing a role takes effect on the very next request, so a rogue or compromised moderator can be demoted instantly. Roles baked into a 30-day JWT would stay valid until the token expired.
**Trade-off:** One indexed read per privileged request. Trivially worth it for instant revocation.

### `requireOwnership` compares ids; nothing is embedded

**Decision:** `requireOwnership(tableName, ownerColumn = "user_id")` loads the target row, reads its owner column, and compares it to the `userId` already on the context (set by `requireAuth` from the JWT).
**Why:** The JWT already carries the one stable fact we need: who the caller is. The other half, who owns this specific row, has to be read from the database anyway, because it is the row we are loading in order to act on it. There is nothing to embed: the set of resources a user owns is unbounded and grows after login, so it could never live in a token.
**Detail:** the owner is read in a separate query and compared in application code, deliberately not folded into the `WHERE` clause, because that would collapse "does not exist" and "not yours" into one boolean and destroy the 404/403 distinction below.
**Trade-off:** One indexed primary-key lookup per ownership-guarded request. Unavoidable and cheap.

### Parameterise the variance that actually occurs

**Decision:** In `requireOwnership`, the owner column is a configurable parameter (defaulting to `user_id`), but the primary-key column (`id`) and the URL path param (`:id`) are hardcoded as enforced conventions.
**Why:** The discipline is not "parameterise anything that could vary", it is "parameterise the variance that actually occurs at your call sites, and enforce the rest as a convention". The owner foreign key genuinely varies among the tables this guards (`user_id`, `author_id`, `created_by`), so it earns a parameter. The primary-key name does not vary: every guardable entity table uses `id`. Hardcoding it makes "guardable entity means `id` primary key and `:id` param" a load-bearing rule; a violation fails closed and loud.
**Alternatives:** Add `idColumn` and `paramName` parameters too, rejected as speculative flexibility: every real call site would leave them at default, and offering them invites divergence from a convention worth keeping rigid.
**Revisit when:** the first nested guarded route appears (`DELETE /users/:userId/reviews/:reviewId`, whose param is not `:id`). Add a configurable param name then.

### Honest 404/403 on ownership failure

**Decision:** When `requireOwnership` finds no row, return 404. When it finds the row but the caller does not own it, return 403. Concealing existence (returning 404 for both) is a deliberate per-route opt-in, not the default.
**Why:** On Spired!, a resource's existence is already public (profiles, reviews, and lists are world-readable). So the honest answer to "you do not own this" is "it exists, but you cannot" (403). Hiding its existence behind a 404 would conceal nothing an attacker could not confirm by fetching the public resource.
**Alternatives:** Always-404 (the OWASP no-disclosure posture) is correct for existence-sensitive resources (private drafts, direct messages). Not our default because our resources are public.
**Revisit per-route** if we add a resource type whose existence is sensitive.

### Role-override ("owner or privileged role") deferred

**Decision:** `requireOwnership` currently grants access only to the owner. The common "owner or a privileged role" pattern (a moderator deleting any review) is not built yet.
**Why defer:** Middleware in a chain composes with AND (all gates must pass). "Owner OR moderator" needs an OR inside a single decision point, which stacking gates cannot express. And no endpoint needs it yet, so building the combinator now would be designing against an imaginary call site.
**Revisit when:** the first endpoint needs "owner or privileged role" (expected with content moderation). Add an optional override-role parameter or a small combinator then, shaped to that real route.

### Security response headers with a strict deny CSP

**Decision:** Apply Hono's `secureHeaders()` as global middleware (`app.use("*", ...)`), so it stamps every response including error responses, with a strict Content-Security-Policy of `default-src 'none'; frame-ancestors 'none'`.
**Why:** `secureHeaders()` sets a strong baseline (frame options, `nosniff`, HSTS, referrer and cross-origin isolation, strips `X-Powered-By`) but sets no CSP by default. For a JSON API a CSP is mostly inert, since our responses are consumed by `fetch()` and never rendered. We still set `default-src 'none'` as honest defense-in-depth, backing up `nosniff` against the content-sniffing edge case, and `frame-ancestors 'none'` as the modern anti-clickjacking directive.
**Trade-off:** A future HTML-serving route on the backend (such as API docs) would be blocked by `default-src 'none'`. Mitigation is built in: Hono middleware is route-scoped, so we deny by default globally and relax it on that one route.

### Rate limiting: per-IP, fixed-window, in-memory for v1

**Decision:** Rate-limit the auth endpoints with `hono-rate-limiter`. Login at 10 per 15 minutes, register at 5 per hour, keyed on client IP, using the default in-memory store. Reads are unlimited. Login skips successful requests; register counts every attempt.
**Why:** Login is the brute-force and credential-stuffing target, register the fake-account-flood target. Both are pre-authentication, so IP is the only available identifier. Per-IP stops the cheap single-origin attacker and raises cost for others (it is not a complete defense: a botnet rotating IPs walks past it, and later layers like account lockout stack on top). Login skips successful requests so only failed attempts count, meaning a legitimate user never burns budget; register counts everything because a successful register is the abuse.
**Alternatives:** A sliding-window algorithm smooths the fixed-window boundary burst, but the available Hono option requires Redis, which we deferred to the multi-instance milestone. A maintained fixed-window library beats hand-rolling a sliding counter for security-sensitive infrastructure.
**Trade-off:** A brief boundary burst (up to about twice the limit) is possible; the in-memory store is per-process and lost on restart; shared-IP false positives are mitigated by generous thresholds.
**Revisit when:** we scale past one instance (the same trigger as migrate-on-startup). Move to a Redis-backed store, at which point sliding-window comes essentially for free.

## Planned

### Discord OAuth (social login)

**Decision:** Add "Sign in with Discord" (OAuth 2.0) as a second login method, built during the frontend stage, not now.
**Why defer, not skip:** OAuth is a browser-redirect flow that depends on two things that do not exist yet: a frontend to initiate the redirect, and a registered, reachable callback URL. Building it headless now would yield a half-testable callback and likely rework. Email/password auth is already complete; OAuth is an additive method, not a missing piece.
**Why Discord:** the TTRPG audience lives on Discord, so it is the most on-brand provider and a strong portfolio signal.
**Architecture:** the Discord callback verifies with Discord, finds or creates the user, then issues the same session JWT cookie through the same `requireAuth`. The session layer is provider-agnostic, which is why deferring costs nothing structurally.
**Schema implications (handle via migration when built):** `users.password_hash` becomes nullable (an OAuth-only user has no password); add an `identities` table mapping `(provider, provider_user_id)` to a user, so one account can link Discord and password. Only auto-link on a verified provider email, never an unverified one (that is an account-takeover vector).

### Same-site domains so the session cookie works in production

**Decision:** In production, serve frontend and backend on the same registrable domain (`spired.com` and `api.spired.com`), or a path-proxied single origin. Keep `SameSite=Lax` on the session cookie.
**Why:** The cookie is the auth mechanism, and `SameSite=Lax` cookies are not sent on cross-site `fetch`. Frontend on `*.vercel.app` and backend on `*.railway.app` are different sites, so every authenticated API call would arrive with no cookie and auth would silently break. Subdomains of one registrable domain are same-site, so `Lax` is sent.
**Alternatives:** `SameSite=None; Secure` to allow cross-site, rejected as the default because it re-opens CSRF and obliges us to add CSRF tokens. A fallback only if same-site is impossible.
**Note:** logged early so the frontend API client is built with `credentials: 'include'` from day one. Development is unaffected, since `localhost` ports are same-site.

### Soft-delete for users, content, and reviews

**Decision:** Use soft-delete (a `deleted_at` timestamp) for `users`, `content_items`, and `reviews`, instead of hard delete plus cascade.
**Why:** On a public platform of user-generated content, hard-deleting a user vaporises their reviews, lists, and logs from everyone who engaged with them, and is unrecoverable. Soft-delete lets us render "[deleted user]", keeps content moderatable and recoverable, and is the industry norm.
**Trade-off and the subtle point:** every read path must filter `WHERE deleted_at IS NULL`, and unique constraints must become partial indexes (`UNIQUE ... WHERE deleted_at IS NULL`), otherwise a soft-deleted user's email or username would block re-registration. This is the easy-to-miss bug, and the plan bakes it in.
**Note:** hard account-deletion for GDPR erasure is a separate, explicit flow.

### Aggregate ratings: a view first, cached columns only if needed

**Decision:** Expose an item's community rating (average and count) via a computed SQL view initially. Only add cached columns maintained in the write path if and when read performance demands it.
**Why:** The community average is a core feature. A view is always correct with zero maintenance; cached columns are a performance optimisation with a staleness cost. Do not pay that cost before read volume justifies it.
**Alternatives:** Postgres triggers (atomic but hidden), or application-code maintenance on every rating write (explicit but must cover all write paths). Both deferred behind the view.
**Revisit when:** item-page read latency from the aggregation becomes measurable. Introduce cached columns with write-path maintenance, or a materialised view with scheduled refresh.
