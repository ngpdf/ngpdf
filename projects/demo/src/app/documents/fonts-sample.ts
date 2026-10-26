import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * Text in the fonts from `providePdfFonts` (see app.config.ts): Noto Sans for Latin, Greek and
 * Cyrillic, Noto Sans JP for the Japanese, and Helvetica for what neither has.
 */
@Component({
  selector: 'app-fonts-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Font sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-family: 'Noto Sans', 'Noto Sans JP'">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12">
          Fonts and fallback
        </pdf-text>
        <pdf-text>Zoë visits Łódź, Kraków and Åre.</pdf-text>
        <pdf-text>Ελληνικά: καλημέρα. Кириллица: доброе утро.</pdf-text>
        <pdf-text>日本語の文字テスト in the middle of a sentence.</pdf-text>
        <pdf-text style="font-style: italic; margin-top: 8">
          No italic face is registered, so this line uses the regular one.
        </pdf-text>
        <pdf-text style="font-family: Helvetica; margin-top: 8">
          Helvetica, as before: Zoë, but not Łódź.
        </pdf-text>
        <pdf-page-number format="Страница {page} / {total}" style="font-size: 8" />
      </pdf-page>
    </pdf-document>
  `,
})
export class FontsSample {}
