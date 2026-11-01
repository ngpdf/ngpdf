import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { testFont } from '../../testing/test-fonts';
import { renderDocument, type FontSource } from './index';
import { createPdfkitWriter, type DocumentInfo, type PageOps, type PdfWriter } from './writer';

let real: PdfWriter;
beforeAll(async () => {
  real = await createPdfkitWriter({ compress: false });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function el(
  tag: string,
  style: Record<string, string> = {},
  children: PdfNode[] = [],
  props: Record<string, unknown> = {},
): PdfNode {
  const node = createNode('element', tag);
  node.rawStyle = style;
  node.owner = { pdfProps: () => props };
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

function text(content: string, style: Record<string, string> = {}): PdfNode {
  const node = el('pdf-text', style);
  const run = createNode('text', '', content);
  run.parent = node;
  node.children.push(run);
  return node;
}

function host(documentProps: Record<string, unknown>, pages: PdfNode[]): PdfNode {
  return el('div', {}, [el('pdf-document', {}, pages, documentProps)]);
}

/** Pages of 1 and 3 sheets: three 400pt rows fill one A4 page at two rows. */
function twoPages(documentProps: Record<string, unknown> = {}): PdfNode {
  const one = el('pdf-page', {}, [text('single')], { size: 'A4' });
  const rows = [0, 1, 2, 3, 4, 5].map(() => el('pdf-view', { height: '400' }));
  const three = el('pdf-page', {}, rows, { size: 'A4' });
  return host(documentProps, [one, three]);
}

interface Recorded {
  pages: readonly PageOps[];
  info: DocumentInfo;
}

function recordingWriter(): PdfWriter & { recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  return {
    widthOf: (t, f, s) => real.widthOf(t, f, s),
    ascent: (f, s) => real.ascent(f, s),
    hasGlyph: (f, c) => real.hasGlyph(f, c),
    registerFont: (f, d) => {
      real.registerFont(f, d);
    },
    imageSize: (d) => real.imageSize(d),
    write: (pages, info) => {
      recorded.push({ pages, info });
      return Promise.resolve(new Blob(['x']));
    },
    recorded,
  };
}

async function bytesOf(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(await blob.arrayBuffer());
}

describe('renderDocument', () => {
  it('hands the writer every page and the document metadata', async () => {
    const writer = recordingWriter();
    const props = {
      title: 'Report',
      author: 'Ana',
      subject: 'S',
      keywords: ['a', 'b'],
      language: 'en-us',
      creator: 'Report App',
      producer: 'Acme PDF',
      pageMode: 'UseThumbs',
      pageLayout: 'TwoPageRight',
    };
    await renderDocument(twoPages(props), { writer, dev: false });
    const [{ pages, info }] = writer.recorded as [Recorded];
    expect(pages).toHaveLength(4);
    expect(info).toMatchObject({ ...props, language: 'en-US' });
    expect(pages[0]!.width).toBe(595.28);
    expect(pages[0]!.ops.some((op) => op.op === 'text' && op.text === 'single')).toBe(true);
  });

  it('breaks pages in the same places with debug on, adding outlines after each sheet', async () => {
    const paragraph = Array.from({ length: 40 }, (_, i) => `Line ${String(i)} of a long text.`);
    const build = (debug: boolean): PdfNode => {
      const rows = [0, 1, 2].map(() => el('pdf-view', { height: '250', padding: '6' }));
      const wrapper = el('pdf-view', { padding: '10' }, [...rows, text(paragraph.join(' '))]);
      const header = el('pdf-view', { height: '20' }, [text('Head')], { fixed: 'top' });
      const page = el('pdf-page', { padding: '36' }, [header, wrapper, el('pdf-page-number')], {
        size: 'A5',
      });
      return host({ debug }, [page]);
    };
    const plain = recordingWriter();
    const debug = recordingWriter();
    await renderDocument(build(false), { writer: plain, dev: false });
    await renderDocument(build(true), { writer: debug, dev: false });
    const plainPages = plain.recorded[0]!.pages;
    const debugPages = debug.recorded[0]!.pages;
    expect(plainPages.length).toBeGreaterThan(1);
    expect(debugPages).toHaveLength(plainPages.length);
    debugPages.forEach((sheet, index) => {
      const ops = plainPages[index]!.ops;
      expect(sheet.ops.slice(0, ops.length)).toEqual(ops);
      // The fixed header and its text, the page number and the piece of the plain wrapper.
      const full = sheet.ops.filter(
        (op) =>
          op.op === 'path' &&
          op.color === '#ff0000' &&
          op.from.x === 36 &&
          Math.round((op.segments[0]?.to.x ?? 0) * 100) === 38353,
      );
      expect(full).toHaveLength(4);
    });
  });

  it('warns once per render in dev mode while debug outlines are on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderDocument(twoPages({ debug: true }), { writer: recordingWriter(), dev: true });
    expect(warn.mock.calls).toEqual([['ngpdf: debug outlines are on']]);
    warn.mockClear();
    await renderDocument(twoPages({ debug: false }), { writer: recordingWriter(), dev: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts pageMode UseOutlines, which opens the bookmarks panel', async () => {
    const writer = recordingWriter();
    await renderDocument(twoPages({ pageMode: 'UseOutlines' }), { writer, dev: false });
    expect(writer.recorded[0]!.info.pageMode).toBe('UseOutlines');
  });

  it('hands the writer the anchors, the internal links and the outline', async () => {
    const writer = recordingWriter();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const chapter = el('pdf-view', {}, [el('pdf-text', {}, [], { bookmark: 'Detail' })], {
      anchor: 'ch1',
      bookmark: 'Chapter 1',
    });
    const page = el(
      'pdf-page',
      {},
      [
        el('pdf-link', {}, [text('Go')], { href: '#ch1' }),
        el('pdf-link', {}, [text('Lost')], { href: '#ch9' }),
        chapter,
        el('pdf-view', {}, [], { anchor: 'ch1' }),
      ],
      { size: 'A4' },
    );
    await renderDocument(host({}, [page]), { writer, dev: true });
    const [{ pages, info }] = writer.recorded as [Recorded];
    const ops = pages[0]!.ops;
    expect(ops.filter((op) => op.op === 'link')).toMatchObject([{ kind: 'goto', name: 'ch1' }]);
    expect(ops.filter((op) => op.op === 'anchor')).toMatchObject([
      { id: 0, name: 'ch1' },
      { id: 1 },
    ]);
    expect(info.outline).toEqual([
      { title: 'Chapter 1', anchor: 0, children: [{ title: 'Detail', anchor: 1, children: [] }] },
    ]);
    const warned = warn.mock.calls.flat();
    expect(warned).toContain('ngpdf: duplicate anchor "ch1"');
    expect(warned).toContain('ngpdf: pdf-link href "#ch9" names no anchor; no link written');
  });

  it('leaves unset metadata out of the info', async () => {
    const writer = recordingWriter();
    await renderDocument(twoPages(), { writer, dev: false });
    expect(Object.keys(writer.recorded[0]!.info)).toEqual(['producer', 'creationDate']);
    expect(writer.recorded[0]!.info.producer).toBe('ngpdf');
  });

  it.each([
    ['language', 'not_a_locale', 'ngpdf: invalid language "not_a_locale"'],
    ['pageMode', 'UseAttachments', 'ngpdf: invalid pageMode "UseAttachments"'],
    ['pageLayout', 'InvalidLayout', 'ngpdf: invalid pageLayout "InvalidLayout"'],
  ])('rejects an invalid %s', async (key, value, message) => {
    await expect(
      renderDocument(twoPages({ [key]: value }), { writer: recordingWriter(), dev: false }),
    ).rejects.toThrow(message);
  });

  it.each([
    ['pageMode', null],
    ['pageMode', 42],
    ['pageLayout', null],
    ['pageLayout', 42],
  ])('rejects non-string %s values (%s)', async (key, value) => {
    await expect(
      renderDocument(twoPages({ [key]: value }), { writer: recordingWriter(), dev: false }),
    ).rejects.toThrow(`ngpdf: invalid ${key}`);
  });

  it('hands the writer the security with its permissions filled in', async () => {
    const writer = recordingWriter();
    await renderDocument(
      twoPages({ security: { userPassword: 'open', permissions: { copying: false } } }),
      {
        writer,
        dev: false,
      },
    );
    expect(writer.recorded[0]!.info.security).toEqual({
      userPassword: 'open',
      permissions: {
        printing: 'high',
        copying: false,
        modifying: true,
        annotating: true,
        fillingForms: true,
        contentAccessibility: true,
        documentAssembly: true,
      },
    });
  });

  it('leaves out a security that changes nothing', async () => {
    const writer = recordingWriter();
    await renderDocument(twoPages({ security: { permissions: { printing: 'high' } } }), {
      writer,
      dev: false,
    });
    expect('security' in writer.recorded[0]!.info).toBe(false);
  });

  it('rejects an invalid security', async () => {
    await expect(
      renderDocument(twoPages({ security: { userPassword: 42 } }), {
        writer: recordingWriter(),
        dev: false,
      }),
    ).rejects.toThrow('ngpdf: invalid security userPassword');
  });

  it('rejects an empty language tag and non-string language values', async () => {
    await expect(
      renderDocument(twoPages({ language: '' }), { writer: recordingWriter(), dev: false }),
    ).rejects.toThrow('ngpdf: invalid language ""');
    await expect(
      renderDocument(twoPages({ language: 42 }), { writer: recordingWriter(), dev: false }),
    ).rejects.toThrow('ngpdf: invalid language');
    await expect(
      renderDocument(twoPages({ language: null }), { writer: recordingWriter(), dev: false }),
    ).rejects.toThrow('ngpdf: invalid language');
  });

  it('numbers page-number text across all pages of the document', async () => {
    const writer = recordingWriter();
    const number = el('pdf-page-number', {}, [], { format: '{page}/{total}' });
    const first = el('pdf-page', {}, [text('a'), number], { size: 'A4' });
    const second = el(
      'pdf-page',
      { 'break-before': 'true' },
      [text('b'), el('pdf-page-number', {}, [], { format: '{page}/{total}' })],
      { size: 'A4' },
    );
    await renderDocument(host({}, [first, second]), { writer, dev: false });
    const labels = writer.recorded[0]!.pages.map((p) =>
      p.ops.flatMap((op) => (op.op === 'text' ? [op.text] : [])).at(-1),
    );
    expect(labels).toEqual(['1/2', '2/2']);
  });

  it('draws the text of pdf-spans, also inside a component host, in their own styles', async () => {
    const writer = recordingWriter();
    const span = el('pdf-span', { 'font-weight': 'bold' }, [createNode('text', '', '42')]);
    const paragraph = el('pdf-text', {}, [
      createNode('text', '', 'Total: '),
      el('app-amount', {}, [span]),
    ]);
    paragraph.children[0]!.parent = paragraph;
    await renderDocument(host({}, [el('pdf-page', {}, [paragraph], { size: 'A4' })]), {
      writer,
      dev: false,
    });
    const ops = writer.recorded[0]!.pages[0]!.ops.flatMap((op) =>
      op.op === 'text' ? [[op.text, op.font]] : [],
    );
    expect(ops).toEqual([
      ['Total: ', 'Helvetica'],
      ['42', 'Helvetica-Bold'],
    ]);
  });

  it('hyphenates with the hyphenation function and the document language', async () => {
    const writer = recordingWriter();
    const hyphenate = vi.fn((word: string) =>
      word === 'hyphenation' ? ['hy', 'phen', 'ation'] : [word],
    );
    const column = el('pdf-view', { width: '40', hyphens: 'auto' }, [text('hyphenation')]);
    await renderDocument(
      host({ language: 'en-us' }, [el('pdf-page', {}, [column], { size: 'A4' })]),
      { writer, dev: false, hyphenate },
    );
    const drawn = writer.recorded[0]!.pages[0]!.ops.flatMap((op) =>
      op.op === 'text' ? [op.text] : [],
    );
    expect(drawn).toEqual(['hyphen-', 'ation']);
    expect(hyphenate).toHaveBeenCalledExactlyOnceWith('hyphenation', 'en-US');
  });

  it('asks the hyphenation function again in each render, with that render’s language', async () => {
    const hyphenate = vi.fn((word: string) =>
      word === 'hyphenation' ? ['hy', 'phen', 'ation'] : [word],
    );
    const page = () =>
      el(
        'pdf-page',
        {},
        [el('pdf-view', { width: '40', hyphens: 'auto' }, [text('hyphenation')])],
        {
          size: 'A4',
        },
      );
    await renderDocument(host({ language: 'en-us' }, [page()]), {
      writer: recordingWriter(),
      dev: false,
      hyphenate,
    });
    const writer = recordingWriter();
    await renderDocument(host({}, [page()]), { writer, dev: false, hyphenate });
    expect(hyphenate.mock.calls).toEqual([
      ['hyphenation', 'en-US'],
      ['hyphenation', undefined],
    ]);
    const drawn = writer.recorded[0]!.pages[0]!.ops.flatMap((op) =>
      op.op === 'text' ? [op.text] : [],
    );
    expect(drawn).toEqual(['hyphen-', 'ation']);
  });

  it('warns once that hyphens: auto has no hyphenation function', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const column = el('pdf-view', { width: '40', hyphens: 'auto' }, [
      text('hyphenation'),
      text('extraordinary'),
    ]);
    await renderDocument(host({}, [el('pdf-page', {}, [column], { size: 'A4' })]), {
      writer: recordingWriter(),
      dev: true,
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'ngpdf: hyphens: auto needs providePdfHyphenation; words break only at soft hyphens',
    );
  });

  it('draws a fixed header on every sheet of its page', async () => {
    const writer = recordingWriter();
    const header = el('pdf-view', {}, [text('Header')], { fixed: 'top' });
    const rows = [0, 1, 2, 3].map(() => el('pdf-view', { height: '400' }));
    await renderDocument(host({}, [el('pdf-page', {}, [header, ...rows], { size: 'A4' })]), {
      writer,
      dev: false,
    });
    const headers = writer.recorded[0]!.pages.map(
      (p) => p.ops.filter((op) => op.op === 'text' && op.text === 'Header').length,
    );
    expect(headers).toEqual([1, 1]);
  });

  it('paints a pdf-canvas once per render, also inside a component host', async () => {
    const writer = recordingWriter();
    const paint = vi.fn(
      (ctx: {
        moveTo(x: number, y: number): { lineTo(x: number, y: number): { stroke(): unknown } };
      }) => ctx.moveTo(0, 10).lineTo(100, 10).stroke(),
    );
    const canvas = el('pdf-canvas', { height: '20' }, [], { paint });
    const header = el('pdf-view', {}, [el('app-signature', {}, [canvas])], { fixed: 'top' });
    const rows = [0, 1, 2, 3].map(() => el('pdf-view', { height: '400' }));
    await renderDocument(host({}, [el('pdf-page', {}, [header, ...rows], { size: 'A4' })]), {
      writer,
      dev: false,
    });
    expect(paint).toHaveBeenCalledTimes(1);
    const shapes = writer.recorded[0]!.pages.map((p) => p.ops.filter((op) => op.op === 'shape'));
    expect(shapes.map((ops) => ops.length)).toEqual([1, 1]);
    expect(shapes[0]![0]).toMatchObject({
      segments: [
        { kind: 'move', to: { x: 0, y: 10 } },
        { kind: 'line', to: { x: 100, y: 10 } },
      ],
    });
  });

  it('rejects the render with the error a pdf-canvas paint throws', async () => {
    const paint = () => {
      throw new Error('no data');
    };
    const page = el('pdf-page', {}, [el('pdf-canvas', { height: '20' }, [], { paint })]);
    await expect(
      renderDocument(host({}, [page]), { writer: recordingWriter(), dev: false }),
    ).rejects.toThrow('ngpdf: pdf-canvas paint failed: no data');
  });

  it('rejects a pdf-image with children before fetching it, naming the element', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchFn);
    const image = el('pdf-image', {}, [text('caption')], { src: '/logo.png' });
    const page = el('pdf-page', {}, [image], { size: 'A4' });
    await expect(renderDocument(host({}, [page]), { writer: recordingWriter() })).rejects.toThrow(
      'ngpdf: pdf-image cannot have children (found <pdf-text>)',
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws when the tree has no pdf-document', async () => {
    await expect(renderDocument(el('div'), { writer: recordingWriter() })).rejects.toThrow(
      'ngpdf: no pdf-document in the rendered component',
    );
    await expect(renderDocument(createNode('text', '', 'x'))).rejects.toThrow(
      'ngpdf: no pdf-document',
    );
  });

  it('reads the clock once per render when creationDate is unset', async () => {
    const RealDate = Date;
    let constructed = 0;
    class CountingDate extends RealDate {
      constructor(...args: [] | [number | string | Date]) {
        if (args.length === 0) constructed++;
        super(...(args as [number]));
      }
    }
    vi.stubGlobal('Date', CountingDate);
    const writer = recordingWriter();
    await renderDocument(twoPages(), { writer, dev: false });
    expect(constructed).toBe(1);
    expect(writer.recorded[0]!.info.creationDate).toBeInstanceOf(RealDate);
  });

  it('uses a bound creationDate and does not need the clock', async () => {
    const writer = recordingWriter();
    const date = new Date(Date.UTC(2026, 0, 2));
    await renderDocument(twoPages({ creationDate: date }), { writer, dev: false });
    expect(writer.recorded[0]!.info.creationDate).toBe(date);
  });

  it('resolves a PDF Blob from the real writer', async () => {
    const blob = await renderDocument(twoPages({ creationDate: new Date(0) }), { dev: false });
    expect(blob.type).toBe('application/pdf');
    expect(await bytesOf(blob)).toMatch(/^%PDF-/);
  });

  it('writes none of the active-content keys, and no URI but http, https or mailto', async () => {
    // The real engine, uncompressed so the object dictionaries are readable.
    const plain = await bytesOf(
      await renderDocument(twoPages({ title: 'T', creationDate: new Date(0) }), {
        writer: await createPdfkitWriter({ compress: false }),
        dev: false,
      }),
    );
    const hrefs = [
      'https://example.com/ok',
      'http://example.com/ok',
      'mailto:team@example.com',
      'javascript:app.alert(1)',
      ' JAVASCRIPT:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'launch:calc.exe',
      '/relative',
      'not a url',
      '',
    ];
    const blocks = hrefs.map((href) => el('pdf-link', {}, [text('block')], { href }));
    const inline = hrefs.map((href, i) =>
      el('pdf-link', {}, [createNode('text', '', `inline ${String(i)} `)], { href }),
    );
    // Internal links: one to an anchor, and ones to names no anchor has.
    const internal = ['#ok', '#missing', '#'].flatMap((href) => [
      el('pdf-link', {}, [text('to')], { href }),
      el('pdf-text', {}, [el('pdf-link', {}, [createNode('text', '', 'to')], { href })]),
    ]);
    const target = el('pdf-view', {}, [text('target')], { anchor: 'ok', bookmark: 'Target' });
    // A note holding script-like text stays a plain Text annotation with no action.
    const note = el('pdf-note', {}, [createNode('text', '', 'javascript:app.alert(1)')], {
      author: '/JavaScript',
      icon: 'note',
      open: true,
    });
    const page = el(
      'pdf-page',
      {},
      [...blocks, el('pdf-text', {}, inline), ...internal, target, note],
      { size: 'A4' },
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const linked = await bytesOf(
      await renderDocument(host({ creationDate: new Date(0) }, [page]), {
        writer: await createPdfkitWriter({ compress: false }),
        dev: true,
      }),
    );
    for (const body of [plain, linked]) {
      for (const key of ['/JavaScript', '/JS', '/OpenAction', '/Launch', '/AA', '/EmbeddedFile']) {
        // The note's author is a string, `(/JavaScript)`, never the key.
        expect(body.replaceAll('(/JavaScript)', '')).not.toContain(key);
      }
    }
    const notes = linked.split('endobj').filter((body) => body.includes('/Subtype /Text'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain(String.raw`/Contents (javascript:app.alert\(1\))`);
    expect(notes[0]).not.toMatch(/\/(?:A|AA|F)\b/);
    const uris = [...linked.matchAll(/\/URI\s*\(((?:\\.|[^\\)])*)\)/g)].map((match) => match[1]);
    // The three allowed URLs, once as a block and once inline.
    expect(uris).toHaveLength(6);
    for (const uri of uris) expect(uri).toMatch(/^(?:https?:\/\/|mailto:)/);
    // Every action is a URI action or a GoTo to a named destination in the file.
    const actions = [...linked.matchAll(/\/S\s*\/(\w+)/g)].map((match) => match[1]);
    expect(actions.filter((kind) => kind === 'URI')).toHaveLength(6);
    expect(actions.filter((kind) => kind === 'GoTo')).toHaveLength(2);
    expect(actions).toHaveLength(8);
    const goTos = [...linked.matchAll(/\/S\s*\/GoTo\s*\/D\s*\(([^)]*)\)/g)].map((m) => m[1]);
    expect(goTos).toEqual(['ok', 'ok']);
    const dests = /\/Dests\s*<<[\s\S]*?\/Names\s*\[([\s\S]*?)\]\s*>>/.exec(linked)?.[1] ?? '';
    for (const name of goTos) expect(dests).toContain(`(${name ?? ''}) [`);
    // Each /URI is either an action type or one of the six strings above.
    expect(linked.match(/\/URI\b/g)).toHaveLength(12);
    expect(warn.mock.calls.flat().join('\n')).toContain('javascript:app.alert(1)');
  });

  it('writes each name of a table cell on one line, as laid out (licences list geometry)', async () => {
    // A4 landscape, padding 36, 9pt Helvetica, cells padded 4: the 3fr column is 255.9pt wide
    // inside. Each name kerns across a space (" V", " T") and fits on one line.
    const names = ['Padaria Trigo Dourado Ltda', 'Clínica Bem Viver', 'Mercearia Vila Nova'];
    const cell = (content: string): PdfNode =>
      el('pdf-cell', { 'padding-left': '4', 'padding-right': '4' }, [text(content)]);
    const rows = names.map((name, i) =>
      el('pdf-row', { 'padding-top': '4', 'padding-bottom': '4' }, [
        cell(String(i + 1)),
        cell('Agenda Integrada'),
        cell(name),
        ...['10/04/2025', '10/04/2026', 'NF-2026039', 'R$ 1.621,03'].map(cell),
      ]),
    );
    const table = el('pdf-table', {}, rows, { columns: [30, '2fr', '3fr', 70, 70, 80, 80] });
    const page = el('pdf-page', { padding: '36', 'font-size': '9' }, [table], {
      size: 'A4',
      orientation: 'landscape',
    });
    const pdfkit = await createPdfkitWriter({ compress: false });
    let drawn: PageOps[] = [];
    const writer: PdfWriter = {
      ...recordingWriter(),
      write: (pages, info) => {
        drawn = [...pages];
        return pdfkit.write(pages, info);
      },
    };
    const body = await bytesOf(
      await renderDocument(host({ creationDate: new Date(0) }, [page]), { writer, dev: false }),
    );
    const texts = drawn.flatMap((p) => p.ops).filter((op) => op.op === 'text');
    for (const name of names) expect(texts.map((op) => op.text)).toContain(name);
    expect(texts).toHaveLength(names.length * 7);
    // One text object per text op: pdfkit wrapped nothing on its own.
    expect(body.match(/^BT$/gm)).toHaveLength(texts.length);
  });

  it('gives the same bytes for the same tree and a fixed creationDate', async () => {
    const render = async (): Promise<string> => {
      const writer = await createPdfkitWriter({ compress: false });
      const props = { title: 'T', creationDate: new Date(0) };
      return bytesOf(await renderDocument(twoPages(props), { writer, dev: false }));
    };
    expect(await render()).toBe(await render());
  });

  it('measures repeated text once per render, and again in the next render', async () => {
    const writer = recordingWriter();
    const measured: string[] = [];
    writer.widthOf = (t, f, s) => {
      measured.push(`${f} ${String(s)} ${t}`);
      return real.widthOf(t, f, s);
    };
    // The same words on every row and on both pages.
    const page = (): PdfNode =>
      el(
        'pdf-page',
        {},
        [0, 1, 2, 3].map(() => text('Same words on every row')),
        {
          size: 'A4',
        },
      );
    const tree = (): PdfNode => host({}, [page(), page()]);

    await renderDocument(tree(), { writer, dev: false });
    const first = measured.length;
    expect(new Set(measured).size).toBe(first);
    await renderDocument(tree(), { writer, dev: false });
    expect(measured.length).toBe(first * 2);
  });

  describe('style fidelity', () => {
    /** The body of an uncompressed PDF drawn by the real writer from one A4 page. */
    async function bodyOf(children: PdfNode[]): Promise<string> {
      const writer = await createPdfkitWriter({ compress: false });
      const page = el('pdf-page', { padding: '36' }, children, { size: 'A4' });
      const blob = await renderDocument(host({ creationDate: new Date(0) }, [page]), {
        writer,
        dev: false,
      });
      return bytesOf(blob);
    }

    // pdfkit sets colors with `/DeviceRGB cs` then `<r> <g> <b> scn` (fill) or `SCN` (stroke).
    const operands = (body: string, operator: string): string[] =>
      [...body.matchAll(new RegExp(`^([^\\n]*) ${operator}$`, 'gm'))].map((match) => match[1]!);
    const fillOpacities = (body: string): string[] =>
      [...body.matchAll(/^\/ca (\S+)$/gm)].map((match) => match[1]!);

    it('writes rgb(), named, rgba() and 8-digit hex colors as their channels', async () => {
      const body = await bodyOf([
        el('pdf-view', { 'background-color': 'rgb(255, 0, 0)', height: '10' }),
        el('pdf-view', { 'background-color': 'Navy', height: '10' }),
        el('pdf-view', { 'border-top': '2 solid rgb(0 128 0)', height: '10' }),
        text('Half', { color: 'rgba(0, 0, 255, 0.5)' }),
        el('pdf-view', { 'background-color': '#ff000080', height: '10' }),
      ]);
      const half = String(128 / 255);
      expect(operands(body, 'scn')).toEqual(['1 0 0', `0 0 ${half}`, '0 0 1', '1 0 0']);
      expect(operands(body, 'SCN')).toEqual([`0 ${half} 0`]);
      // The alpha becomes the fill opacity of the graphics state, never a channel.
      expect(fillOpacities(body)).toEqual(expect.arrayContaining(['0.5', '0.501961']));
    });

    it('paints nothing for transparent', async () => {
      const body = await bodyOf([
        el('pdf-view', { 'background-color': 'transparent', border: '1 solid transparent' }, [
          text('Hidden', { color: 'transparent' }),
        ]),
        text('Shown', { color: 'red' }),
      ]);
      expect(operands(body, 'scn')).toEqual(['1 0 0']);
      expect(operands(body, 'SCN')).toEqual([]);
      expect(body).not.toMatch(/ re$/m);
      expect(body.match(/^BT$/gm)).toHaveLength(1);
    });
  });

  describe('warnings', () => {
    function tallPage(): PdfNode {
      const unit = (): PdfNode => el('pdf-view', { height: '1200' });
      return host({}, [el('pdf-page', {}, [unit(), unit()], { size: 'A4' })]);
    }

    it('prints identical warnings once', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await renderDocument(tallPage(), { writer: recordingWriter(), dev: true });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'ngpdf: pdf-view is taller than a page and is cut at the bottom',
      );
    });

    it('still prints the warnings when the write fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const writer = { ...recordingWriter(), write: () => Promise.reject(new Error('disk full')) };
      await expect(renderDocument(tallPage(), { writer, dev: true })).rejects.toThrow('disk full');
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('routes the border style warning through the render, once and only in dev mode', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const dashed = (): PdfNode =>
        host({}, [
          el('pdf-page', {}, [
            el('pdf-view', { border: '1 dashed red' }),
            el('pdf-view', { border: '1 dashed blue' }),
          ]),
        ]);
      await renderDocument(dashed(), { writer: recordingWriter(), dev: false });
      expect(warn).not.toHaveBeenCalled();
      await renderDocument(dashed(), { writer: recordingWriter(), dev: true });
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        'ngpdf: border style "dashed" is not supported; drawing solid',
      );
    });

    it('prints nothing when dev is false', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await renderDocument(tallPage(), { writer: recordingWriter(), dev: false });
      expect(warn).not.toHaveBeenCalled();
    });

    it('defaults dev to the ngDevMode check', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await renderDocument(tallPage(), { writer: recordingWriter() });
      expect(warn).toHaveBeenCalledTimes(1);
      vi.stubGlobal('ngDevMode', false);
      await renderDocument(tallPage(), { writer: recordingWriter() });
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('names every replaced character once, in one message', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const number = el('pdf-page-number', {}, [], { format: 'Ω {page}' });
      const doc = host({}, [el('pdf-page', {}, [text('ő ő'), text('ő 😀'), number])]);
      const writer = recordingWriter();
      await renderDocument(doc, { writer, dev: true });
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]![0]);
      expect(message).toMatch(/^ngpdf: characters outside WinAnsi replaced with "\?": /);
      for (const char of ['ő', '😀', 'Ω']) expect(message.split(char)).toHaveLength(2);
      const texts = writer.recorded[0]!.pages[0]!.ops.flatMap((op) =>
        op.op === 'text' ? [op.text] : [],
      );
      expect(texts).toContain('? ?');
    });
  });
});

