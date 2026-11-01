# Engineering practices

How ngpdf is tested, checked, secured and released. Every rule here is enforced by a tool in CI,
or by a repository setting or a maintainer step that this file names as such. A rule that nothing
enforces is a wish, and does not belong in this file.

## Tests

Tests are written first and must fail without the change they cover (see `AGENTS.md`).

| Level | What it proves | Tool | Where |
| --- | --- | --- | --- |
| Unit | One stage, from its input data to its output data | Vitest (node) | `engine/*.spec.ts`, `tree/*.spec.ts` |
| Property | Invariants hold for any input, not only the examples | Vitest + `fast-check` | `engine/*.property.spec.ts` |
| Component | Real templates (control flow, pipes, DI) build the right tree; the preview component | Vitest (jsdom) + Angular compiler (`@analogjs/vite-plugin-angular`) | `render/*.spec.ts`, `viewer/*.spec.ts` |
| Integration | The whole engine, with a recording fake `PdfWriter` | Vitest | `engine/engine.spec.ts` |
| End to end | The demo's PDFs in a real Chrome, compared as text with `pdftotext -layout`, and the demo's `pdf-viewer` showing its PDF in Chrome's PDF viewer | `puppeteer-core` + poppler (Docker) | `scripts/e2e.mjs`, `e2e/expected/` |
| Performance | No regression on a 1,000-row table | `vitest bench` | `engine/*.bench.ts`, weekly CI job |
| Mutation | The tests catch real faults in the engine | StrykerJS | weekly CI job |

### Property tests (fast-check)

These invariants are checked for any input:

- **Text:** every line of `layoutText` is no wider than `maxWidth`, and joining the lines gives
  the collapsed input text, less the hyphens that end hyphenated lines.
- **Pagination:**
  - no placed unit ends below the content bottom, unless it is clipped and was warned about;
  - every unit is placed exactly once, in order;
  - every page that has a table row has its header first.
- **Columns:** the widths from `resolveColumns` add up to the table width when there is at least
  one `fr` column.
- **Style:** `parseLength` and the shorthand parsers either return a value or throw an `ngpdf:`
  error, and finish in linear time on inputs up to 100 KB.

### Coverage gates (Vitest `v8` provider)

- `engine/`: 95% lines, 90% branches.
- `tree/`, `elements/`, `render/`, `projects/core/viewer/`: 90% lines.
- CI fails below these numbers. A drop needs a reason in the PR.

### Mutation testing (StrykerJS)

- **Weekly job on `engine/`:** the score must stay at or above 80%.
- **Surviving mutants:** the maintainer reads the weekly report and opens an issue labelled
  `test-gap` for each one worth a test. This step is manual.

### End-to-end golden files

- Each demo PDF is compared as text (`pdftotext -layout`) with `e2e/expected/<name>.txt`, along
  with its page count.
- An encrypted demo PDF is extracted with its user password (`pdftotext -upw`), and the run fails
  if pdftotext opens it without one.
- `node scripts/e2e.mjs --update` rewrites the expected files. A PR that changes them shows the
  text diff, and a person checks the PDFs by eye before merging.
- Image comparison of rendered pages (`pdftoppm` + pixel diff) is planned for v0.2, once custom
  fonts make rendering font-stable.

### Performance

- `vitest bench` lays out and paginates a 1,000-row table, in the weekly workflow (not on every
  pull request).
- That job fails if the median is more than 20% slower than the baseline stored in
  `paginate.bench.ts` (`BENCH_BASELINE_TOLERANCE=0.2`).
- Target in Node 24 on a developer machine: under 300 ms. It is a local target and is not
  asserted, because a shared runner's speed varies more than the code does.

## Formatting and lint

### Prettier 3

- **Settings:** `printWidth: 100`, `singleQuote: true`, `trailingComma: 'all'`.
- **CI** runs `prettier --check .`.

### ESLint 9 (flat config)

