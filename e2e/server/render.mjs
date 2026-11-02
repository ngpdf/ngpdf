// A plain Node script, as an app would write one, run by scripts/server-check.mjs against the
// packed @ngpdf/core. The document is JIT-compiled, so @angular/compiler is loaded first.
// Usage: node render.mjs <out.pdf>
import '@angular/compiler';
import { Component, InjectionToken, inject } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';
import { renderToBuffer } from '@ngpdf/core/server';
import { writeFile } from 'node:fs/promises';

if (typeof document !== 'undefined') throw new Error('server check: a DOM is present');

const ISSUER = new InjectionToken('issuer');
// A 1×1 PNG.
const DOT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

class Invoice {
  number = '';
  logo = DOT;
  issuer = inject(ISSUER);
}
Component({
  selector: 'app-invoice',
  imports: [PDF_ELEMENTS],
  inputs: ['number', 'logo'],
  template: `
    <pdf-document title="Server check">
      <pdf-page size="A4">
        <pdf-image [src]="logo" style="width: 12; height: 12" />
        <pdf-text style="font-family: Helvetica; font-weight: bold; font-size: 18">
          Invoice {{ number }}
        </pdf-text>
        <pdf-text style="font-family: Times">Issued by {{ issuer }}</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})(Invoice);

const providers = [{ provide: ISSUER, useValue: 'Example Supplies Ltd' }];
const pdf = await renderToBuffer(Invoice, { inputs: { number: 'INV-0042' }, providers });
if (!(pdf instanceof Uint8Array)) throw new Error('server check: the result is not a Uint8Array');
await writeFile(process.argv[2], pdf);

// The image policy holds in the published build too: no fetchImage, no remote URL.
const remote = 'https://images.example.com/logo.png';
const refused = await renderToBuffer(Invoice, { inputs: { logo: remote }, providers }).then(
  () => undefined,
  (error) => error.message,
);
const expected = `ngpdf: remote image "${remote}" refused on the server; pass fetchImage`;
if (refused !== expected) throw new Error(`server check: expected "${expected}", got "${refused}"`);

console.log(`server check: ${String(pdf.length)} bytes rendered, remote image refused`);
