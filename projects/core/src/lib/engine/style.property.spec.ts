import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  parseBorder,
  parseEdges,
  parseFlex,
  parseLength,
  parseTransform,
  parseTransformOrigin,
} from './style';

const parsers: Record<string, (value: string) => unknown> = {
  parseLength,
  parseEdges,
  parseBorder,
  parseFlex,
  parseTransform,
  parseTransformOrigin,
};

function returnsOrThrowsNgpdf(parse: (value: string) => unknown, input: string): boolean {
  try {
    parse(input);
    return true;
  } catch (error) {
    return error instanceof Error && error.message.startsWith('ngpdf:');
  }
}

const cssish = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc
    .array(
      fc.constantFrom(
        '1',
        '2.5',
        '-3',
        'px',
        'pt',
        'mm',
        '%',
        'auto',
        ' ',
        'solid',
        '#fff',
        '(',
        ')',
        ',',
        'e',
        'deg',
        'rotate(',
        'scale(',
        'translate(',
        'left',
        'top',
      ),
      {
        maxLength: 12,
      },
    )
    .map((parts) => parts.join('')),
);

describe('style parsers (property)', () => {
  for (const [name, parse] of Object.entries(parsers)) {
    it(`${name} returns or throws an ngpdf: error for any string`, () => {
      fc.assert(fc.property(cssish, (input) => returnsOrThrowsNgpdf(parse, input)));
    });

    it(`${name} handles 100 KB adversarial values in under 50 ms`, () => {
      const inputs = [
        '1'.repeat(1e5),
        '('.repeat(1e5),
        ' '.repeat(1e5) + 'x',
        '1 '.repeat(5e4),
        '1.'.repeat(5e4),
        '-'.repeat(1e5),
        'rotate('.repeat(1e4),
        'scale(1)'.repeat(1e4),
        'translate(1,'.repeat(1e4),
      ];
      for (const input of inputs) {
        let best = Infinity;
        for (let run = 0; run < 5; run++) {
          const start = performance.now();
          expect(returnsOrThrowsNgpdf(parse, input)).toBe(true);
          best = Math.min(best, performance.now() - start);
        }
        expect(best).toBeLessThan(50);
      }
    });
  }
});
