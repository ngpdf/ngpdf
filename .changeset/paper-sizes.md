---
'@ngpdf/core': minor
---

`pdf-page` `size` now knows every standard paper size: ISO A0 to A10, B0 to B10, C0 to C10, 2A0 and 4A0, RA0 to RA4 and SRA0 to SRA4, the Japanese B series as `JIS-B0` to `JIS-B10`, and the US sizes `Executive`, `Folio`, `Tabloid`, `Ledger` and `ID1`. All of them are portrait; `orientation="landscape"` turns them. `Ledger` follows CSS Paged Media and is the same 11 × 17 in sheet as `Tabloid`, so the traditional landscape ledger is `size="Ledger" orientation="landscape"`. Size names now match in any case at run time, so `size="a4"` no longer throws; the `PageSize` type keeps the spellings from the docs table. The existing sizes keep the same points, and an unknown name still fails with `ngpdf: unknown page size "<size>" on pdf-page`.
