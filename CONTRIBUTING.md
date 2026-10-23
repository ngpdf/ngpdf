# Contributing to ngpdf

Read `AGENTS.md` for the rules of the code base, and `docs/ARCHITECTURE.md` and
`docs/ENGINEERING.md` for the structure, tests, CI, security and releases.

## Setup

All toolchains run in Docker through `scripts/dev` (Node 24, 6 GB memory cap). Nothing is
installed on your machine except Docker and, for the end-to-end script, Chrome.

```sh
./scripts/dev npm ci
./scripts/dev npm start        # demo app
```

## The gate

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

Mutation testing of the engine runs weekly in CI. To check that it runs locally, use the full
Node image, because StrykerJS needs `ps`:

```sh
NGPDF_IMAGE=node:24-bookworm ./scripts/dev npx stryker run --dryRunOnly
```

## The site

[ngpdf.dev](https://ngpdf.dev) lives in `projects/site`: a landing page with a live demo, the
documentation (Markdown in `projects/site/src/content/docs/`, one file per page) and the examples.

```sh
./scripts/dev npm run build:site     # build and prerender to dist/site/browser
```

A change to the library that users see needs its docs page updated in the same pull request.
Merging to `main` deploys the site (`.github/workflows/site.yml`). The social card and the home
screen icon are rendered from `projects/site/brand/` with `node scripts/site-images.mjs`.

## Test first

Write the test first and watch it fail. A test that passes without the change it covers guards
nothing: revert the change and check that the test fails.

## Changesets

A pull request that changes the published package adds a changeset:

```sh
NGPDF_IMAGE=node:24-bookworm ./scripts/dev npm run changeset
```

(The full Node image, because changesets reads Git and the slim image has no `git`.)

Choose the bump (`patch`, `minor` or `major`; under `0.x` a minor may break) and describe the change
for users. Commit the generated file in `.changeset/`. When changesets reach `main`, a bot opens a
"chore: version packages" pull request that updates the version and `CHANGELOG.md`. Merging it
publishes the release.

If the version pull request shows no checks (a pull request opened with `GITHUB_TOKEN` triggers no
workflows), close and reopen it, or push an empty commit to its branch
(`git commit --allow-empty -m "chore: trigger ci"`), so the required checks run. Setting
`RELEASE_BOT_TOKEN` (below) avoids this.

## Review

[CodeRabbit](https://coderabbit.ai) reviews every pull request against the rules in `AGENTS.md`.
It requests changes on what it finds and approves once its comments are resolved. Answer its
comments in the thread: reply with a fix, or explain why not and it will resolve the comment.
CI must be green before merging.

## Credits

Everyone who contributes is listed in the README, following
[all-contributors](https://allcontributors.org). After a pull request is merged, comment on it:
`@all-contributors please add @<user> for code` (or `doc`, `bug`, `ideas`, `test`, and so on). The
bot opens a pull request that updates `.all-contributorsrc` and the README.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
`test:`, `refactor:`, `perf:`, `ci:`, `chore:`. A scope is welcome, for example `fix(core): ...`.
`commitlint` checks the message in a Git hook.

## Dependency ignores

If an advisory does not affect ngpdf, add it to `osv-scanner.toml` with an `id`, a `reason` and an
`ignoreUntil` date at most 90 days ahead. `scripts/check-osv-ignores.mjs` fails CI otherwise.

## Security

Report vulnerabilities privately. See `SECURITY.md`.

## Repository setup (maintainer)

Done by hand in GitHub and npm. Nothing in the workflows sets these.

- [ ] Protect `main`: require a pull request, require the CI jobs (`format`, `lint`, `typecheck`,
      `test`, `osv-scanner`, `bundle-budget`, `build`, `e2e`) and the CodeQL check, require
      the branch to be up to date, block force pushes.
- [ ] Add a code scanning rule that fails a pull request on an alert of high severity or above.
- [ ] Enable private vulnerability reporting (Settings, Code security).
- [ ] Enable secret scanning and push protection.
- [ ] Enable Dependabot alerts and Dependabot security updates.
- [ ] Require 2FA in the GitHub org `ngpdf` and in the npm org `ngpdf`.
- [ ] On npm, add the GitHub repository `ngpdf/ngpdf` and the workflow `release.yml` as a trusted
      publisher of `@ngpdf/core`.
- [ ] First release only. npm takes a trusted publisher only for a package that exists, so the
      first version is published from the workflow with a short-lived token:
  1. Create a granular npm access token with read and write on the `@ngpdf` scope and a
     7-day expiry, and save it as the repository secret `NPM_TOKEN`.
  2. Push or rerun the release workflow. The `publish` job publishes with provenance.
  3. Add the trusted publisher (above), delete the `NPM_TOKEN` secret and revoke the token
     on npm. Later versions publish through OIDC only.
- [ ] Create the repository secret `RELEASE_BOT_TOKEN`: a GitHub App installation token or a
      fine-grained PAT limited to this repository with contents and pull-requests write. Only the
      `release-pr` job reads it. Without it the job falls back to `GITHUB_TOKEN`, and the version
      pull request gets no checks until you close and reopen it.
- [ ] In Settings, Actions, allow GitHub Actions to create pull requests, so the release workflow
      can open the "chore: version packages" pull request.
