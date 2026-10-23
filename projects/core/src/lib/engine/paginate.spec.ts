import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import type { LayoutContext } from './layout';
import { pageSize, paginatePage, type PageLayout, type PlacedBox } from './paginate';
import { resolveStyles } from './style';
import { createPdfkitWriter, type PdfWriter } from './writer';

let yoga: Yoga;
let writer: PdfWriter;
beforeAll(async () => {
  const { loadYoga } = await import('yoga-layout/load');
  yoga = await loadYoga();
  writer = await createPdfkitWriter({ compress: false });
});

const A4_HEIGHT = 841.89;
const PADDING = 36;
const NUMBER_HEIGHT = 9;
const CONTENT_TOP = PADDING;
const CONTENT_BOTTOM = A4_HEIGHT - PADDING - NUMBER_HEIGHT;

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

function row(height = 20, header = false): PdfNode {
  return el('pdf-row', { height: String(height) }, [el('pdf-cell')], { header });
}

function table(bodyRows: number, withHeader = true, style: Record<string, string> = {}): PdfNode {
  const rows = Array.from({ length: bodyRows }, () => row());
  return el('pdf-table', style, withHeader ? [row(20, true), ...rows] : rows, {
    columns: ['1fr'],
  });
}

function pageNumber(style: Record<string, string> = { height: String(NUMBER_HEIGHT) }): PdfNode {
  return el('pdf-page-number', style, [], { format: '{page} / {total}' });
}

function page(
  children: PdfNode[],
  style: Record<string, string> = { padding: String(PADDING) },
  props: Record<string, unknown> = { size: 'A4', orientation: 'portrait' },
): PdfNode {
  return el('pdf-page', style, children, props);
}

function paginate(root: PdfNode, warn = vi.fn<(message: string) => void>()): PageLayout[] {
  const ctx: LayoutContext = { yoga, metrics: writer, images: new Map(), warn };
  return paginatePage(root, resolveStyles(root), ctx);
}

function bottom(placed: PlacedBox): number {
  return placed.y + placed.box.h;
}

function isHeader(node: PdfNode): boolean {
  return node.owner?.pdfProps()['header'] === true;
}

