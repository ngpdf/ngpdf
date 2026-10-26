# Test fonts

Subsets of OFL-licensed fonts, used by the specs and the demo. The license and the copyright
notices are in `OFL.txt`.

| File                                          | From                               | Subset                                                                                                   |
| --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `noto-sans-regular.ttf`, `noto-sans-bold.ttf` | Noto Sans, © Google                | Latin, combining marks, Greek, Cyrillic, punctuation; `kern`, `liga`, `ccmp`, `mark`, `mkmk`; no hinting |
| `noto-sans-jp-subset.ttf`                     | Noto Sans CJK JP, © Adobe          | 日本語の文字テスト and a space; TrueType outlines                                                        |
| `inter-basic.otf`                             | Inter, © The Inter Project Authors | printable ASCII; CFF outlines                                                                            |
| `noto-sans-basic.woff2`                       | Noto Sans, © Google                | printable ASCII, WOFF2                                                                                   |

Made with fontTools' `pyftsubset` in a `python:3.12-slim` container, for example:

```sh
pyftsubset NotoSans-Regular.ttf --no-hinting --name-IDs='*' \
  --unicodes='U+0020-007E,U+00A0-024F,U+0300-036F,U+0370-03FF,U+0400-04FF,U+2000-206F,U+20AC,U+FB00-FB04' \
  --layout-features='kern,liga,ccmp,mark,mkmk' --output-file=noto-sans-regular.ttf
```

fontkit cannot read a CID-keyed CFF font after `pyftsubset` has cut it down (it reports "Not a
CFF Font"), although it reads the original. That is why the Japanese subset was converted to
TrueType outlines with fontTools' `cu2qu`, and why CFF itself is covered by the Inter subset.
