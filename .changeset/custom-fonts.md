---
'@ngpdf/core': minor
---

Add custom fonts: register TTF, OTF, WOFF or WOFF2 files with `providePdfFonts` and name them in
`font-family`. Text in them is not limited to WinAnsi, and each character falls back along the
`font-family` list to the first font that has it. Only the fonts a PDF uses are embedded, as
subsets. Documents that name no registered family render exactly as before.
