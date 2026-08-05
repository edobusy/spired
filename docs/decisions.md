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

### Migrations are named with a UTC timestamp, not a sequence number

**Decision:** Migration files are named `YYYYMMDDHHMMSS_snake_case_description.sql`, stamped in UTC, and generated by `npm run migration:new -- <description>` rather than named by hand. The existing `001_users_and_roles.sql` was renamed to match.
**Why:** Two concrete failures of sequential numbers. First, they change width: the runner sorts filenames lexicographically, so once the project reaches `1000_`, it sorts *before* `100_` and lands fourth, right after `099_`. A 14-digit stamp is fixed-width forever, so dictionary order is chronological by construction and the runner's plain `.sort()` stays correct without a custom comparator. Second, two branches developed in parallel both reach for `003_`, merge without conflict because they are different filenames, and then apply in an order nobody chose. Timestamps collide only if two migrations are created in the same second.
**Why generate rather than hand-name:** the format is easy to typo and a typo is expensive, because a migration's filename is its primary key in `schema_migrations` and is effectively immutable once applied. The generator also writes a `RAISE EXCEPTION` guard into the new file, so a migration that is generated and then forgotten fails loudly instead of applying as a no-op and being recorded as done, which would mean the real SQL written into it later never runs. That is safe because the runner wraps apply and record in one transaction, so the `INSERT` into `schema_migrations` rolls back with the failure.
**The generator rejects a malformed description rather than normalising it.** Normalising would quietly accept `"Add soft delete"` and silently produce `add_soft_delete`, so nobody ever learns the convention. Rejecting teaches it once. This is the same enforce-rather-than-compensate reasoning behind choosing a `CHECK (email = lower(email))` constraint over `citext`. The cost is that the whole burden falls on the error message, so it states the rule and shows an example.
**Alternatives:** sequential integers (the two ordering failures above); zero-padded sequential integers with a generous width (fixes sorting, not parallel branches, and the width is a guess); library-managed migrations such as node-pg-migrate (more machinery than a `readdir` and a loop needs, and we want the SQL visible and owned).
**Trade-off:** renaming `001` broke the rule that an applied migration is immutable. Accepted deliberately: the repository is public but has no forks and no other contributors, so "who has applied `001`" was answerable in practice, and rebuilding a local database is one `docker compose down -v`. It required exactly that, because `schema_migrations.filename` is the primary key so a rename reads as a brand-new migration. This is a one-time exception, not a precedent.

### Database rows are statically typed, not runtime-validated

**Decision:** Annotate query results with TypeScript generics to get a real type on each row, but do not run rows through zod (or any runtime validation) on the way out of the database.
**Why:** Validation belongs at the trust boundary, where data crosses in from somewhere we do not control (HTTP request bodies, third-party APIs, env vars). The database is not such a boundary: we own the schema, and the shape of a row is enforced by our own migrations. Runtime-validating every read defends against a threat that mostly cannot occur. Static typing is the part that pays off: it catches typo'd or missing columns at compile time and turns an otherwise-`any` row into a checked shape.
**Alternatives:** Runtime-validate every row with zod (gold-plating for a database we fully control); leave rows as `any` (lost type safety, not a deliberate shortcut).
**Trade-off:** Hand-written row types can drift from the actual table, since nothing forces them to match the migration. Accepted for now because the duplication is tiny.
**Revisit when:** the same table is selected across several routes (extract a single shared row type), or we add data the database cannot shape-enforce (JSONB, tables written by other services). Validate those reads at the point they are read.

### Email is canonicalised by the application and enforced by a CHECK, not stored as `citext`

**Decision:** Lowercase the email in the application before it reaches the database, and add `CHECK (email = lower(email))` so a non-canonical address cannot be stored at all. The normalisation lives in the zod schema as a `.transform()`, shared by the register and login schemas so the two endpoints cannot disagree about what an email is.
**Why:** Postgres offers `citext`, a case-insensitive text type that would make comparisons case-insensitive with no `lower()` anywhere. We rejected it on a specific distinction: **`citext` compensates for a violation, a CHECK enforces against one.** With `citext` a mixed-case address is stored happily and nothing ever fails, so the wrongness is hidden by the comparison rules rather than prevented. With a CHECK the wrong value cannot enter the column. The second reason is that `citext`'s case-insensitivity stops at the database boundary, and the address leaves our system into JWTs, logs, and eventually a transactional email provider. We want case-canonical *data*, not case-insensitive *comparison*.
**Alternatives:** `citext` (above); normalising only in the application with no constraint (one forgotten call site silently stores a duplicate-in-effect address).
**Trade-off:** normalisation becomes the application's job, and there are now two implementations of "lowercase", JavaScript's `toLowerCase()` and Postgres's `lower()`. They agree for ASCII but can diverge for some Unicode, because `lower()` depends on the database collation. The CHECK is the backstop that makes a disagreement fail loudly instead of storing something wrong.

