# Security policy

## Reporting a vulnerability

Please report it privately through GitHub's private vulnerability reporting:
<https://github.com/ngpdf/ngpdf/security/advisories/new>.

Do not open a public issue or pull request for a vulnerability. Include the version of
`@ngpdf/core`, what you did, what you expected and what happened. A minimal reproduction helps.

We aim to acknowledge a report within 3 working days. A fixed vulnerability gets a GitHub Security
Advisory, and we request a CVE through GitHub.

## Supported versions

The latest minor version gets security fixes. Older minors are not supported.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

Under `0.x`, a minor release may contain breaking changes, so a fix can mean updating to the next
minor.

## Response times for dependency vulnerabilities

Fix and release times, by CVSS v3.1/v4 base score, for runtime dependencies or anything shipped in
the package:

| Severity | CVSS     | Fix and release within |
| -------- | -------- | ---------------------- |
| Critical | 9.0–10.0 | 72 hours               |
| High     | 7.0–8.9  | 7 days                 |
| Medium   | 4.0–6.9  | 30 days                |
| Low      | 0.1–3.9  | next planned release   |

A dev-only dependency (build, test, lint) is fixed within 30 days whatever its score, unless it
runs in CI with secrets. In that case the table applies.

## What ngpdf does about security

- ngpdf never writes PDF JavaScript, forms or embedded files, and a test checks the output. The
  only actions it writes are a `pdf-link` to an `http:`, `https:` or `mailto:` URL, and a
  `pdf-link` to an anchor in the same document.
- Parsers run in linear time, and nesting and text size are limited.
- Images are fetched with the browser's `fetch`, under the page's CORS and CSP.
- CI runs `npm audit`, OSV-Scanner, CodeQL and OpenSSF Scorecard, and Dependabot keeps
  dependencies and workflows up to date.
- Releases are published from GitHub Actions with npm trusted publishing and provenance. Each
  GitHub release attaches a CycloneDX SBOM.
