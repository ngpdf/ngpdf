import { describe, expect, it, vi } from 'vitest';
import { createPdfkitWriter } from './writer';

// What a user's test runner gets under Node: pdfkit's Node build, which loads the standard fonts
// itself and has no registerStdFonts.
const NODE_BUILD = '../../../../../node_modules/pdfkit/js/pdfkit.node.mjs';

// A real module namespace reads a missing export as undefined; Vitest's mock throws instead, so the
// factory spells the missing export out.
vi.mock('pdfkit', async () => ({
  ...((await import(/* @vite-ignore */ NODE_BUILD)) as object),
  registerStdFonts: undefined,
}));

describe('createPdfkitWriter on pdfkit’s Node build', () => {
  it('has no registerStdFonts to call', async () => {
    const nodeBuild = (await import(/* @vite-ignore */ NODE_BUILD)) as object;
    expect('registerStdFonts' in nodeBuild).toBe(false);
    expect('PDFDocument' in nodeBuild).toBe(true);
  });

  it('measures and writes without registering fonts', async () => {
    const writer = await createPdfkitWriter({ compress: false });
    expect(writer.widthOf('Hello', 'Times-Roman', 10)).toBeCloseTo(22.22, 2);
    const blob = await writer.write([{ width: 100, height: 100, ops: [] }], {
      creationDate: new Date(0),
    });
    expect(blob.type).toBe('application/pdf');
  });
});
