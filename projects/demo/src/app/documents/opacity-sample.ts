import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * Faded content drawn as one picture: two overlapping squares in a faded view, where the overlap
 * stays one solid color, and a faded card whose text and border do not show its background.
 */
@Component({
  selector: 'app-opacity-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Opacity" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 11">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12"
          >Faded content</pdf-text
        >

        <pdf-text style="margin-bottom: 6">Two overlapping squares in a view at 50%:</pdf-text>
        <pdf-view style="opacity: 0.5; flex-direction: row; margin-bottom: 18">
          <pdf-view style="width: 80; height: 80; background-color: #c62828" />
          <pdf-view
            style="width: 80; height: 80; margin-left: -40; margin-top: 30; background-color: #1565c0"
          />
        </pdf-view>

        <pdf-text style="margin-bottom: 6">A card at 60%, with a gradient band:</pdf-text>
        <pdf-view
          style="opacity: 0.6; padding: 12; background-color: #1f2a44; border: 4 solid #f9a825; border-radius: 6"
        >
          <pdf-text style="color: white; font-size: 14; font-weight: bold">Draft</pdf-text>
          <pdf-text style="color: white"
            >Not approved yet. Ask Rosa Example before sharing.</pdf-text
          >
          <pdf-view
            style="height: 16; margin-top: 8; background: linear-gradient(to right, #f9a825, transparent)"
          />
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
export class OpacitySample {}
