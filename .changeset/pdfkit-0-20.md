---
'@ngpdf/core': patch
---

ngpdf now uses pdfkit 0.20. pdfkit's ES module browser build replaces its old standalone bundle, so the combined PDF engine payload loaded on the first render drops from about 1.5 MB to about 610 KB before compression, and from about 433 KB to about 238 KB gzipped. The initial bundle is unchanged.

The text and layout of the PDFs you get are unchanged. Their bytes are not: pdfkit 0.20 compresses streams with a different library and writes `/UserUnit 1` on every page.

A JPEG's EXIF orientation is now read the way pdfkit 0.20 reads it: from the first Exif segment before the image data, even when an XMP segment or a comment comes first. The image's laid-out size keeps matching how pdfkit turns it.

In an Angular CLI app, pdfkit no longer needs to be listed under `allowedCommonJsDependencies`. Angular may now name fontkit's CommonJS dependencies instead (`brotli`, `clone`, `dfa`, `fast-deep-equal` and `tiny-inflate`).
