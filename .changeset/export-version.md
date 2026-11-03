---
'@ngpdf/core': minor
---

Adds `VERSION`, the version of `@ngpdf/core` your app runs, as an Angular `Version` with `full`, `major`, `minor` and `patch` (the same shape as `VERSION` from `@angular/core`). Import it from `@ngpdf/core` to put the version in bug reports, support tools or your own `producer`. The version isn't added to the default `producer`, which stays `ngpdf`, so upgrading doesn't change the bytes of a PDF rendered with a fixed `creationDate`.
