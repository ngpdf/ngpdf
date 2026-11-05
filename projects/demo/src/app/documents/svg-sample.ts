import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

interface Quarter {
  readonly label: string;
  readonly members: number;
}

/**
 * One icon per name, drawn in the color of the pdf-svg through currentColor. The heart is a
 * `symbol` with its own 48 × 48 viewBox, as in an icon sprite, which the `use` scales to 24 × 24.
 */
const ICONS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round">
  <defs>
    <g id="leaf"><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l7-7"/></g>
    <g id="drop"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></g>
    <g id="sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></g>
    <g id="box"><rect x="3" y="7" width="18" height="13" rx="2"/><polyline points="3 7 12 13 21 7"/></g>
  </defs>
  <symbol id="heart" viewBox="0 0 48 48" stroke-width="4">
    <path d="M24 41S6 30 6 17a9 9 0 0 1 18-4 9 9 0 0 1 18 4c0 13-18 24-18 24z"/>
  </symbol>
  <use href="#ICON" width="24" height="24"/>
</svg>`;

/** A logo from a file, an icon set and a small chart, all drawn by pdf-svg. */
@Component({
  selector: 'app-svg-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="SVG sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 10">
        <pdf-view style="flex-direction: row; align-items: center; margin-bottom: 16">
          <pdf-svg src="/svg-sample-logo.svg" style="width: 64; margin-right: 12" />
          <pdf-view>
            <pdf-text style="font-size: 16; font-weight: bold">Hillside Co-op</pdf-text>
            <pdf-text style="color: #555">Made-up data for the ngpdf demo</pdf-text>
          </pdf-view>
        </pdf-view>

        <pdf-text style="font-weight: bold; margin-bottom: 6">What we share</pdf-text>
        <pdf-view style="flex-direction: row; margin-bottom: 20">
          @for (icon of icons; track icon.name) {
            <pdf-view style="flex: 1; align-items: center">
              <pdf-svg [src]="icon.svg" style="width: 28; color: #15803d" />
              <pdf-text style="margin-top: 4; color: #333">{{ icon.label }}</pdf-text>
            </pdf-view>
          }
        </pdf-view>

        <pdf-text style="font-weight: bold; margin-bottom: 6">Members by quarter</pdf-text>
        <pdf-svg [src]="chart" style="width: 100%; border: 1 solid #ccc" />
        <pdf-view style="flex-direction: row; margin-top: 4">
          @for (quarter of quarters; track quarter.label) {
            <pdf-text style="flex: 1; text-align: center; color: #555">{{
              quarter.label
            }}</pdf-text>
          }
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
export class SvgSample {
  readonly icons = [
    { name: 'leaf', label: 'Seeds' },
    { name: 'drop', label: 'Water' },
    { name: 'sun', label: 'Solar' },
    { name: 'box', label: 'Boxes' },
    { name: 'heart', label: 'Care' },
  ].map((icon) => ({ ...icon, svg: ICONS.replace('#ICON', `#${icon.name}`) }));

  readonly quarters: readonly Quarter[] = [
    { label: 'Q1', members: 18 },
    { label: 'Q2', members: 31 },
    { label: 'Q3', members: 26 },
    { label: 'Q4', members: 40 },
  ];

  /** Bars, a trend line through their tops and a dot on each, in a 200 × 100 viewBox. */
  readonly chart = ((): string => {
    const max = 40;
    const slot = 200 / this.quarters.length;
    const tops = this.quarters.map((quarter, index) => ({
      x: index * slot + slot / 2,
      y: 100 - (quarter.members / max) * 90,
    }));
    const bars = tops
      .map(
        (top) =>
          `<rect x="${String(top.x - 12)}" y="${String(top.y)}" width="24" height="${String(100 - top.y)}" rx="2"/>`,
      )
      .join('');
    const points = tops.map((top) => `${String(top.x)},${String(top.y)}`).join(' ');
    const dots = tops
      .map((top) => `<circle cx="${String(top.x)}" cy="${String(top.y)}" r="3"/>`)
      .join('');
    return `<svg viewBox="0 0 200 100">
      <g stroke="#ddd" stroke-width="0.5" stroke-dasharray="2 2">
        <line x1="0" y1="32.5" x2="200" y2="32.5"/><line x1="0" y1="55" x2="200" y2="55"/>
        <line x1="0" y1="77.5" x2="200" y2="77.5"/>
      </g>
      <g fill="#dd0031" fill-opacity="0.85">${bars}</g>
      <polyline points="${points}" fill="none" stroke="#333" stroke-width="1.5"/>
      <g fill="#fff" stroke="#333" stroke-width="1">${dots}</g>
    </svg>`;
  })();
}
