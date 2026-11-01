---
title: Security
description: What ngpdf does about security - bounded parsing, no PDF scripts or actions, how images are fetched, how to report a vulnerability and supported versions.
section: Project
order: 13
---

Documents often contain data that came from users or a server. ngpdf is built so that such data cannot make a render run unbounded, and so that the PDFs it writes contain nothing active.

## Threat model in short

- **Untrusted data in a document.** Text, URLs and style values bound from data are parsed by ngpdf. The parsers are linear: no regular expression with nested quantifiers or overlapping alternatives, so a crafted value cannot cause catastrophic backtracking.
- **Deep or huge trees.** Limits stop runaway work before it can overflow the stack or the memory (see below).
- **The PDF as an attack surface.** ngpdf never writes PDF JavaScript, forms or embedded files, and a test checks the output for them. The only actions it writes are the links of `pdf-link`: to an absolute `http:`, `https:` or `mailto:` URL, or to a named destination in the same file for a link to an anchor. A test renders hostile URLs and checks that no other action is written. See [Links](/docs/text-and-fonts#links-pdf-link).
- **Network access.** Images are the only thing ngpdf fetches, with the browser's own `fetch`.
- **Supply chain.** Runtime dependencies are kept to pdfkit, yoga-layout and linebreak, plus the `tslib` helpers. A new one needs a reason and must pass `npm audit` and OSV-Scanner.

## Limits

| Limit | Error |
| --- | --- |
| More than 64 nested elements | `ngpdf: nesting deeper than 64` |
| A text node longer than 1 MB (1,048,576 characters) | `ngpdf: text longer than 1 MB` |

Component host elements do not count towards the nesting limit. Both errors reject the render; no PDF is produced.

There is no size limit on images fetched from a URL yet: a very large image is downloaded in full. If image URLs in your documents come from users, check or restrict them before rendering. A size cap is planned for v0.2.

## Text is text

Values interpolated into a document are drawn as text. They are not parsed as HTML or as PDF syntax, and property bindings such as `[innerHTML]` do nothing in a document.

## Images and the network

- Images are fetched with `fetch(src, { credentials: 'same-origin' })`, so cookies go only to your own origin.
- Requests run under your page's CORS rules and Content-Security-Policy, like any other `fetch` from your app. An `img-src` directive does not apply to `fetch`; `connect-src` does.
- Error messages show an image URL without its query string and fragment, which often carry a token.

The layout engine, Yoga, is WebAssembly that ngpdf compiles in the browser. If your site sets a Content-Security-Policy with a `script-src` directive, it needs `'wasm-unsafe-eval'` for WebAssembly to compile in browsers that enforce that rule.

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting: [github.com/ngpdf/ngpdf/security/advisories/new](https://github.com/ngpdf/ngpdf/security/advisories/new).

Do not open a public issue or pull request for a vulnerability. Include the version of `@ngpdf/core`, what you did, what you expected and what happened. A minimal reproduction helps.

The maintainers aim to acknowledge a report within 3 working days. A fixed vulnerability gets a GitHub Security Advisory, and a CVE is requested through GitHub.

## Supported versions

The latest minor version gets security fixes. Older minors are not supported.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

Under `0.x`, a minor release may contain breaking changes, so a fix can mean updating to the next minor.

## Dependency vulnerabilities

Fix and release times for a vulnerability in a runtime dependency, or in anything shipped in the package, by CVSS v3.1/v4 base score:

| Severity | CVSS | Fixed and released within |
| --- | --- | --- |
| Critical | 9.0–10.0 | 72 hours |
| High | 7.0–8.9 | 7 days |
| Medium | 4.0–6.9 | 30 days |
| Low | 0.1–3.9 | the next planned release |

## In the project

- CI runs `npm audit`, OSV-Scanner, CodeQL and OpenSSF Scorecard. Dependabot keeps dependencies and workflows up to date.
- Releases are published from GitHub Actions with npm trusted publishing and [provenance](https://docs.npmjs.com/generating-provenance-statements), which links each version on npm to the commit and workflow that built it.
- Each GitHub release attaches a CycloneDX SBOM.

The full policy is in [SECURITY.md](https://github.com/ngpdf/ngpdf/blob/main/SECURITY.md).