describe('renderDocument with fonts', () => {
  const face = (
    family: string,
    label: string,
    data: Uint8Array,
    weight?: 'bold',
  ): FontSource & { load: ReturnType<typeof vi.fn> } => ({
    family,
    ...(weight && { weight }),
    load: vi.fn(() => Promise.resolve({ label, data })),
  });
  let fonts: (FontSource & { load: ReturnType<typeof vi.fn> })[];
  beforeEach(() => {
    fonts = [
      face('Noto Sans', 'regular.ttf', testFont('noto-sans-regular.ttf')),
      face('Noto Sans', 'bold.ttf', testFont('noto-sans-bold.ttf'), 'bold'),
      face('Noto Sans JP', 'jp.ttf', testFont('noto-sans-jp-subset.ttf')),
    ];
  });

  /** A writer of its own, so registered fonts never leak between tests. */
  async function fontWriter() {
    real = await createPdfkitWriter({ compress: false });
    return recordingWriter();
  }

  const textOps = (writer: { recorded: Recorded[] }) =>
    writer.recorded[0]!.pages.flatMap((page) => page.ops).filter((op) => op.op === 'text');

  function onePage(...children: PdfNode[]): PdfNode {
    return host({}, [el('pdf-page', {}, children, { size: 'A4' })]);
  }

  it('draws each run of a line in the first family that has its characters', async () => {
    const writer = await fontWriter();
    const doc = onePage(text('Zoë 日本', { 'font-family': 'Noto Sans, "Noto Sans JP"' }));
    await renderDocument(doc, { writer, dev: false, fonts });
    const [latin, cjk] = textOps(writer);
    expect([latin?.text, latin?.font]).toEqual(['Zoë ', 'font:0']);
    expect([cjk?.text, cjk?.font]).toEqual(['日本', 'font:2']);
    expect(cjk!.x).toBeCloseTo(latin!.x + real.widthOf('Zoë ', 'font:0', 10), 6);
    // Fallback fonts sit on one baseline, not at one top.
    expect(cjk!.y + real.ascent('font:2', 10)).toBeCloseTo(latin!.y + real.ascent('font:0', 10), 6);
  });

  it('loads and draws a family named only on a pdf-span', async () => {
    const writer = await fontWriter();
    const span = el('pdf-span', { 'font-family': 'Noto Sans' }, [createNode('text', '', 'Łódź')]);
    const paragraph = el('pdf-text', {}, [createNode('text', '', 'City: '), span]);
    paragraph.children[0]!.parent = paragraph;
    await renderDocument(onePage(paragraph), { writer, dev: false, fonts });
    expect(textOps(writer).map((op) => [op.text, op.font])).toEqual([
      ['City: ', 'Helvetica'],
      ['Łódź', 'font:0'],
    ]);
  });

  it('picks the bold face for bold text', async () => {
    const writer = await fontWriter();
    const doc = onePage(text('Bold', { 'font-family': 'Noto Sans', 'font-weight': 'bold' }));
    await renderDocument(doc, { writer, dev: false, fonts });
    expect(textOps(writer)[0]?.font).toBe('font:1');
  });

  it('leaves documents that name no registered family as they were', async () => {
    const writer = await fontWriter();
    await renderDocument(onePage(text('Plain', { 'font-family': 'Georgia, serif' })), {
      writer,
      dev: false,
      fonts,
    });
    expect(textOps(writer)[0]?.font).toBe('Times-Roman');
  });

  it('draws the page number in a registered family', async () => {
    const writer = await fontWriter();
    const number = el('pdf-page-number', { 'font-family': 'Noto Sans' }, [], {
      format: 'Страница {page}',
    });
    await renderDocument(onePage(text('a'), number), { writer, dev: false, fonts });
    expect(textOps(writer).at(-1)).toMatchObject({ text: 'Страница 1', font: 'font:0' });
  });

  it('warns once, naming the characters no font in the list has', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const writer = await fontWriter();
    const doc = onePage(
      text('a ☃', { 'font-family': 'Noto Sans' }),
      text('☃ ♞', { 'font-family': 'Noto Sans' }),
    );
    await renderDocument(doc, { writer, dev: true, fonts });
    expect(warn.mock.calls.map(([message]: unknown[]) => message)).toEqual([
      'ngpdf: characters missing from every font in their font-family, drawn as an empty box: ☃♞',
    ]);
  });

  it('rejects the render when a font cannot be read, naming its source', async () => {
    const writer = await fontWriter();
    const broken = [face('Broken', 'broken.ttf', new Uint8Array([0, 1, 2]))];
    await expect(
      renderDocument(onePage(text('a', { 'font-family': 'Broken' })), {
        writer,
        dev: false,
        fonts: broken,
      }),
    ).rejects.toThrow('ngpdf: invalid font "broken.ttf"');
  });

  it('loads only the faces of families the document names', async () => {
    const writer = await fontWriter();
    const broken = face('Broken', 'broken.ttf', new Uint8Array([0, 1, 2]));
    const doc = onePage(text('Zoë', { 'font-family': 'Noto Sans' }), text('Plain'));
    await renderDocument(doc, { writer, dev: false, fonts: [...fonts, broken] });
    expect(fonts[0]!.load).toHaveBeenCalledTimes(1);
    expect(fonts[1]!.load).toHaveBeenCalledTimes(1);
    expect(fonts[2]!.load).not.toHaveBeenCalled();
    expect(broken.load).not.toHaveBeenCalled();
    expect(textOps(writer).map((op) => op.font)).toEqual(['font:0', 'Helvetica']);
  });

  it('writes a PDF that embeds the fonts it used', async () => {
    const writer = await createPdfkitWriter({ compress: false });
    const doc = onePage(text('Zoë 日本', { 'font-family': 'Noto Sans, Noto Sans JP' }));
    const pdf = await bytesOf(await renderDocument(doc, { writer, dev: false, fonts }));
    expect(pdf.match(/\/FontFile2/g)).toHaveLength(2);
  });
});