| Rule set | Settings |
| --- | --- |
| `typescript-eslint` | `strictTypeChecked` and `stylisticTypeChecked` |
| `angular-eslint` | `tsRecommended` and `templateRecommended`, component selector prefix `pdf` (element, kebab-case) |
| `eslint-plugin-boundaries` | the dependency rules in `docs/ARCHITECTURE.md` |
| `no-restricted-imports` | `pdfkit` and `yoga-layout` only in `engine/` (`writer.ts`, `index.ts`) |
| `regexp` | `recommended` |
| `eslint-config-prettier` | last, so formatting never fights lint |

- **Boundaries:** `tree` and `elements` never import `engine`, and a stage imports only the stages
  before it.
- **`regexp`:** `regexp/no-super-linear-backtracking` is an error, because super-linear regexes are
  where ReDoS comes from.

### TypeScript

- **Compiler options:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride` and `noPropertyAccessFromIndexSignature`.
- **Angular compiler:** `strictTemplates`, `strictInjectionParameters` and
  `strictInputAccessModifiers`.

### Git hooks

- **pre-commit (`husky` + `lint-staged`):** Prettier and ESLint `--fix` on staged files.
- **commit-msg (`commitlint`):** checks the message follows Conventional Commits.
- CI runs the same checks, so skipping a hook only delays the failure.

## Continuous integration (GitHub Actions)

### Jobs on every pull request and every push to `main`

1. **Install:** `npm ci --ignore-scripts`. No package needs an install script today; one that does
   gets a named `npm rebuild` step.
2. **Format:** `prettier --check .`.
3. **Lint:** `eslint .`, then `node scripts/check-readme.mjs`, which fails when the package
   README's usage sections differ from the repository README's.
4. **Typecheck:** `tsc -p projects/core/tsconfig.lib.json --noEmit` and `ng build demo`.
5. **Tests:** `npm test -- --coverage`, with the coverage gates above.
6. **Bundle budget:** `node scripts/bundle-budget.mjs`. It also fails when `@ngpdf/core/viewer`
   reaches an initial chunk of the demo, which loads its preview in a deferred chunk.
7. **End to end:** `node scripts/e2e.mjs`, using Chrome from `browser-actions/setup-chrome`.
8. **Library build:** `npm run build:core`, then `node scripts/check-pack.mjs`, which reads the
   file list of `npm pack --dry-run` and fails on a spec, bench or test helper, or a missing
   LICENSE or README.
9. **Dependency scans:** OSV-Scanner and `npm audit` (see "Dependency vulnerabilities").

### Scheduled jobs (weekly)

- Mutation testing.
- The performance bench.
- CodeQL.
- OpenSSF Scorecard.
- OSV-Scanner over the lockfile.

### Hardening of the workflows themselves

- **Least privilege:** every workflow sets `permissions: contents: read`, and a job raises only
  what it needs.
- **Pinned actions:** third-party actions are pinned to a full commit SHA, with the version in a
  comment. Dependabot updates them.
- **Untrusted triggers:** no `pull_request_target`, and no secrets reach jobs that run fork code.
- **Bounded jobs:** every job sets `timeout-minutes`, so a hung step cannot hold a runner for the
  default six hours.

## Security

### Threat model

ngpdf runs in the user's browser and turns the app's own template plus data into a PDF. That data
often comes from users or a server. The risks, and the answer to each:

| Risk | Answer |
| --- | --- |
| Denial of service from data: huge or deeply nested content, or regex backtracking on a style value | Linear parsers, `regexp/no-super-linear-backtracking`, nesting and size limits (`docs/ARCHITECTURE.md`), fast-check timing properties |
| Script in the output | ngpdf never writes PDF JavaScript, forms or embedded files, and no action other than the URI action of a link to a URL or the GoTo action of a link to a named destination in the same file. Text is drawn as text, and pdfkit escapes strings. A test checks that the PDF bytes contain no `/JavaScript`, `/JS`, `/OpenAction` or `/Launch` |
| Image URLs | Fetched with the browser's `fetch`, under the page's CORS and CSP, with `credentials: 'same-origin'`. ngpdf adds no headers and follows no redirects of its own |
| Links (`pdf-link`) | Only absolute `http:`, `https:` and `mailto:` URLs are written, parsed with `URL` and in their normalized form, as a borderless Link annotation with a URI action. Any other scheme, a relative URL or one that does not parse writes no link: the content is drawn and a dev-mode warning names the URL. A link to `#name` is a GoTo action to the named destination of that anchor, and a name no anchor has writes no link. A test renders hostile `href`s and checks that every action in the bytes is a `/URI` to http, https or mailto, or a `/GoTo` to a named destination in the file |
| A compromised dependency | Three runtime dependencies only (pdfkit, yoga-layout, linebreak), plus the scanning and update policy below |