describe('paginatePage: tables', () => {
  // 760.89pt of content below the header row's 20pt leaves room for 37 rows of 20pt.
  const ROWS_PER_PAGE = Math.floor((CONTENT_BOTTOM - CONTENT_TOP - 20) / 20);

  function checkTable(pages: PageLayout[], rows: number): void {
    expect(ROWS_PER_PAGE).toBe(37);
    expect(pages).toHaveLength(Math.ceil(rows / ROWS_PER_PAGE));
    const body: PdfNode[] = [];
    for (const [index, laid] of pages.entries()) {
      expect(laid.width).toBe(595.28);
      expect(laid.height).toBe(A4_HEIGHT);
      expect(isHeader(laid.placed[0]!.box.node)).toBe(true);
      expect(laid.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
      expect(laid.placed.filter((p) => isHeader(p.box.node))).toHaveLength(1);
      for (const placed of laid.placed) {
        expect(bottom(placed)).toBeLessThanOrEqual(CONTENT_BOTTOM + 1e-6);
        expect(placed.clipBottom).toBeUndefined();
        expect(placed.x).toBeCloseTo(PADDING, 6);
        if (!isHeader(placed.box.node)) body.push(placed.box.node);
      }
      const expected = Math.min(ROWS_PER_PAGE, rows - index * ROWS_PER_PAGE);
      expect(laid.placed).toHaveLength(expected + 1);
      // Rows follow each other with no gap, right below the header.
      laid.placed.forEach((placed, i) => {
        expect(placed.y).toBeCloseTo(CONTENT_TOP + 20 * i, 6);
      });
    }
    expect(new Set(body).size).toBe(rows);
  }

  it('repeats the header on every page and keeps rows above the page number', () => {
    const root = page([table(140), pageNumber()]);
    const pages = paginate(root);
    checkTable(pages, 140);
    const rows = root.children[0]!.children.slice(1);
    expect(pages.flatMap((p) => p.placed.slice(1).map((placed) => placed.box.node))).toEqual(rows);
  });

  it('paginates a table inside a column pdf-view the same way', () => {
    const plain = paginate(page([table(140), pageNumber()]));
    const wrapped = paginate(page([el('pdf-view', {}, [table(140)]), pageNumber()]));
    checkTable(wrapped, 140);
    expect(wrapped.map((p) => p.placed.map((placed) => placed.y))).toEqual(
      plain.map((p) => p.placed.map((placed) => placed.y)),
    );
  });

  it('places a header-only table once on one page', () => {
    const header = row(20, true);
    const root = page([el('pdf-table', {}, [header], { columns: ['1fr'] }), pageNumber()]);
    const pages = paginate(root);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.placed.map((p) => p.box.node)).toEqual([header]);
    expect(pages[0]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('moves the header with its first row when the two do not fit', () => {
    // 740pt of filler leaves 20.89pt: room for the header but not for header plus row.
    const filler = el('pdf-view', { height: '740' });
    const pages = paginate(page([filler, table(2), pageNumber()]));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.placed.map((p) => p.box.node)).toEqual([filler]);
    expect(pages[1]!.placed).toHaveLength(3);
    expect(isHeader(pages[1]!.placed[0]!.box.node)).toBe(true);
  });

  it('keeps the table gap between a repeated header and the first row', () => {
    const pages = paginate(page([table(60, true, { gap: '4' }), pageNumber()]));
    expect(pages.length).toBeGreaterThan(1);
    for (const laid of pages) {
      const [header, first] = laid.placed;
      expect(first!.y - bottom(header!)).toBeCloseTo(4, 6);
    }
  });

  it('starts the header where the table starts, after its border and padding', () => {
    const pages = paginate(
      page([table(3, true, { 'border-width': '2', padding: '3' }), pageNumber()]),
    );
    expect(pages[0]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP + 5, 6);
  });

  it('places rows that come before the header after it', () => {
    const first = row();
    const header = row(20, true);
    const root = page([el('pdf-table', {}, [first, header], { columns: ['1fr'] })]);
    const placed = paginate(root)[0]!.placed;
    expect(placed.map((p) => p.box.node)).toEqual([header, first]);
    expect(placed[1]!.y).toBeCloseTo(CONTENT_TOP + 20, 6);
  });

  it('places a header taller than the content area once and paginates the rows without it', () => {
    const header = row(900, true);
    const rows = Array.from({ length: 50 }, () => row());
    const warn = vi.fn<(message: string) => void>();
    const root = page([el('pdf-table', {}, [header, ...rows], { columns: ['1fr'] }), pageNumber()]);
    const pages = paginate(root, warn);
    expect(pages[0]!.placed).toHaveLength(1);
    expect(pages[0]!.placed[0]!.box.node).toBe(header);
    expect(pages[0]!.placed[0]!.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-row header is taller than a page and is cut at the bottom',
    );
    const placed = pages.slice(1).flatMap((p) => p.placed);
    expect(placed.map((p) => p.box.node)).toEqual(rows);
    expect(placed.every((p) => p.clipBottom === undefined)).toBe(true);
  });

  it('drops the header on a page whose row fits only without it', () => {
    const header = row(100, true);
    const rows = [row(700), row(700)];
    const warn = vi.fn<(message: string) => void>();
    const root = page([el('pdf-table', {}, [header, ...rows], { columns: ['1fr'] }), pageNumber()]);
    const pages = paginate(root, warn);
    expect(pages.map((p) => p.placed.map((placed) => placed.box.node))).toEqual([
      [rows[0]],
      [rows[1]],
    ]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(warn).not.toHaveBeenCalled();
  });

  it('sends layout and pagination warnings to the same ctx.warn', () => {
    const table = el(
      'pdf-table',
      {},
      [el('pdf-row', { 'padding-left': '4', height: '20' }, [el('pdf-cell')])],
      { columns: ['1fr'] },
    );
    const tall = el('pdf-view', { height: '2000', 'flex-direction': 'row' });
    const warn = vi.fn<(message: string) => void>();
    paginate(page([table, tall]), warn);
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      'ngpdf: ignored inside tables: pdf-row padding-left',
      'ngpdf: pdf-view is taller than a page and is cut at the bottom',
    ]);
  });

  it('stacks several header rows as one header', () => {
    const rows = Array.from({ length: 80 }, () => row());
    const root = page([
      el('pdf-table', {}, [row(10, true), row(15, true), ...rows], { columns: ['1fr'] }),
    ]);
    const pages = paginate(root);
    expect(pages.length).toBeGreaterThan(1);
    for (const laid of pages) {
      expect(laid.placed[0]!.box.h).toBe(10);
      expect(laid.placed[1]!.box.h).toBe(15);
      expect(laid.placed[1]!.y).toBeCloseTo(CONTENT_TOP + 10, 6);
      expect(laid.placed[2]!.y).toBeCloseTo(CONTENT_TOP + 25, 6);
    }
  });
});

describe('paginatePage: page breaks', () => {
  it('starts a new page at breakBefore', () => {
    const first = el('pdf-view', { height: '20' });
    const second = el('pdf-view', { height: '20', 'break-before': 'page' });
    const pages = paginate(page([first, second]));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.placed.map((p) => p.box.node)).toEqual([first]);
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([second]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('takes breakBefore from the element prop as well', () => {
    const second = el('pdf-view', { height: '20' }, [], { breakBefore: true });
    const pages = paginate(page([el('pdf-view', { height: '20' }), second]));
    expect(pages[1]!.placed[0]!.box.node).toBe(second);
  });

  it('adds no empty page for breakBefore on the first unit', () => {
    const pages = paginate(page([el('pdf-view', { height: '20', 'break-before': 'page' })]));
    expect(pages).toHaveLength(1);
  });

  it('breaks before a wrapper that asks for it', () => {
    const inner = el('pdf-view', { height: '20' });
    const wrapper = el('pdf-view', { 'break-before': 'page' }, [inner]);
    const pages = paginate(page([el('pdf-view', { height: '20' }), wrapper]));
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([inner]);
  });

  it('breaks before a table row whose cell asks for it', () => {
    const second = el('pdf-row', { height: '20' }, [el('pdf-cell', { 'break-before': 'page' })]);
    const tableNode = el('pdf-table', {}, [row(), second], { columns: ['1fr'] });
    const pages = paginate(page([tableNode]));
    expect(pages).toHaveLength(2);
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([second]);
  });

  it('breaks before a row view when an element deep inside it asks for it', () => {
    const text = el('pdf-text', {}, [], { breakBefore: true });
    const rowView = el('pdf-view', { 'flex-direction': 'row', height: '20' }, [
      el('pdf-view', {}, [text]),
    ]);
    const pages = paginate(page([el('pdf-view', { height: '20' }), rowView]));
    expect(pages).toHaveLength(2);
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([rowView]);
  });

  it('puts a unit taller than a page on its own page, clipped, with one warning', () => {
    const before = el('pdf-view', { height: '20' });
    const tall = el('pdf-view', { 'flex-direction': 'row', height: '2000' }, [
      el('pdf-view', { height: '2000', width: '50' }),
    ]);
    const after = el('pdf-view', { height: '20' });
    const warn = vi.fn<(message: string) => void>();
    const pages = paginate(page([before, tall, after, pageNumber()]), warn);
    expect(pages).toHaveLength(3);
    expect(pages[1]!.placed).toHaveLength(1);
    const placed = pages[1]!.placed[0]!;
    expect(placed.box.node).toBe(tall);
    expect(placed.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(placed.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-view is taller than a page and is cut at the bottom',
    );
    expect(pages[2]!.placed[0]!.box.node).toBe(after);
    expect(pages[0]!.placed[0]!.clipBottom).toBeUndefined();
  });

  it('keeps the vertical offsets between units from the full layout', () => {
    const a = el('pdf-view', { height: '20', 'margin-top': '7' });
    const b = el('pdf-view', { height: '20', 'margin-top': '5' });
    const wrapper = el('pdf-view', { gap: '3' }, [a, b]);
    const placed = paginate(page([wrapper]))[0]!.placed;
    expect(placed[0]!.y).toBeCloseTo(CONTENT_TOP + 7, 6);
    expect(placed[1]!.y).toBeCloseTo(CONTENT_TOP + 7 + 20 + 3 + 5, 6);
  });

  it('starts a unit moved to a new page at the content top', () => {
    const units = Array.from({ length: 40 }, () =>
      el('pdf-view', { height: '20', 'margin-top': '10' }),
    );
    const pages = paginate(page(units));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP + 10, 6);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('treats a row pdf-view as one unit and recurses into column ones', () => {
    const cells = [el('pdf-text'), el('pdf-text')];
    const rowView = el('pdf-view', { 'flex-direction': 'row' }, cells);
    const column = el('pdf-view', {}, [el('pdf-view', { height: '5' }), rowView]);
    const placed = paginate(page([column]))[0]!.placed;
    expect(placed.map((p) => p.box.node)).toEqual([column.children[0], rowView]);
  });

  it('keeps an empty column pdf-view as a unit', () => {
    const spacer = el('pdf-view', { height: '30', 'background-color': '#eee' });
    const placed = paginate(page([spacer]))[0]!.placed;
    expect(placed.map((p) => p.box.node)).toEqual([spacer]);
  });

  it('places the whole content as one unit when the page is a row', () => {
    const a = el('pdf-view', { width: '50', height: '20' });
    const b = el('pdf-view', { width: '50', height: '30' });
    const pages = paginate(page([a, b], { padding: '36', 'flex-direction': 'row' }));
    expect(pages[0]!.placed).toHaveLength(1);
    const unit = pages[0]!.placed[0]!;
    expect(unit.box.children.map((c) => c.node)).toEqual([a, b]);
    expect([unit.x, unit.y, unit.box.h]).toEqual([36, 36, 30]);
    // Yoga keeps sizes as float32.
    expect(unit.box.w).toBeCloseTo(595.28 - 72, 3);
    expect(unit.box.style.backgroundColor).toBeNull();
  });

  it('produces one page when there are no units', () => {
    const pages = paginate(page([pageNumber()]));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.placed).toEqual([]);
    expect(pages[0]!.pageNumber).toBeDefined();
  });

  it('moves a unit whose closing wrapper does not fit', () => {
    // The last 20pt unit fits at 765.89, but the wrapper's 10pt bottom padding would not.
    const filler = el('pdf-view', { height: '740' });
    const last = el('pdf-view', { height: '20' });
    const wrapper = el('pdf-view', { 'padding-bottom': '10' }, [last]);
    const pages = paginate(page([filler, wrapper, pageNumber()]));
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([last]);
  });
});

describe('paginatePage: page number', () => {
  it('reserves its height and sits at the bottom right of the content area', () => {
    const number = pageNumber();
    const pages = paginate(page([el('pdf-view', { height: '20' }), number]));
    const placed = pages[0]!.pageNumber!;
    expect(placed.box.node).toBe(number);
    expect(placed.x).toBeCloseTo(PADDING, 6);
    expect(placed.y).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(placed.box.w).toBeCloseTo(595.28 - 72, 3);
    expect(placed.box.h).toBe(NUMBER_HEIGHT);
    expect(placed.box.style.textAlign).toBe('right');
    // It is not laid out with the content, so it adds no offset to it.
    expect(pages[0]!.placed).toHaveLength(1);
  });

  it('is one line of its font high when no height is set', () => {
    const pages = paginate(page([pageNumber({ 'font-size': '10', 'padding-top': '4' })]));
    expect(pages[0]!.pageNumber!.box.h).toBeCloseTo(4 + 12, 6);
  });

  it('keeps an explicit text-align', () => {
    const pages = paginate(page([pageNumber({ 'text-align': 'center' })]));
    expect(pages[0]!.pageNumber!.box.style.textAlign).toBe('center');
  });

  it('keeps a text-align inherited from the page', () => {
    const pages = paginate(page([pageNumber()], { padding: '36', 'text-align': 'center' }));
    expect(pages[0]!.pageNumber!.box.style.textAlign).toBe('center');
  });

  it('warns about a pdf-page-number below a direct child and does not place it', () => {
    const nested = pageNumber();
    const warn = vi.fn<(message: string) => void>();
    const pages = paginate(page([el('pdf-view', {}, [el('pdf-view', {}, [nested])])]), warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('ngpdf: pdf-page-number must be a direct child of pdf-page');
    expect(pages[0]!.pageNumber).toBeUndefined();
  });

  it('is the same on every page', () => {
    const pages = paginate(page([table(100), pageNumber()]));
    expect(pages.length).toBeGreaterThan(1);
    expect(new Set(pages.map((p) => p.pageNumber))).toHaveProperty('size', 1);
  });

  it('is absent when the page has none', () => {
    expect(paginate(page([]))[0]!.pageNumber).toBeUndefined();
  });
});

describe('paginatePage: decorations', () => {
  it('slices a wrapper background into one piece per page', () => {
    const children = Array.from({ length: 50 }, () => el('pdf-view', { height: '20' }));
    const wrapper = el(
      'pdf-view',
      { 'background-color': '#eee', padding: '10', gap: '5', 'border-width': '1' },
      children,
    );
    const pages = paginate(page([wrapper, pageNumber()]));
    expect(pages).toHaveLength(2);
    const pieces = pages.map((p) => p.decorations);
    expect(pieces.map((d) => d.length)).toEqual([1, 1]);
    const [first, second] = [pieces[0]![0]!, pieces[1]![0]!];
    const fullHeight = 11 + 50 * 20 + 49 * 5 + 11;
    // The gap between the last child on page 1 and the first on page 2 is cut.
    expect(first.box.h + second.box.h).toBeCloseTo(fullHeight - 5, 6);
    expect(first.box.node).toBe(wrapper);
    expect(first.box.children).toEqual([]);
    expect([first.x, first.y]).toEqual([PADDING, CONTENT_TOP]);
    expect(first.sliceTop).toBe(false);
    expect(first.sliceBottom).toBe(true);
    expect(second.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(second.sliceTop).toBe(true);
    expect(second.sliceBottom).toBe(false);
    // Page 1's piece ends at its last child, page 2's at the wrapper's padding and border.
    expect(first.y + first.box.h).toBeCloseTo(bottom(pages[0]!.placed.at(-1)!), 6);
    expect(second.y + second.box.h).toBeCloseTo(bottom(pages[1]!.placed.at(-1)!) + 11, 6);
  });

  it('extends a sliced outer piece below the inner wrappers that close on its page', () => {
    const cards = Array.from({ length: 12 }, () =>
      el('pdf-view', { padding: '10', 'border-width': '2', 'background-color': '#ddd' }, [
        el('pdf-view', { height: '80' }),
      ]),
    );
    const section = el('pdf-view', { 'background-color': '#eee', gap: '6' }, cards);
    const pages = paginate(page([section, pageNumber()]));
    expect(pages.length).toBeGreaterThan(1);
    const [outer, ...inner] = pages[0]!.decorations;
    expect(outer!.box.node).toBe(section);
    expect(outer!.sliceBottom).toBe(true);
    expect(inner.length).toBeGreaterThan(0);
    for (const piece of inner) {
      expect(outer!.y + outer!.box.h).toBeGreaterThanOrEqual(piece.y + piece.box.h - 1e-6);
    }
    // Page 1 ends with a whole card, so the section piece ends at its bottom border.
    const lastCard = inner.at(-1)!;
    expect(lastCard.sliceBottom).toBe(false);
    expect(outer!.y + outer!.box.h).toBeCloseTo(lastCard.y + lastCard.box.h, 6);
  });

  it('keeps the padding of a wrapper that opens on a new page', () => {
    const inner = el('pdf-view', { height: '20' });
    const wrapper = el('pdf-view', { 'border-width': '2', padding: '8', 'margin-top': '50' }, [
      inner,
    ]);
    const pages = paginate(page([el('pdf-view', { height: '760' }), wrapper]));
    expect(pages).toHaveLength(2);
    expect(pages[1]!.decorations[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP + 10, 6);
  });

  it('draws nothing for a wrapper with no background or border', () => {
    const pages = paginate(page([el('pdf-view', {}, [el('pdf-view', { height: '20' })])]));
    expect(pages[0]!.decorations).toEqual([]);
  });

  it('draws a table border on every page it runs onto', () => {
    const pages = paginate(page([table(100, true, { 'border-width': '1' })]));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.decorations.length === 1)).toBe(true);
  });

  it('orders nested wrapper pieces outer first', () => {
    const inner = el('pdf-view', { 'background-color': '#ddd' }, [
      el('pdf-view', { height: '20' }),
    ]);
    const outer = el('pdf-view', { 'background-color': '#eee' }, [inner]);
    const decorations = paginate(page([outer]))[0]!.decorations;
    expect(decorations.map((d) => d.box.node)).toEqual([outer, inner]);
  });

  it('cuts a wrapper piece at the content bottom when its unit is clipped', () => {
    const wrapper = el('pdf-view', { 'background-color': '#eee' }, [
      el('pdf-view', { height: '2000', 'flex-direction': 'row' }),
    ]);
    const pages = paginate(page([wrapper, pageNumber()]));
    const piece = pages[0]!.decorations[0]!;
    expect(piece.y + piece.box.h).toBeCloseTo(CONTENT_BOTTOM, 6);
  });

  it('paints the page background under everything on every page', () => {
    const root = page([table(100)], { padding: '36', 'background-color': '#fafafa' });
    const pages = paginate(root);
    for (const laid of pages) {
      const first = laid.decorations[0]!;
      expect(first.box.node).toBe(root);
      expect([first.x, first.y, first.box.w, first.box.h]).toEqual([0, 0, 595.28, A4_HEIGHT]);
      expect(first.box.children).toEqual([]);
    }
  });
});

describe('page geometry', () => {
  it('swaps the size for landscape', () => {
    const pages = paginate(page([], {}, { size: 'A4', orientation: 'landscape' }));
    expect([pages[0]!.width, pages[0]!.height]).toEqual([A4_HEIGHT, 595.28]);
  });

  it('takes a [width, height] size and defaults to A4 portrait', () => {
    expect(pageSize(el('pdf-page', {}, [], { size: [300, 400] }))).toEqual({
      width: 300,
      height: 400,
    });
    expect(pageSize(el('pdf-page'))).toEqual({ width: 595.28, height: A4_HEIGHT });
    expect(pageSize(el('pdf-page', {}, [], { size: 'Letter' }))).toEqual({
      width: 612,
      height: 792,
    });
  });

  it('rejects an unknown or empty page size', () => {
    expect(() => pageSize(el('pdf-page', {}, [], { size: 'B5' }))).toThrow(
      'ngpdf: unknown page size "B5" on pdf-page',
    );
    expect(() => pageSize(el('pdf-page', {}, [], { size: [0, 400] }))).toThrow(
      'ngpdf: unknown page size "[0,400]" on pdf-page',
    );
  });

  it('resolves percent padding against the page width and insets by the border', () => {
    const unit = el('pdf-view', { height: '20' });
    const placed = paginate(page([unit], { padding: '10%', 'border-width': '2' }))[0]!.placed[0]!;
    expect(placed.x).toBeCloseTo(59.528 + 2, 6);
    expect(placed.y).toBeCloseTo(59.528 + 2, 6);
    expect(placed.box.w).toBeCloseTo(595.28 - 2 * 61.528, 3);
  });

  it('uses no padding when the page sets none', () => {
    const placed = paginate(page([el('pdf-view', { height: '20' })], {}))[0]!.placed[0]!;
    expect([placed.x, placed.y]).toEqual([0, 0]);
  });
});