### Usernames keep their display case and are unique over `lower(username)`

**Decision:** Store the username exactly as the user typed it, and enforce uniqueness over `lower(username)` with a functional index rather than folding the stored value.
**Why:** A handle is something people present themselves with, and `EdoB` rendering as `edob` is a small but real loss they did not ask for. Uniqueness still has to be case-insensitive, or links become ambiguous and one user can impersonate another with a capitalisation trick. This is the GitHub and Twitter behaviour.
**Alternatives:** fold usernames to lowercase like emails (simpler: one rule, one mechanism, no functional index, but it discards the user's chosen capitalisation); `citext` (more defensible here than for email, since a handle does not leave the system the way an address does).
**Trade-off:** the deciding argument against `citext` was visibility at the call site. `WHERE lower(username) = lower($1)` states the rule in the query, whereas `citext` hides it in the column type, and using one mechanism for both columns beats using two. The cost is a real trap: write `WHERE username = $1` and two things break silently at once, the lookup becomes case-sensitive again and the functional index goes unused, because Postgres can only use it when the query repeats the indexed expression.

### Uniqueness is enforced by partial indexes, not by UNIQUE constraints

**Decision:** Drop the table-wide `users_email_key` and `users_username_key` constraints that `UNIQUE` generated, and replace them with `users_email_unique` and `users_username_lower_unique`, both carrying `WHERE deleted_at IS NULL`.
**Why:** Soft-delete keeps the row, so a whole-table unique constraint would see a returning user's registration as a duplicate of their own deleted account. A soft-deleted user would permanently squat on their own email and username. A plain `UNIQUE` constraint cannot carry a `WHERE` clause, because a constraint is a whole-table declaration by definition; uniqueness across a *subset* of rows is only expressible as a partial index. That is why the constraints are dropped and re-created rather than altered in place.
**Alternatives:** keep the constraints and free the email and username at deletion time (means editing user data on deletion, and reopens handle-squatting immediately rather than deliberately); no uniqueness enforcement in the database at all (unacceptable, application-level uniqueness checks race).
**Trade-off:** these now appear under Indexes rather than as table-level constraints in `\d users`, and the names are application surface, because the register handler switches on `err.constraint_name` to report which field collided. Renaming either index without updating that switch turns a clean 409 into a 500. Also `deleted_at` is a nullable timestamp rather than an `is_deleted` boolean, because it answers both "is it deleted" and "when" in one column at no extra cost, which moderation and any future purge-after-N-days policy will want.
**Revisit when:** account deletion is built in Stage 4. Releasing a soft-deleted user's handle back into circulation lets someone else inherit their inbound links and mentions, which is a real impersonation vector. It is deliberately unsolved here because no deletion flow exists yet to create the situation.

### Soft-delete is enforced at the read, and `requireAuth` does not re-check the user

**Decision:** Every query that reads a user filters `WHERE deleted_at IS NULL`, including the login lookup and `GET /me`. `requireAuth` continues to verify only the session token, without a database round trip to confirm the account is still live.
**Why filter at the read:** a filter in the query means every future caller inherits it, whereas a check after the fact has to be remembered at each call site. It also means a deleted account is indistinguishable from one that never existed, so a stale token learns nothing about whether the account once existed.
**The known gap:** because `requireAuth` is stateless, a session issued before deletion stays cryptographically valid until it expires. Any protected route that does not re-read the user would therefore still serve a soft-deleted account. Today that set is empty, since `GET /me` is the only authenticated route and it does its own filtered read, so there is no reachable path. It becomes live the moment a protected route is added that does not read the user.
**Why not close it now:** the fix is either a database lookup on every authenticated request, or the `token_version` column already planned for session revocation. Both are a deliberate move from stateless JWTs toward per-request session checking, which is an architectural decision rather than a line in a migration.
**Revisit when:** account deletion is built in Stage 4, alongside session revocation. That mechanism must cover deletion, not only "log out everywhere".

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

## Observability

### Structured logging with pino

**Decision:** Log through `pino`, which emits one JSON object per line, rather than `console.log` strings. Each request is given a child logger carrying a unique `requestId`, attached to the request context so every line from that request is tagged and correlatable. The request-logging middleware is a small factory we wrote ourselves (it takes a logger and returns Hono middleware) rather than an off-the-shelf integration.
**Why:** JSON logs are queryable: an aggregator can filter by level, group by `requestId`, or count events, none of which works on free-text strings. The `requestId` stitches every line from one request together, which is what makes a production incident traceable. Writing the middleware ourselves keeps the dependency surface small and, more importantly, gives us a dependency-injection seam: the logger is passed in as an argument, so a test can inject a logger pointed at an in-memory buffer and assert on the exact lines emitted, with nothing touching stdout.
**Alternatives:** `console.log` (unstructured, no levels, not queryable); `hono-pino` or similar (works, but hides the wiring and removes the injection seam that makes the middleware cleanly testable).
**Trade-off:** Raw JSON is unreadable at a dev terminal, addressed by pretty-printing in development only (below).

### The message names the event, the fields carry the data

**Decision:** Every log call uses a static, lowercase message naming the *kind* of event, and passes the variable data as structured fields: `logger.info({ filename }, "applied migration")`, never `logger.info(\`applied migration: ${filename}\`)`.
**Why:** A constant message is an event identifier the aggregator can group, count, and alert on. Interpolating the variable into the message makes every line a unique string, which defeats grouping (every count becomes one), defeats pattern-based collapsing, and pins nothing an alert can target. The variable is not lost: pino renders fields alongside the message, so a human still reads the filename and a machine can still query it. One static message plus a structured field serves both readers at once.

### One logging context, deliberately app-wide

**Decision:** The logger lives in its own context type (`AppEnv`), separate from the authentication context (`AuthEnv`) that carries `userId`. The logging middleware runs outermost, on every route.
**Why:** A value belongs in a broad, always-present context type only if it is genuinely always present, otherwise the types lie. The logger is attached to every request by the outermost middleware, so a broad `AppEnv` promising every handler "a logger is here" is true. `userId` is the opposite: it exists only after `requireAuth` on protected routes, so it stays in the narrow `AuthEnv` and does not pollute the type of handlers that never authenticate. The same principle earlier ruled out a global context augmentation.

### Durations from a monotonic clock

**Decision:** Measure request duration with `performance.now()`, not `Date.now()`.
**Why:** `performance.now()` is monotonic: it only ever advances, at a steady rate. `Date.now()` reads wall-clock time, which can jump backward or forward (NTP corrections, daylight saving) and yield a negative or wildly wrong duration. For an elapsed interval the monotonic clock is the correct instrument.

### Log level is a static threshold, severity is per call

**Decision:** `LOG_LEVEL` (default `info`) sets one threshold for the whole app; the method chosen at each call site (`.debug`, `.info`, `.error`) sets that line's severity. Lines below the threshold are dropped.
**Why:** These are two independent knobs. Severity is a property of the event, decided in code. The threshold is an operational dial: run at `info` normally, drop to `debug` to investigate, set `silent` in tests. Tests set `LOG_LEVEL=silent` so the real app's logging does not clutter test output, while an injected capture logger still receives what a test explicitly asserts on.

### Only unexpected errors are logged

**Decision:** The central `onError` handler logs only the unexpected 5xx fall-through branch, at `error` level with the serialized error. Expected `HTTPException`s (the 4xx and 429 responses that are normal control flow) are not logged.
**Why:** A 400 for bad input or a 429 for rate limiting is the system working as designed, not an incident. Logging them at error level would bury the genuine 500s (the ones that signal a real bug) in routine noise. The error log should draw attention to what is actually wrong.
**Revisit when:** we ever deliberately throw a 5xx `HTTPException`; that branch would then need logging too.

### Pretty logs in development, pure JSON in production

**Decision:** In development, pipe the app's output through `pino-pretty` in the `dev` npm script (`... src/index.ts | pino-pretty`). `pino-pretty` is a dev dependency and is never referenced by application code.
**Why:** Production wants raw JSON so the aggregator can parse it; a human at a dev terminal wants colorized, readable lines. Piping keeps the transformation at the very edge, in a separate downstream process, so `logger.ts` emits pure JSON in every environment and the production start path never touches the prettifier. The app writes the same bytes to stdout regardless; only what is wired to the far end of that stream differs.
**Alternatives:** A pino transport configured inside `logger.ts` (self-contained, but places a dev-only tool inside code that also runs in production). Rejected to keep the production code path pure.

### Postgres notices routed through the logger at debug

**Decision:** Give the `postgres.js` client an `onnotice` handler that logs notices through pino at `debug` level, instead of letting the driver print them to the console by default.
**Why:** By default the driver dumps every Postgres NOTICE (for example "relation already exists, skipping" from an idempotent `CREATE TABLE IF NOT EXISTS`) straight to the console as an unformatted object, bypassing our logger. Routing them through pino unifies all output under one logger, and `debug` places them below the default `info` threshold, so they stay invisible in normal operation but reappear on demand when the level is lowered.
**Alternatives:** Silence notices entirely (`onnotice: () => {}`), rejected because it also discards any future notice that might matter; keep the driver default (unformatted, un-levelled console noise).

## Planned

### Discord OAuth (social login)

**Decision:** Add "Sign in with Discord" (OAuth 2.0) as a second login method, built in Stage 2 alongside the contributor loop, not at deploy, and not now.
**Why here, not later:** For this audience Discord login is an approachability feature, not a deploy-time nice-to-have: it removes the signup wall exactly when it first matters. Stage 1 is public and read-only, so no stranger creates an account; Stage 2 is where signup and the first contribution open up, so the lowest-friction way in belongs there, with the taste-picker and the rest of the join flow.
**Why not sooner:** OAuth is a browser-redirect flow that needs a frontend to initiate the redirect and a registered, reachable callback URL. The frontend arrives in Stage 1, but there is nothing to sign in *for* until Stage 2 opens contribution. Email/password auth is already complete; OAuth is an additive method, not a missing piece.
**Why Discord:** the TTRPG audience lives on Discord, so it is the most on-brand provider and a strong portfolio signal.
**Architecture:** the Discord callback verifies with Discord, finds or creates the user, then issues the same session JWT cookie through the same `requireAuth`. The session layer is provider-agnostic, which is why deferring costs nothing structurally.
**Schema implications (handle via migration when built):** `users.password_hash` becomes nullable (an OAuth-only user has no password); add an `identities` table mapping `(provider, provider_user_id)` to a user, so one account can link Discord and password. Only auto-link on a verified provider email, never an unverified one (that is an account-takeover vector).

### Same-site domains so the session cookie works in production

**Decision:** In production, serve frontend and backend on the same registrable domain (`spired.com` and `api.spired.com`), or a path-proxied single origin. Keep `SameSite=Lax` on the session cookie.
**Why:** The cookie is the auth mechanism, and `SameSite=Lax` cookies are not sent on cross-site `fetch`. Frontend on `*.vercel.app` and backend on `*.railway.app` are different sites, so every authenticated API call would arrive with no cookie and auth would silently break. Subdomains of one registrable domain are same-site, so `Lax` is sent.
**Alternatives:** `SameSite=None; Secure` to allow cross-site, rejected as the default because it re-opens CSRF and obliges us to add CSRF tokens. A fallback only if same-site is impossible.
**Note:** logged early so the frontend API client is built with `credentials: 'include'` from day one. Development is unaffected, since `localhost` ports are same-site.

### Soft-delete for users, content, and reviews

**Status:** implemented for `users` (see the Database section above for the decisions that followed from it). Still planned for `content_items` and `reviews`, which do not exist yet.

**Decision:** Use soft-delete (a `deleted_at` timestamp) for `users`, `content_items`, and `reviews`, instead of hard delete plus cascade.
**Why:** On a public platform of user-generated content, hard-deleting a user vaporises their reviews, lists, and logs from everyone who engaged with them, and is unrecoverable. Soft-delete lets us render "[deleted user]", keeps content moderatable and recoverable, and is the industry norm.
**Trade-off and the subtle point:** every read path must filter `WHERE deleted_at IS NULL`, and unique constraints must become partial indexes (`UNIQUE ... WHERE deleted_at IS NULL`), otherwise a soft-deleted user's email or username would block re-registration. This is the easy-to-miss bug, and the plan bakes it in.
**Note:** hard account-deletion for GDPR erasure is a separate, explicit flow.

### Aggregate ratings: a view first, cached columns only if needed

**Decision:** Expose an item's community rating (average and count) via a computed SQL view initially. Only add cached columns maintained in the write path if and when read performance demands it.
**Why:** The community average is a core feature. A view is always correct with zero maintenance; cached columns are a performance optimisation with a staleness cost. Do not pay that cost before read volume justifies it.
**Alternatives:** Postgres triggers (atomic but hidden), or application-code maintenance on every rating write (explicit but must cover all write paths). Both deferred behind the view.
**Revisit when:** item-page read latency from the aggregation becomes measurable. Introduce cached columns with write-path maintenance, or a materialised view with scheduled refresh.
