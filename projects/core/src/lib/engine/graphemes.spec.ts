import { describe, expect, it } from 'vitest';
import { graphemeCount, graphemeStarts } from './graphemes';

describe('graphemes', () => {
  it.each([
    ['', []],
    ['Total', [0, 1, 2, 3, 4]],
    // The last code point the fast path takes, and the first combining mark after it.
    ['a˿b', [0, 1, 2]],
    ['àb', [0, 2]],
    ['Café ok', [0, 1, 2, 3, 5, 6, 7]],
    ['a😀b', [0, 1, 3]],
    ['👩‍💻!', [0, 5]],
  ])('splits %j into clusters starting at %j', (text, starts) => {
    expect(graphemeStarts(text)).toEqual(starts);
    expect(graphemeCount(text)).toBe(starts.length);
  });
});
