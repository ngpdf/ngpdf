---
title: Contributing
description: How to contribute to ngpdf - the Docker dev script, writing tests first, the checks to run, changesets, Conventional Commits and code review.
section: Project
order: 15
---

Contributions of any kind are welcome: code, documentation, bug reports, ideas and tests. The source is at [github.com/ngpdf/ngpdf](https://github.com/ngpdf/ngpdf).

Before you start, read [`AGENTS.md`](https://github.com/ngpdf/ngpdf/blob/main/AGENTS.md) for the rules of the code base, and [`docs/ARCHITECTURE.md`](https://github.com/ngpdf/ngpdf/blob/main/docs/ARCHITECTURE.md) and [`docs/ENGINEERING.md`](https://github.com/ngpdf/ngpdf/blob/main/docs/ENGINEERING.md) for the structure, tests, CI, security and releases.

## Setup

All toolchains run in Docker through `scripts/dev`, which runs a command in a Node 24 container with the repository mounted and a 6 GB memory cap. You only need Docker and, for the end-to-end script, Chrome.

```sh
./scripts/dev npm ci
./scripts/dev npm start        # demo app
```

## Test first

Write the test first and watch it fail. A test that passes without the change it covers guards nothing: revert the change and check that the test fails.

```sh
./scripts/dev npm test                 # all specs
./scripts/dev npm test -- paginate     # one area
```

## The checks

Run these before you open a pull request. CI runs the same checks.

```sh
./scripts/dev npm run format:check
./scripts/dev npm run lint
./scripts/dev npm run typecheck
./scripts/dev npm run test:coverage       # coverage gates in docs/ENGINEERING.md
./scripts/dev npm run build:core
./scripts/dev node scripts/bundle-budget.mjs
node scripts/e2e.mjs                      # when the change affects the output
```

The bundle budget checks that importing `@ngpdf/core` still adds at most 15 KB gzipped to an app's initial bundle. The end-to-end script renders the demo documents in headless Chrome and compares their text with the expected files.

Mutation testing of the engine runs weekly in CI. To check it locally, use the full Node image, because StrykerJS needs `ps`:

```sh
NGPDF_IMAGE=node:24-bookworm ./scripts/dev npx stryker run --dryRunOnly
```

## Changesets

A pull request that changes the published package adds a changeset:

```sh
NGPDF_IMAGE=node:24-bookworm ./scripts/dev npm run changeset
```

It uses the full Node image because changesets reads Git, and the slim image has no `git`. Choose the bump (`patch`, `minor` or `major`; under `0.x` a minor may break) and describe the change for users. Commit the generated file in `.changeset/`. When changesets reach `main`, a bot opens a "chore: version packages" pull request that updates the version and the changelog. Merging it publishes the release.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`, `ci:`, `chore:`. A scope is welcome, for example `fix(core): ...`. `commitlint` checks the message in a Git hook.

## Pull requests and review

Describe what changed and why, and how you tested it.

[CodeRabbit](https://coderabbit.ai) reviews every pull request against the rules in `AGENTS.md`. It requests changes on what it finds and approves once its comments are resolved. Answer its comments in the thread: reply with a fix, or explain why not, and it will resolve the comment. CI must be green before merging.

## Credits

Everyone who contributes is listed in the README, following [all-contributors](https://allcontributors.org). After your pull request is merged, comment on it:

`@all-contributors please add @<user> for code`

Use `doc`, `bug`, `ideas`, `test` and so on for other kinds of contribution. The bot opens a pull request that updates the list.

## Security issues

Do not report vulnerabilities in public issues. See [Security](/docs/security).

The full guide is in [CONTRIBUTING.md](https://github.com/ngpdf/ngpdf/blob/main/CONTRIBUTING.md).
