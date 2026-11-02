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
- **The PDF as an attack surface.** ngpdf never writes PDF JavaScript, forms or embedded files, and a test checks the output for them. The only actions it writes are the links of `pdf-link`: to an absolute `http:`, `https:` or `mailto:` URL, or to a named destination in the same file for a link to an anchor. A `pdf-note` is a plain Text annotation with no action. A test renders hostile URLs and a note with script-like text and checks that no other action is written. See [Links](/docs/text-and-fonts#links-pdf-link).
- **Network access.** Images and fonts are the only things ngpdf fetches, with the global `fetch`. `renderToBuffer` from `@ngpdf/core/server` fetches nothing itself: see [On the server](#on-the-server). `renderToBlob` and `PdfRenderer.toBlob` fetch as in a browser wherever they run, also on a server.
- **Encrypted files.** `security` on `pdf-document` encrypts the PDF with AES-256. The user password protects the content; permissions are only a request to the viewer, and a password in your app's code is visible to every user. See [Passwords and permissions](/docs/documents-and-pages#passwords-and-permissions).
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

## The preview iframe

`pdf-viewer` from `@ngpdf/core/viewer` shows the PDF in an `<iframe>` whose source is the `blob:` URL of the PDF ngpdf just wrote, and no other URL is ever trusted as its source. The iframe is not sandboxed, because Chrome blocks its PDF viewer in any sandboxed frame. What it loads is same-origin and contains no JavaScript or actions other than the links of `pdf-link`. With a Content-Security-Policy that sets `frame-src` (or `child-src` or `default-src` without them), allow `blob:` there.

## Images and the network

- Images are fetched with `fetch(src, { credentials: 'same-origin' })`, so cookies go only to your own origin.
- Requests run under your page's CORS rules and Content-Security-Policy, like any other `fetch` from your app. An `img-src` directive does not apply to `fetch`; `connect-src` does.
- Error messages show an image or font URL without its query string and fragment, which often carry a token. Where the reason for a failure repeats the URL, as an error from `fetch` or your `fetchImage` may, ngpdf shortens it the same way. Any other text in the reason is passed through as it is, so keep secrets out of the errors your `fetchImage` throws. The original error stays unchanged on the thrown error's `cause`.

## On the server

A server that fetched every URL found in a document could be pointed at internal addresses (server-side request forgery). `renderToBuffer` from `@ngpdf/core/server` therefore refuses `http:` and `https:` image and font URLs unless you pass `fetchImage`, which reads them for it. It refuses relative URLs and every other scheme, such as `file:`, without calling `fetchImage`. The guarantee depends on your `fetchImage`: restrict it to the hosts you expect. This holds for `renderToBuffer` only: on a server, render with it rather than with `renderToBlob` or `PdfRenderer.toBlob`. In `fetchImage`, allow only the hosts you expect, refuse redirects, and set a timeout and a size limit. See [Images and fonts on the server](/docs/server-rendering#images-and-fonts-on-the-server).

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
