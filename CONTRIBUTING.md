# Contributing to Spired!

Thanks for your interest. First, an honest note on what this project is: Spired! is primarily a personal project, built to learn and to show off production-grade backend engineering. Even so, bug reports, ideas, and pull requests are genuinely welcome, and this guide explains how to take part.

By taking part, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** using the bug issue form.
- **Suggest a feature or idea** using the idea issue form.
- **Pick up a planned item** from [STATUS.md](STATUS.md) (the ones marked as planned).
- **Improve the docs** if something is unclear or wrong.

## Before you write code

Please open an issue first (a typo fix is the only real exception), so we can agree on the approach before you spend time on it. For a planned item, comment on or open an issue to claim it so two people do not build the same thing. If you are new, look for the **good first issue** label.

## Local setup

You need [Node.js 22.6 or newer](https://nodejs.org) and [Docker](https://www.docker.com/products/docker-desktop/).

```bash
# Fork the repo, then clone your fork
git clone https://github.com/YOUR_USERNAME/spired.git
cd spired
npm install

# Set up environment variables
cp .env.example .env
# then set a value for JWT_SECRET in .env

# Start the databases and run the API
docker compose up -d
npm run dev:backend
```

See the [README](README.md) for more detail on the setup.

## Development workflow

1. Create a branch off `main`, named for the work (`feat/review-endpoint`, `fix/login-cookie`).
2. **Write a failing test first, then the code to pass it.** This project is test-driven throughout.
3. Make sure the checks pass (see below).
4. Commit using Conventional Commits (see below).
5. Open a pull request using the template, and link the issue it addresses.

## Coding conventions

- **Tests come first.** Vitest, red then green. Test files sit next to the code they cover (`token.ts` and `token.test.ts`).
- **Raw, parameterised SQL** through postgres.js. Never build SQL by joining strings with values in it. Select explicit columns, never `SELECT *` or `RETURNING *`, so sensitive fields cannot leak by accident.
- **Validate at the trust boundary** (request bodies, external input) with zod. Do not runtime-validate data that comes from our own database.
- **Comments explain the why, not the what**, and stay sparse to match the surrounding code.
- **Significant design decisions get an entry** in [docs/decisions.md](docs/decisions.md), with the reasoning and the trade-off.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`.

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`.
- Use the imperative mood ("add", not "added").
- Describe what changed and why, not how.

Example: `feat(backend): add review creation endpoint`

## Running the checks

| Command | What it does |
|---|---|
| `npm test` | Run the tests in watch mode (local development) |
| `npm run test:run` | Run the tests once |
| `npm run typecheck` | Type-check with `tsc --noEmit` |

CI runs `test:run` and `typecheck` on every push and pull request, and both must pass before a change can be merged.

## Questions

Open an issue if something is unclear. For security issues, please email instead of opening a public issue (see the security link in the issue chooser).
