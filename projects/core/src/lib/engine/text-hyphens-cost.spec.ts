import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as graphemes from './graphemes';
import { ROOT_TEXT_STYLE } from './style';
import { layoutText, TextMeasureCache } from './text';
import { createPdfkitWriter, type PdfWriter } from './writer';

// Passes through, so the calls can be counted.
vi.mock('./graphemes', async (importOriginal) => {
  const original = await importOriginal<typeof import('./graphemes')>();
  return {
    graphemeCount: vi.fn(original.graphemeCount),
    graphemeStarts: vi.fn(original.graphemeStarts),
  };
});

describe('hyphens: auto on a long word', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });

  it('scans the word for grapheme clusters a fixed number of times, not once per break', () => {
    // 2,000 letters with a break offered between every two.
    const word = 'abcdefghij'.repeat(200);
    const cache = new TextMeasureCache({ hyphenate: (w) => Array.from(w) });
    vi.mocked(graphemes.graphemeCount).mockClear();
    vi.mocked(graphemes.graphemeStarts).mockClear();
    const block = layoutText(
      word,
      { ...ROOT_TEXT_STYLE, hyphens: 'auto' },
      100,
      writer,
      undefined,
      cache,
    );
    expect(block.lines.length).toBeGreaterThan(1);
    expect(block.lines[0]?.text.endsWith('-')).toBe(true);
    const scans =
      vi.mocked(graphemes.graphemeCount).mock.calls.length +
      vi.mocked(graphemes.graphemeStarts).mock.calls.length;
    expect(scans).toBeLessThanOrEqual(2);
  });
});