### Dependency vulnerabilities (CVE / CVSS)

**Scanning:**

- **OSV-Scanner** over `package-lock.json` runs on every PR and weekly. It is the gating scanner:
  a finding fails CI unless it is ignored in `osv-scanner.toml`.
- **`npm audit --omit=dev --audit-level=high`** runs on every PR as an advisory step
  (`continue-on-error`): it cannot read the ignore list, so it reports without failing the job.
  Both read the GitHub Advisory Database, so OSV-Scanner sees the same advisories.
- Dependabot security alerts are on (a repository setting).

**Response times by CVSS v3.1/v4 base score, for runtime dependencies or anything shipped in the
package:**

| Severity | CVSS | Fix and release within |
| --- | --- | --- |
| Critical | 9.0–10.0 | 72 hours |
| High | 7.0–8.9 | 7 days |
| Medium | 4.0–6.9 | 30 days |
| Low | 0.1–3.9 | next planned release |

- A dev-only dependency (build, test, lint) is fixed within 30 days whatever its score, unless it
  runs in CI with secrets. In that case the table applies.
  - `@changesets/*` is such a dependency: the `release-pr` job runs it with `RELEASE_BOT_TOKEN`,
    which can write to the repository and open pull requests. Its advisories follow the full
    CVSS table.
- **Advisories that do not affect ngpdf** (the vulnerable code is not reachable from it):
  - the finding is ignored in `osv-scanner.toml` with a written reason and an expiry date of at
    most 90 days;
  - `scripts/check-osv-ignores.mjs` fails CI on an entry with no reason, no expiry, or an expiry
    more than 90 days ahead;
  - `npm audit` does not read this list, which is why it is advisory.

**Updates:**

- Dependabot opens PRs weekly for npm and GitHub Actions. Minor and patch updates are grouped;
  majors get one PR each.
- Security updates are opened at once, outside the schedule.
- Runtime dependencies use caret ranges. The lockfile is committed and CI installs from it.

### Code scanning

- CodeQL (`javascript-typescript`, `security-extended` queries) runs on PRs and weekly.
- An alert of high severity or above fails the PR through a code scanning rule in the repository
  settings, not through the workflow. The maintainer checklist in `CONTRIBUTING.md` sets it.
- GitHub secret scanning and push protection are on.

### Reporting

- `SECURITY.md` asks reporters to use GitHub's private vulnerability reporting, which is enabled on
  the repository, and states the response times above.
- A fixed vulnerability gets a GitHub Security Advisory with a CVE requested through GitHub.

### Repository settings

- `main` is protected: it requires a PR, all CI jobs green and an up-to-date branch, and blocks
  force pushes.
- npm org `ngpdf` and the GitHub org require 2FA.
- The OpenSSF Scorecard badge is in the README. Its score is a target, not a gate.

## Releases

- **Versions:** Semantic Versioning, starting at `0.1.0`. Under `0.x`, a minor bump may break.
- **Changes:** each PR that changes the package adds a changeset (`@changesets/cli`). The release PR
  turns the changesets into `CHANGELOG.md` and the version.
- **Publishing:**
  - Publishing runs from GitHub Actions only, with npm trusted publishing (OIDC): there is no
    long-lived npm token.
  - It uses `--provenance`, so every version on npm links to the commit and workflow that built
    it.
- **SBOM:** each GitHub release attaches a CycloneDX SBOM (`npm sbom --sbom-format cyclonedx`).
- **Supported versions:** the latest minor gets security fixes. Older minors are listed in
  `SECURITY.md` as unsupported.
