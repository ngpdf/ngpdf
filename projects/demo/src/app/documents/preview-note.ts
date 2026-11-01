import { Component, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/** A one-page note whose text comes from the preview form, so each edit renders again. */
@Component({
  selector: 'app-preview-note',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Preview note" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 11">
        <pdf-text style="font-size: 16; font-weight: bold; margin-bottom: 8">{{
          title()
        }}</pdf-text>
        <pdf-text>Edit the title above the preview and this page renders again.</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
export class PreviewNote {
  readonly title = input.required<string>();
}
