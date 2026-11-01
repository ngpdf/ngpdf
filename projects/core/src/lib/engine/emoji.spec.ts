import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import {
  EMOJI_TIMEOUT_MS,
  MAX_EMOJI,
  emojiCodepoints,
  isEmoji,
  loadEmoji,
  type EmojiSource,
} from './emoji';

// A 1×1 opaque PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4y2AIAALMAQ+JqrH2AAAAAElFTkSuQmCC';

const writer = { imageSize: () => ({ width: 1, height: 1 }) };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function doc(...texts: string[]): PdfNode {
  const root = createNode('element', 'pdf-document');
  for (const content of texts) {
    const node = createNode('element', 'pdf-text');
    const run = createNode('text', '', content);
    run.parent = node;
    node.children.push(run);
    node.parent = root;
    root.children.push(node);
  }
  return root;
}

function load(root: PdfNode, source: EmojiSource | undefined, fetchFn?: typeof fetch) {
  const warnings: string[] = [];
  const loading = loadEmoji(root, source, writer, (message) => warnings.push(message), fetchFn);
  return { loading, warnings };
}

describe('isEmoji', () => {
  it.each([
    ['a ZWJ family', '👨‍👩‍👧‍👦'],
    ['a ZWJ sequence of text-default characters', '⛹‍♀'],
    ['a skin tone', '👍🏽'],
    ['a flag', '🇧🇷'],
    ['a keycap', '#️⃣'],
    ['a keycap without VS16', '1⃣'],
    ['a tag sequence', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
    ['an Emoji_Presentation character', '😀'],
    ['text-default with VS16', '©️'],
    ['a heart with VS16', '❤️'],
    ['a victory hand with a skin tone', '✌🏽'],
    ['an index pointing up with a skin tone', '☝🏽'],
    ['a writing hand with a skin tone', '✍🏽'],
    ['a weight lifter with a skin tone', '🏋🏽'],
    ['a detective with a skin tone', '🕵🏽'],
  ])('takes %s', (_, cluster) => {
    expect(isEmoji(cluster)).toBe(true);
  });

  it.each([
    ['©', '©'],
    ['a text-default heart', '❤'],
    ['a digit', '1'],
    ['an emoji with VS15', '😀︎'],
    ['a letter with an accent', 'é'],
    ['a letter followed by ZWJ', 'a‍'],
    ['a text-default modifier base alone', '✌'],
  ])('leaves %s as text', (_, cluster) => {
    expect(isEmoji(cluster)).toBe(false);
  });
});

describe('emojiCodepoints', () => {
  it('joins lower-case hex code points with "-", leaving out U+FE0F', () => {
    expect(emojiCodepoints('👍🏽')).toBe('1f44d-1f3fd');
    expect(emojiCodepoints('©️')).toBe('a9');
    expect(emojiCodepoints('#️⃣')).toBe('23-20e3');
    expect(emojiCodepoints('👨‍👩‍👧')).toBe('1f468-200d-1f469-200d-1f467');
  });
});

describe('loadEmoji', () => {
  it('loads nothing and asks nothing without a source', async () => {
    const { loading, warnings } = load(doc('Hi 👍'), undefined);
    expect((await loading).size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('asks the source once per distinct sequence, with its code points', async () => {
    const source = vi.fn(() => PNG);
    const { loading } = load(doc('👍 and 👍🏽', 'again 👍, © and ©️'), source);
    const images = await loading;
    expect(source.mock.calls).toEqual([
      ['👍', '1f44d'],
      ['👍🏽', '1f44d-1f3fd'],
      ['©️', 'a9'],
    ]);
    expect([...images.keys()]).toEqual(['👍', '👍🏽', '©️']);
    expect(images.get('👍')).toMatchObject({ width: 1, height: 1 });
  });

  it('shares one image between every use of a sequence', async () => {
    const { loading } = load(doc('👍', '👍'), () => PNG);
    const images = await loading;
    expect(images.size).toBe(1);
  });

  it('fills a URL template and fetches it', async () => {
    const bytes = Uint8Array.from(atob(PNG.slice(PNG.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    const fetchFn = vi.fn(() => Promise.resolve(new Response(bytes)));
    const { loading } = load(doc('🇧🇷 #️⃣'), 'https://cdn.example/emoji/{codepoints}.png', fetchFn);
    const images = await loading;
    expect(fetchFn.mock.calls.map(([url]: unknown[]) => url)).toEqual([
      'https://cdn.example/emoji/1f1e7-1f1f7.png',
      'https://cdn.example/emoji/23-20e3.png',
    ]);
    expect(images.size).toBe(2);
  });

  it('takes bytes, a Blob, an ArrayBuffer and a promise', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const results = new Map<string, unknown>([
      ['😀', bytes],
      ['😁', new Blob([bytes])],
      ['😂', bytes.slice().buffer],
      ['😃', Promise.resolve(PNG)],
    ]);
    const { loading } = load(doc('😀😁😂😃'), (emoji) => results.get(emoji) as string);
    const images = await loading;
    expect([...images.keys()]).toEqual(['😀', '😁', '😂', '😃']);
    expect(images.get('😀')?.data).toEqual(bytes);
  });

  it('leaves out a failed or null image, with one warning naming the sequences', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));
    const source = (emoji: string) => {
      if (emoji === '😀') return null;
      if (emoji === '😁') return Promise.reject(new Error('offline'));
      if (emoji === '😂') return 'https://cdn.example/missing.png';
      return PNG;
    };
    const { loading, warnings } = load(doc('😀 😁 😂 😃'), source, fetchFn);
    const images = await loading;
    expect([...images.keys()]).toEqual(['😃']);
    expect(warnings).toEqual(['ngpdf: emoji without an image, drawn as text: 😀 😁 😂']);
  });

  it('leaves out bytes that are not an image', async () => {
    const seen: string[] = [];
    const images = await loadEmoji(
      doc('😀'),
      () => new Uint8Array([1]),
      {
        imageSize: () => {
          throw new Error('not a PNG or JPEG');
        },
      },
      (message) => seen.push(message),
    );
    expect(images.size).toBe(0);
    expect(seen).toEqual(['ngpdf: emoji without an image, drawn as text: 😀']);
  });

  it('leaves out an image the writer cannot embed, and checks each sequence once', async () => {
    const checkImage = vi.fn((data: Uint8Array) => Promise.resolve(data[0] !== 9));
    const seen: string[] = [];
    const images = await loadEmoji(
      doc('😀 😃 😀'),
      (emoji) => (emoji === '😀' ? new Uint8Array([9]) : new Uint8Array([1])),
      { imageSize: () => ({ width: 1, height: 1 }), checkImage },
      (message) => seen.push(message),
    );
    expect([...images.keys()]).toEqual(['😃']);
    expect(checkImage).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['ngpdf: emoji without an image, drawn as text: 😀']);
  });

  it('leaves out an image of a type it cannot read', async () => {
    const seen: string[] = [];
    const images = await loadEmoji(
      doc('😀'),
      () => 42 as unknown as string,
      writer,
      (message) => seen.push(message),
    );
    expect(images.size).toBe(0);
    expect(seen).toEqual(['ngpdf: emoji without an image, drawn as text: 😀']);
  });

  it(`gives each emoji ${String(EMOJI_TIMEOUT_MS)} ms, then draws it as text`, async () => {
    vi.useFakeTimers();
    const source = (emoji: string) => (emoji === '😀' ? new Promise<null>(() => undefined) : PNG);
    const { loading, warnings } = load(doc('😀 😃'), source);
    let images: ReadonlyMap<string, unknown> | undefined;
    void loading.then((loaded) => (images = loaded));
    await vi.advanceTimersByTimeAsync(EMOJI_TIMEOUT_MS - 1);
    expect(images).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(EMOJI_TIMEOUT_MS).toBe(10_000);
    expect([...(images?.keys() ?? [])]).toEqual(['😃']);
    expect(warnings).toEqual(['ngpdf: emoji without an image, drawn as text: 😀']);
  });

  it('aborts the fetch of an emoji that runs out of time', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => undefined);
    });
    const { loading, warnings } = load(
      doc('🎉'),
      '/emoji/{codepoints}.png',
      fetchFn as unknown as typeof fetch,
    );
    await vi.advanceTimersByTimeAsync(EMOJI_TIMEOUT_MS);
    expect((await loading).size).toBe(0);
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
    expect(signals.map((signal) => signal.aborted)).toEqual([true]);
    expect(warnings).toEqual(['ngpdf: emoji without an image, drawn as text: 🎉']);
  });

  it('leaves no timer behind once every emoji has loaded', async () => {
    vi.useFakeTimers();
    await load(doc('😀 😃'), () => PNG).loading;
    expect(vi.getTimerCount()).toBe(0);
  });

  it(`loads at most ${String(MAX_EMOJI)} distinct emoji, with one warning`, async () => {
    // Regional indicator pairs: 676 distinct sequences.
    const pair = (n: number) =>
      String.fromCodePoint(0x1f1e6 + Math.floor(n / 26), 0x1f1e6 + (n % 26));
    const many = Array.from({ length: MAX_EMOJI + 20 }, (_, n) => pair(n)).join(' ');
    const source = vi.fn(() => PNG);
    const { loading, warnings } = load(doc(many, many), source);
    const images = await loading;
    expect(MAX_EMOJI).toBe(500);
    expect(source).toHaveBeenCalledTimes(500);
    expect(images.size).toBe(500);
    expect(images.has(pair(499))).toBe(true);
    expect(images.has(pair(500))).toBe(false);
    expect(warnings).toEqual(['ngpdf: more than 500 distinct emoji; the rest are drawn as text']);
  });

  it('finds emoji in text at any depth, and not in props', async () => {
    const root = doc('plain');
    const span = createNode('element', 'pdf-span');
    const inner = createNode('text', '', 'deep 🎉');
    inner.parent = span;
    span.children.push(inner);
    root.children[0]?.children.push(span);
    const source = vi.fn(() => PNG);
    await load(root, source).loading;
    expect(source.mock.calls).toEqual([['🎉', '1f389']]);
  });
});
