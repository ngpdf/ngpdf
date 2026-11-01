import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import type { TableColumn } from '../tree/table-column';
import { layoutBox, resolveColumns, type Box, type LayoutContext } from './layout';
import { resolveStyles } from './style';
import * as textModule from './text';
import { createPdfkitWriter, type PdfWriter } from './writer';

let yoga: Yoga;
let writer: PdfWriter;
beforeAll(async () => {
  const { loadYoga } = await import('yoga-layout/load');
  yoga = await loadYoga();
  writer = await createPdfkitWriter({ compress: false });
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

function textNode(content: string): PdfNode {
  return createNode('text', '', content);
}

function lay(root: PdfNode, width: number, warn?: (message: string) => void): Box {
  const ctx: LayoutContext = {
    yoga,
    metrics: writer,
    images: new Map(),
    ...(warn ? { warn } : {}),
  };
  return layoutBox(root, resolveStyles(root), width, ctx);
}

function cells(spans: number[], style: Record<string, string> = { height: '10' }): PdfNode[] {
  return spans.map((span) => el('pdf-cell', style, [], { span }));
}

function table(columns: TableColumn[], rows: PdfNode[][]): PdfNode {
  return el(
    'pdf-table',
    {},
    rows.map((row) => el('pdf-row', {}, row)),
    { columns },
  );
}

describe('resolveColumns', () => {
  it('splits what fixed columns leave by fr shares', () => {
    const widths = resolveColumns([30, '2fr', '3fr', '1fr'], 523.28);
    [30, 164.43, 246.64, 82.21].forEach((want, i) => {
      expect(widths[i]).toBeCloseTo(want, 2);
    });
  });

  it('takes percentages of the table width before the fr shares', () => {
    expect(resolveColumns(['25%', '1fr'], 400)).toEqual([100, 300]);
  });

  it('resolves fixed, then percent, then fr', () => {
    expect(resolveColumns(['1fr', '50%', 100], 400)).toEqual([100, 200, 100]);
  });

  it('gives fr columns nothing when the fixed ones overflow', () => {
    expect(resolveColumns([300, '1fr'], 200)).toEqual([300, 0]);
  });

  it('gives auto columns their content width before the fr shares', () => {
    expect(resolveColumns(['auto', '1fr', 'auto'], 300, [50, 999, 30])).toEqual([50, 220, 30]);
    expect(resolveColumns([40, '25%', 'auto'], 400, [0, 0, 60])).toEqual([40, 100, 60]);
  });

  it('shrinks auto columns in proportion when they overflow, leaving fr columns nothing', () => {
    expect(resolveColumns([100, 'auto', 'auto', '1fr'], 200, [0, 150, 50, 0])).toEqual([
      100, 75, 25, 0,
    ]);
    expect(resolveColumns([300, 'auto'], 200, [0, 80])).toEqual([300, 0]);
  });

  it('gives an auto column without a measured width nothing', () => {
    expect(resolveColumns(['auto', '1fr'], 200)).toEqual([0, 200]);
  });

  it.each([['abc'], ['2px'], ['fr'], ['%'], ['-1fr'], [' 1fr'], ['1e999%'], [-5], [NaN], ['Auto']])(
    'throws on the column %j instead of computing NaN',
    (column) => {
      expect(() => resolveColumns([column as TableColumn, '1fr'], 400)).toThrow(
        `ngpdf: invalid column "${String(column)}" on pdf-table`,
      );
    },
  );

  it('accepts decimal shares and percentages', () => {
    expect(resolveColumns(['0.5fr', '1.5fr', '12.5%'], 400)).toEqual([87.5, 262.5, 50]);
  });

  it('leaves the width unused when there is no fr column', () => {
    expect(resolveColumns([50, '10%'], 400)).toEqual([50, 40]);
  });
});

describe('layoutBox', () => {
  it('stacks children in a padded view with a gap', () => {
    const root = el('pdf-view', { padding: '10', gap: '4' }, [
      el('pdf-view', { height: '20' }),
      el('pdf-view', { height: '20' }),
    ]);
    const box = lay(root, 200);
    expect(box.children.map((child) => child.y)).toEqual([10, 34]);
    expect(box.children.map((child) => child.x)).toEqual([10, 10]);
    expect(box.children[0]?.w).toBe(180);
    expect(box.h).toBe(64);
  });

  it('measures text: height equals the block and lines fit the box', () => {
    const root = el('pdf-view', { width: '120' }, [
      el('pdf-text', {}, [textNode('Gabriela Teixeira de Albuquerque Cavalcanti')]),
    ]);
    const box = lay(root, 120);
    const leaf = box.children[0];
    expect(leaf?.text).toBeDefined();
    expect(leaf?.text?.lines.length).toBeGreaterThan(1);
    expect(leaf?.h).toBeCloseTo(leaf?.text?.height ?? -1, 6);
    for (const line of leaf?.text?.lines ?? [])
      expect(line.width).toBeLessThanOrEqual(leaf?.w ?? 0);
  });

  it('lays out the text of pdf-spans in their own styles, inherited from the text', () => {
    const root = el('pdf-view', {}, [
      el('pdf-text', { color: 'blue', 'font-size': '9' }, [
        textNode('Total: '),
        el('pdf-span', { 'font-weight': 'bold' }, [
          textNode('42 '),
          el('pdf-span', { 'font-size': '18' }, [textNode('EUR')]),
        ]),
        textNode(' due'),
      ]),
    ]);
    const leaf = lay(root, 400).children[0];
    const runs = leaf?.text?.lines[0]?.runs ?? [];
    expect(runs.map(({ text, font, size, color }) => [text, font, size, color.b])).toEqual([
      ['Total: ', 'Helvetica', 9, 255],
      ['42 ', 'Helvetica-Bold', 9, 255],
      ['EUR', 'Helvetica-Bold', 18, 255],
      [' due', 'Helvetica', 9, 255],
    ]);
    expect(leaf?.h).toBeCloseTo(18 * 1.2, 6);
  });

  it('lays out an inline pdf-link like a pdf-span and puts its URL on its runs', () => {
    const root = el('pdf-view', {}, [
      el('pdf-text', {}, [
        textNode('See '),
        el(
          'pdf-link',
          { color: 'blue' },
          [textNode('the '), el('pdf-span', { 'font-weight': 'bold' }, [textNode('docs')])],
          {
            href: 'HTTPS://Example.com',
          },
        ),
        textNode('.'),
      ]),
    ]);
    const runs = lay(root, 400).children[0]?.text?.lines[0]?.runs ?? [];
    expect(runs.map(({ text, font, color, link }) => [text, font, color.b, link])).toEqual([
      ['See ', 'Helvetica', 0, undefined],
      ['the ', 'Helvetica', 255, 'https://example.com/'],
      ['docs', 'Helvetica-Bold', 255, 'https://example.com/'],
      ['.', 'Helvetica', 0, undefined],
    ]);
  });

  it('lays out a block pdf-link like a column pdf-view and gives its box the URL', () => {
    const link = el('pdf-link', { padding: '4' }, [textNode('Open')], {
      href: 'https://example.com/a',
    });
    const box = lay(el('pdf-view', {}, [link, el('pdf-view', { height: '10' })]), 400);
    const linked = box.children[0];
    expect(linked?.link).toBe('https://example.com/a');
    expect(linked?.w).toBe(400);
    expect(linked?.children[0]?.text?.lines[0]?.text).toBe('Open');
    expect(box.children[1]).not.toHaveProperty('link');
  });

  it('draws a link with a refused URL as plain content, with a warning', () => {
    const warn = vi.fn();
    const bad = 'javascript:alert(1)';
    const root = el('pdf-view', {}, [
      el('pdf-link', {}, [textNode('Block')], { href: bad }),
      el('pdf-text', {}, [el('pdf-link', {}, [textNode('inline')], { href: bad })]),
    ]);
    const box = lay(root, 400, warn);
    expect(box.children[0]).not.toHaveProperty('link');
    expect(box.children[1]?.text?.lines[0]?.runs[0]).not.toHaveProperty('link');
    expect(warn).toHaveBeenCalledWith(
      `ngpdf: pdf-link href "${bad}" is not an absolute http, https or mailto URL; no link written`,
    );
  });

  it('keeps flattening a pdf-text inside a pdf-text into the outer style', () => {
    const root = el('pdf-view', {}, [
      el('pdf-text', {}, [
        textNode('a '),
        el('pdf-text', { 'font-weight': 'bold' }, [textNode('b')]),
      ]),
    ]);
    const runs = lay(root, 400).children[0]?.text?.lines[0]?.runs ?? [];
    expect(runs.map((run) => [run.text, run.font])).toEqual([['a b', 'Helvetica']]);
  });

  it('measures a nested page number with every number taken as three digits', () => {
    const number = el('pdf-page-number', {}, [], { format: 'Page {page} of {total}' });
    const box = lay(el('pdf-view', { 'flex-direction': 'row' }, [number]), 400).children[0];
    const width = writer.widthOf('Page 000 of 000', 'Helvetica', 10);
    expect(box?.w).toBeGreaterThanOrEqual(width);
    expect(box?.w).toBeLessThan(width + 1);
    expect(box?.h).toBeCloseTo(12, 3);
  });

  it('measures a page number on one line even when its format is wider than its box', () => {
    const number = el('pdf-page-number', { width: '30' }, [], {
      format: 'Sheet {page} of {total} in this report',
    });
    const box = lay(el('pdf-view', { 'flex-direction': 'row' }, [number]), 400).children[0];
    expect(box?.h).toBeCloseTo(12, 3);
  });

  it('never makes a text box narrower than its text', () => {
    const root = el('pdf-view', { 'flex-direction': 'row' }, [
      el('pdf-text', {}, [textNode('Hello wide world of text')]),
    ]);
    const leaf = lay(root, 400).children[0];
    expect(leaf?.text?.lines).toHaveLength(1);
    expect(leaf?.w).toBeGreaterThanOrEqual(leaf?.text?.width ?? Infinity);
  });

  it('shrinks flex children by default, as CSS does', () => {
    const root = el('pdf-view', { 'flex-direction': 'row', width: '100' }, [
      el('pdf-view', { width: '80' }),
      el('pdf-view', { width: '80' }),
    ]);
    expect(lay(root, 100).children.map((child) => child.w)).toEqual([50, 50]);
  });

  it('keeps flex-shrink 0 and grows with flex-grow', () => {
    const root = el('pdf-view', { 'flex-direction': 'row' }, [
      el('pdf-view', { width: '30', 'flex-shrink': '0' }),
      el('pdf-view', { 'flex-grow': '1' }),
    ]);
    const [fixed, grown] = lay(root, 100).children;
    expect([fixed?.w, grown?.w, grown?.x]).toEqual([30, 70, 30]);
  });

  it('applies percent sizes, margins and borders', () => {
    const root = el('pdf-view', { border: '2 solid #000' }, [
      el('pdf-view', { width: '50%', height: '10', margin: '3' }),
    ]);
    const child = lay(root, 104).children[0];
    expect([child?.x, child?.y, child?.w]).toEqual([5, 5, 50]);
  });

  it('applies justify, align, auto sizes and min/max limits', () => {
    const root = el(
      'pdf-view',
      {
        'flex-direction': 'row',
        'justify-content': 'center',
        'align-items': 'flex-end',
        height: '50',
      },
      [
        el('pdf-view', {
          width: 'auto',
          'min-width': '20',
          'max-width': '30%',
          height: '10',
          'flex-basis': '60',
        }),
        el('pdf-view', {
          width: '20',
          height: '10',
          'align-self': 'flex-start',
          'min-height': '5',
          'max-height': '8',
          margin: 'auto',
        }),
      ],
    );
    const box = lay(root, 200);
    expect(box.children).toHaveLength(2);
    expect(box.children[0]?.w).toBe(60);
    expect(box.children[1]?.h).toBe(8);
  });

  it('sizes an image box from its style and attaches the asset', () => {
    const image = el('pdf-image', { width: '40', height: '30' });
    const asset = { data: new Uint8Array(1), width: 4, height: 3 };
    const box = layoutBox(image, resolveStyles(image), 100, {
      yoga,
      metrics: writer,
      images: new Map([[image, asset]]),
    });
    expect([box.w, box.h, box.image]).toEqual([100, 30, asset]);
  });

  it('ignores comment children', () => {
    const root = el('pdf-view', {}, [createNode('comment'), el('pdf-view', { height: '5' })]);
    expect(lay(root, 50).children).toHaveLength(1);
  });
});

describe('tables', () => {
  it('lines every cell up at its column start in all rows', () => {
    const root = table([30, '2fr', '1fr'], [cells([1, 1, 1]), cells([1, 1, 1])]);
    const box = lay(root, 330);
    const xs = box.children.map((row) => row.children.map((cell) => cell.x));
    expect(xs[0]).toEqual([0, 30, 230]);
    expect(xs[1]).toEqual(xs[0]);
    expect(box.children[1]?.y).toBe(10);
  });

  it('gives a spanning cell the width of its columns', () => {
    const root = table([30, '2fr', '1fr'], [cells([1, 1, 1]), cells([2, 1])]);
    const row = lay(root, 330).children[1];
    expect(row?.children.map((cell) => [cell.x, cell.w])).toEqual([
      [0, 230],
      [230, 100],
    ]);
  });

  it('measures columns inside table padding', () => {
    const root = table(['1fr', '1fr'], [cells([1, 1])]);
    root.rawStyle = { padding: '10' };
    const row = lay(root, 120).children[0];
    expect(row?.children.map((cell) => [cell.x, cell.w])).toEqual([
      [0, 50],
      [50, 50],
    ]);
  });

  it('resolves nested tables against their own width', () => {
    const inner = table(['1fr', '1fr'], [cells([1, 1])]);
    const outer = table([100, '1fr'], [[el('pdf-cell', {}, [inner]), ...cells([1])]]);
    const innerBox = lay(outer, 300).children[0]?.children[0]?.children[0];
    expect(innerBox?.children[0]?.children.map((cell) => cell.w)).toEqual([50, 50]);
  });

  it('throws when a row has more cells than the table has columns, counting spans', () => {
    expect(() => lay(table([30, '1fr'], [cells([1, 1]), cells([1, 1, 1])]), 300)).toThrow(
      'ngpdf: pdf-row has more cells than pdf-table columns (3 > 2)',
    );
    expect(() => lay(table([30, '1fr'], [cells([2, 1])]), 300)).toThrow(
      'ngpdf: pdf-row has more cells than pdf-table columns (3 > 2)',
    );
    expect(() => lay(table([], [cells([1])]), 300)).toThrow(
      'ngpdf: pdf-row has more cells than pdf-table columns (1 > 0)',
    );
  });

  it('lays out a row with fewer cells than columns', () => {
    const row = lay(table([30, '1fr', 50], [cells([1, 1])]), 300).children[0];
    expect(row?.children.map((cell) => [cell.x, cell.w])).toEqual([
      [0, 30],
      [30, 220],
    ]);
  });

  it('lays out a table without rows', () => {
    expect(() => lay(table([], []), 100)).not.toThrow();
  });
});

describe('auto table columns', () => {
  const cell = (content: string, style: Record<string, string> = {}, span = 1): PdfNode =>
    el('pdf-cell', style, [el('pdf-text', {}, [textNode(content)])], { span });
  const widthsOf = (box: Box): number[] =>
    (box.children[0]?.children ?? []).map((cellBox) => cellBox.w);
  const one = (text: string): number => writer.widthOf(text, 'Helvetica', 10);

  it('sizes an auto column to the widest one-line content of its cells', () => {
    const root = table(
      ['auto', '1fr'],
      [
        [cell('A-1'), cell('first')],
        [cell('B-20000'), cell('second')],
        [cell('C'), cell('third')],
      ],
    );
    const [auto, fr] = widthsOf(lay(root, 300));
    expect(auto).toBeGreaterThanOrEqual(one('B-20000'));
    expect(auto).toBeLessThan(one('B-20000') + 0.01);
    expect(fr).toBeCloseTo(300 - auto!, 3);
  });

  it('counts the cell padding and border', () => {
    const root = table(
      ['auto', '1fr'],
      [[cell('Total', { padding: '0 6', 'border-left': '2 solid black' }), cell('x')]],
    );
    expect(widthsOf(lay(root, 300))[0]).toBeCloseTo(one('Total') + 12 + 2, 2);
  });

  it('wraps the text of auto columns shrunk to fit', () => {
    const long = 'a long value that does not fit';
    const root = table([100, 'auto'], [[cell('x'), cell(long)]]);
    const box = lay(root, 200);
    expect(widthsOf(box)[1]).toBeCloseTo(100, 3);
    const text = box.children[0]?.children[1]?.children[0]?.text;
    expect(text?.lines.length).toBeGreaterThan(1);
  });

  it('measures an auto column without the width a cell style sets', () => {
    const root = table(['auto', '1fr'], [[cell('ab', { width: '500' }), cell('x')]]);
    const [auto] = widthsOf(lay(root, 300));
    expect(auto).toBeGreaterThanOrEqual(one('ab'));
    expect(auto).toBeLessThan(one('ab') + 0.01);
  });

  it('ignores spanning cells when sizing an auto column', () => {
    const root = table(
      ['auto', '1fr'],
      [[cell('a very wide spanning cell content', {}, 2)], [cell('ab'), cell('x')]],
    );
    const box = lay(root, 400);
    expect(box.children[1]?.children[0]?.w).toBeLessThan(one('ab') + 0.01);
  });

  it('gives an empty auto column nothing', () => {
    const root = table(['auto', '1fr'], [[el('pdf-cell'), cell('x')]]);
    expect(widthsOf(lay(root, 300))).toEqual([0, 300]);
  });

  it('sizes auto columns of a table nested in a cell', () => {
    const inner = table(['auto', '1fr'], [[cell('inner'), cell('y')]]);
    const root = table(['1fr'], [[el('pdf-cell', {}, [inner])]]);
    const innerBox = lay(root, 300).children[0]?.children[0]?.children[0];
    expect(innerBox?.children[0]?.children[0]?.w).toBeLessThan(one('inner') + 0.01);
    expect(innerBox?.children[0]?.children[0]?.w).toBeGreaterThanOrEqual(one('inner'));
  });
});

describe('table box model', () => {
  const styledRow = (style: Record<string, string>): PdfNode => el('pdf-row', style, cells([1, 1]));
  const tableOf = (rows: PdfNode[]): PdfNode => el('pdf-table', {}, rows, { columns: [60, '1fr'] });

  it('keeps cells on their columns whatever the row padding, borders and margin', () => {
    const root = tableOf([
      styledRow({ padding: '6', 'border-left': '3 solid #000', 'border-right': '1 solid #000' }),
      styledRow({ margin: '5', 'justify-content': 'flex-end', 'flex-direction': 'column' }),
      styledRow({}),
    ]);
    const warnings: string[] = [];
    const box = lay(root, 200, (message) => warnings.push(message));
    for (const row of box.children) {
      expect(row.children.map((cell) => [cell.x, cell.w])).toEqual([
        [0, 60],
        [60, 140],
      ]);
    }
    expect(box.children[0]?.x).toBe(0);
    // Vertical padding stays: 6 + 10 + 6.
    expect(box.children[0]?.h).toBe(22);
    expect(box.children[0]?.style.borderWidth.left).toBe(0);
  });

  it('warns once per layout, naming each ignored property', () => {
    const root = tableOf([
      styledRow({ padding: '6', 'border-left': '3 solid #000' }),
      styledRow({ padding: '6' }),
      el('pdf-row', {}, [
        el('pdf-cell', { margin: '4', 'min-width': '10', 'max-width': '20' }, [], { span: 1 }),
      ]),
    ]);
    const warn = vi.fn();
    lay(root, 200, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    for (const name of [
      'pdf-row padding-left',
      'pdf-row padding-right',
      'pdf-row border-left',
      'pdf-cell margin',
      'pdf-cell min-width',
      'pdf-cell max-width',
    ]) {
      expect(message).toContain(name);
    }
  });

  it('does not warn for an untouched table', () => {
    const warn = vi.fn();
    lay(tableOf([styledRow({})]), 200, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns for margin, justify-content and flex-direction on a row', () => {
    const warn = vi.fn();
    lay(
      tableOf([
        styledRow({ margin: '5', 'justify-content': 'center', 'flex-direction': 'column' }),
      ]),
      200,
      warn,
    );
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('pdf-row margin');
    expect(message).toContain('pdf-row justify-content');
    expect(message).toContain('pdf-row flex-direction');
  });

  it('warns for gap on a row', () => {
    const warn = vi.fn();
    lay(tableOf([styledRow({ gap: '10' })]), 200, warn);
    expect(warn).toHaveBeenCalledWith('ngpdf: ignored inside tables: pdf-row gap');
  });
});

describe('passes and cleanup', () => {
  it('lays a table in a shrink-to-fit parent out deterministically', () => {
    const build = (): PdfNode =>
      el('pdf-view', { 'align-items': 'flex-start' }, [
        table(
          [40, '1fr'],
          [[...cells([1]), el('pdf-cell', {}, [el('pdf-text', {}, [textNode('some text')])])]],
        ),
      ]);
    const warn = vi.fn();
    const first = lay(build(), 300, warn);
    const second = lay(build(), 300);
    const widths = (box: Box): number[] =>
      (box.children[0]?.children[0]?.children ?? []).map((cell) => cell.w);
    expect(widths(first)).toEqual(widths(second));
    expect(warn).not.toHaveBeenCalled();
  });

  it('wraps each text node once per call, however many passes run', () => {
    const spy = vi.spyOn(textModule, 'layoutRanges');
    const text = el('pdf-text', {}, [textNode('some text in a cell')]);
    const root = table([100, '1fr'], [[el('pdf-cell', {}, [text]), ...cells([1])]]);
    spy.mockClear();
    lay(root, 300);
    const wraps = spy.mock.calls.filter(([ranges]) => ranges[0]?.text === 'some text in a cell');
    spy.mockRestore();
    expect(wraps).toHaveLength(1);
  });

  it('uses the last pass and warns when the table widths never settle', () => {
    // The column is 99% of a table that is as wide as its own column.
    const root = el('pdf-view', { 'align-items': 'flex-start' }, [
      table(['99%'], [[el('pdf-cell', {}, [el('pdf-view', { width: '100' })])]]),
    ]);
    const warn = vi.fn();
    const box = lay(root, 300, warn);
    expect(warn).toHaveBeenCalledWith('ngpdf: table columns did not settle');
    expect(box.children).toHaveLength(1);
  });

  it('frees every Yoga node when a build fails halfway', () => {
    const live = new Set<unknown>();
    const tracked = {
      ...yoga,
      Node: {
        ...yoga.Node,
        create: (config?: Parameters<typeof yoga.Node.create>[0]) => {
          const node = yoga.Node.create(config);
          live.add(node);
          const free = node.free.bind(node);
          node.free = () => {
            live.delete(node);
            free();
          };
          return node;
        },
      },
    } as unknown as Yoga;
    const huge = 'x'.repeat(1_048_577);
    const root = el('pdf-view', {}, [
      el('pdf-view', {}, [el('pdf-view', {}), el('pdf-text', {}, [textNode(huge)])]),
    ]);
    expect(() =>
      layoutBox(root, resolveStyles(root), 100, {
        yoga: tracked,
        metrics: writer,
        images: new Map(),
      }),
    ).toThrow(/^ngpdf:/);
    expect(live.size).toBe(0);
  });
});

describe('image sizing from the natural size', () => {
  const asset = { data: new Uint8Array(1), width: 200, height: 100 };
  const size = (style: Record<string, string>, available = 1000): [number, number] => {
    const image = el('pdf-image', style);
    const parent = el('pdf-view', { width: String(available) }, [image]);
    const box = layoutBox(parent, resolveStyles(parent), available, {
      yoga,
      metrics: writer,
      images: new Map([[image, asset]]),
    });
    const child = box.children[0];
    return [child?.w ?? NaN, child?.h ?? NaN];
  };

  it('derives the height from the width', () => {
    expect(size({ width: '300' })).toEqual([300, 150]);
  });

  it('derives the width from the height', () => {
    expect(size({ height: '50' })).toEqual([100, 50]);
  });

  it('uses the natural size when neither is set', () => {
    expect(size({})).toEqual([200, 100]);
  });

  it('caps the natural size to the available width keeping the ratio', () => {
    expect(size({}, 100)).toEqual([100, 50]);
  });

  it('keeps both dimensions when both are set', () => {
    expect(size({ width: '40', height: '30' })).toEqual([40, 30]);
  });

  it('keeps the natural size in a centred column', () => {
    expect(place({}, { 'align-items': 'center' })).toEqual([100, 200, 100]);
  });

  it('keeps the natural size at the end of a flex-end column', () => {
    expect(place({}, { 'align-items': 'flex-end' })).toEqual([200, 200, 100]);
  });

  it('keeps the ratio in a row beside a taller sibling', () => {
    const image = el('pdf-image', {});
    const tall = el('pdf-view', { height: '300', width: '50' });
    const parent = el('pdf-view', { width: '400', 'flex-direction': 'row' }, [image, tall]);
    const box = layoutBox(parent, resolveStyles(parent), 400, {
      yoga,
      metrics: writer,
      images: new Map([[image, { data: new Uint8Array(1), width: 200, height: 100 }]]),
    });
    const child = box.children[0];
    expect([child?.y, child?.w, child?.h]).toEqual([0, 200, 100]);
  });

  it('honours an explicit align-self: stretch, the height following the ratio', () => {
    expect(place({ 'align-self': 'stretch' }, {})).toEqual([0, 400, 200]);
  });

  it('gives an image with a zero natural size its style size, or nothing', () => {
    const flat = { data: new Uint8Array(1), width: 0, height: 0 };
    const sized = el('pdf-image', { width: '30', height: '20' });
    const bare = el('pdf-image', {});
    const parent = el('pdf-view', { width: '400' }, [sized, bare]);
    const box = layoutBox(parent, resolveStyles(parent), 400, {
      yoga,
      metrics: writer,
      images: new Map([
        [sized, flat],
        [bare, flat],
      ]),
    });
    expect(box.children.map((c) => [c.w, c.h])).toEqual([
      [30, 20],
      [0, 0],
    ]);
  });
});

function place(
  style: Record<string, string>,
  parentStyle: Record<string, string>,
): [number, number, number] {
  const image = el('pdf-image', style);
  const parent = el('pdf-view', { width: '400', ...parentStyle }, [image]);
  const box = layoutBox(parent, resolveStyles(parent), 400, {
    yoga,
    metrics: writer,
    images: new Map([[image, { data: new Uint8Array(1), width: 200, height: 100 }]]),
  });
  const child = box.children[0];
  return [child?.x ?? NaN, child?.w ?? NaN, child?.h ?? NaN];
}

describe('anonymous text', () => {
  const linesOf = (box: Box | undefined): string[] =>
    box?.text?.lines.map((line) => line.text) ?? [];

  it('lays out bare text in a cell as a text box', () => {
    const cell = el('pdf-cell', {}, [textNode(' x ')]);
    const root = table([100], [[cell]]);
    const laidCell = lay(root, 100).children[0]?.children[0];
    expect(laidCell?.children).toHaveLength(1);
    expect(linesOf(laidCell?.children[0])).toEqual(['x']);
    expect(laidCell?.children[0]?.h).toBeCloseTo(12, 5);
  });

  it('keeps text runs and elements in order, each run its own box with the parent text style', () => {
    const view = el('pdf-view', { 'font-size': '20', padding: '3' }, [
      textNode('a'),
      el('pdf-text', {}, [textNode('b')]),
      textNode('c'),
    ]);
    const box = lay(view, 200);
    expect(box.children.map(linesOf)).toEqual([['a'], ['b'], ['c']]);
    const [first, , last] = box.children;
    expect(first?.style.fontSize).toBe(20);
    // Only the text styles are inherited: the anonymous box has no padding of its own.
    expect(first?.padding.top).toBe(0);
    expect(first?.y).toBe(3);
    expect(last?.y).toBeCloseTo(3 + 2 * 24, 5);
  });

  it('adds no box for whitespace between elements and joins a run across comments', () => {
    const view = el('pdf-view', {}, [
      textNode(' \n\t '),
      el('pdf-text', {}, [textNode('b')]),
      textNode('  '),
      textNode('d'),
      createNode('comment'),
      textNode('e'),
    ]);
    expect(lay(view, 200).children.map(linesOf)).toEqual([['b'], ['de']]);
  });

  it('leaves the text of pdf-text, pdf-image and pdf-page-number alone', () => {
    const view = el('pdf-view', {}, [
      el('pdf-text', {}, [textNode('t')]),
      el('pdf-page-number', {}, [textNode('n')]),
    ]);
    const box = lay(view, 200);
    expect(box.children.map((child) => child.children.length)).toEqual([0, 0]);
  });
});

describe('position', () => {
  const block = (height = 20): PdfNode => el('pdf-view', { height: String(height) });
  const badge = (): PdfNode =>
    el('pdf-view', { position: 'absolute', top: '0', right: '10%', width: '20', height: '10' });
  const strip = (): PdfNode =>
    el('pdf-view', { position: 'absolute', left: '5', right: '5', bottom: '0', height: '4' });

  // A root with border 2 and padding 10, a 30pt block, then a view 50pt lower holding a badge, a
  // static view with a strip, and a 20pt block.
  function scene(view: Record<string, string>): { root: Box; view: Box } {
    const root = el('pdf-view', { padding: '10', border: '2 solid #000' }, [
      block(30),
      el('pdf-view', { 'margin-top': '50', padding: '5', ...view }, [
        badge(),
        el('pdf-view', {}, [strip()]),
        block(),
      ]),
    ]);
    const box = lay(root, 200);
    return { root: box, view: box.children[1]! };
  }

  it('takes an absolute box out of the flow: no space, no sibling moved, no parent growth', () => {
    const { root, view } = scene({});
    expect(view.h).toBe(30);
    expect(root.h).toBe(134);
    expect(view.children[1]).toMatchObject({ x: 5, y: 5, h: 0 });
    expect(view.children[2]).toMatchObject({ x: 5, y: 5 });
  });

  it('places an absolute box against the root padding box through static ancestors', () => {
    const { view } = scene({});
    // The root's padding box runs from (2, 2) to (198, 132); the view sits at (12, 92).
    const placed = view.children[0]!;
    expect(placed.x).toBeCloseTo(198 - 19.6 - 20 - 12, 3);
    expect(placed.y).toBeCloseTo(2 - 92, 3);
    expect(placed).toMatchObject({ w: 20, h: 10 });
    const stretched = view.children[1]!.children[0]!;
    expect(stretched).toMatchObject({ x: 7 - 17, w: 186, h: 4 });
    expect(stretched.y).toBeCloseTo(132 - 4 - 97, 3);
  });

  it.each([
    ['relative', { position: 'relative' }],
    ['transformed', { transform: 'rotate(10deg)' }],
    ['absolute', { position: 'absolute', top: '92', left: '12', width: '176' }],
  ])('makes a %s view the containing block', (_, style) => {
    const { view } = scene(style);
    // Its padding box is its border box: 176 by 30, from (0, 0).
    expect(view.children[0]!.x).toBeCloseTo(176 - 17.6 - 20, 3);
    expect(view.children[0]!.y).toBe(0);
    expect(view.children[1]!.children[0]).toMatchObject({ x: 0, y: 30 - 4 - 5, w: 166 });
  });

  it('stretches an absolute box between top and bottom when its height is auto', () => {
    const box = lay(
      el('pdf-view', { position: 'relative', height: '100' }, [
        el('pdf-view', { position: 'absolute', top: '10', bottom: '15%' }),
      ]),
      200,
    );
    expect(box.children[0]).toMatchObject({ y: 10, h: 75 });
  });

  it('sizes an absolute box with auto width to its content', () => {
    const word = (style: Record<string, string>): PdfNode =>
      el('pdf-text', style, [textNode('Stamp')]);
    const box = lay(el('pdf-view', {}, [word({ position: 'absolute', left: '0' }), word({})]), 200);
    const [absolute, inFlow] = box.children;
    expect(inFlow!.w).toBe(200);
    expect(absolute!.w).toBeGreaterThan(0);
    expect(absolute!.w).toBeLessThan(50);
    expect(absolute!.text?.lines).toHaveLength(1);
  });

  it('keeps a relative box where the flow puts it and records its offsets as a shift', () => {
    const moved = el('pdf-view', { position: 'relative', top: '10', left: '5', height: '20' });
    const after = block();
    const box = lay(el('pdf-view', {}, [block(), moved, after]), 200);
    expect(box.children[1]).toMatchObject({ x: 0, y: 20, shift: { x: 5, y: 10 } });
    expect(box.children[2]).toMatchObject({ y: 40 });
    expect(box.h).toBe(60);
  });

  it('shifts by bottom and right when top and left are auto, and top and left win', () => {
    const shiftOf = (style: Record<string, string>): Box['shift'] =>
      lay(el('pdf-view', {}, [el('pdf-view', { position: 'relative', ...style })]), 200)
        .children[0]!.shift;
    expect(shiftOf({ bottom: '4', right: '3' })).toEqual({ x: -3, y: -4 });
    expect(shiftOf({ top: '1', bottom: '4', left: '2', right: '3' })).toEqual({ x: 2, y: 1 });
  });

  it("resolves a relative box's percentages against its parent's content box", () => {
    const parent = el('pdf-view', { padding: '10', height: '100' }, [
      el('pdf-view', { position: 'relative', top: '25%', left: '10%' }),
    ]);
    expect(lay(parent, 200).children[0]!.shift).toEqual({ x: 18, y: 20 });
  });

  it('ignores the offsets of a static box', () => {
    const box = lay(el('pdf-view', {}, [el('pdf-view', { top: '10', left: '5' })]), 200);
    expect(box.children[0]).toMatchObject({ x: 0, y: 0 });
    expect(box.children[0]!.shift).toBeUndefined();
  });
});

describe('layoutBox: pdf-note', () => {
  const note = (style: Record<string, string> = {}, props: Record<string, unknown> = {}) =>
    el('pdf-note', style, [textNode('  Check   this ')], props);
  const block = (height: number) => el('pdf-view', { height: String(height) });

  it('takes no space, even between gaps, and sits where the next sibling starts', () => {
    const marked = note();
    const root = el('pdf-view', { padding: '5', 'border-width': '2', gap: '10' }, [
      block(20),
      marked,
      block(30),
    ]);
    const laid = lay(root, 200);
    expect(laid.h).toBe(5 * 2 + 2 * 2 + 20 + 10 + 30);
    const [first, box, second] = laid.children;
    expect(second!.y).toBe(first!.y + 20 + 10);
    expect(box).toMatchObject({ x: 7, y: second!.y, w: 0, h: 0 });
    expect(box!.note).toEqual({ text: 'Check this', icon: 'comment', open: false });
    expect(box!.children).toEqual([]);
  });

  it('sits at the left of the content box in a row, at the top of the next sibling', () => {
    const marked = note();
    const root = el('pdf-view', { 'flex-direction': 'row', 'padding-left': '4' }, [
      block(20),
      marked,
      el('pdf-view', { width: '10', height: '10', 'margin-top': '6' }),
    ]);
    const box = lay(root, 200).children[1]!;
    expect(box).toMatchObject({ x: 4, y: 6 });
  });

  it('sits at the bottom of the content before it when it is the last child', () => {
    const marked = note();
    const laid = lay(el('pdf-view', { padding: '3' }, [block(20), marked, note()]), 200);
    expect(laid.children[1]).toMatchObject({ x: 3, y: 23 });
    expect(laid.children[2]).toMatchObject({ x: 3, y: 23 });
    const alone = lay(el('pdf-view', { padding: '3' }, [note()]), 200);
    expect(alone.children[0]).toMatchObject({ x: 3, y: 3, h: 0 });
    expect(alone.h).toBe(6);
  });

  it('skips absolute siblings when it finds where the next sibling starts', () => {
    const stamp = el('pdf-view', { position: 'absolute', top: '50', width: '5', height: '5' });
    const laid = lay(el('pdf-view', {}, [block(20), note(), stamp, block(10)]), 200);
    expect(laid.children[1]).toMatchObject({ x: 0, y: 20 });
  });

  it('places an absolute note against its containing block, at zero size', () => {
    const marked = note({ position: 'absolute', top: '4', right: '0' });
    const card = el('pdf-view', { position: 'relative', width: '100', height: '40' }, [marked]);
    const laid = lay(el('pdf-view', {}, [card]), 200).children[0]!;
    expect(laid.children[0]).toMatchObject({ x: 100, y: 4, w: 0, h: 0 });
  });
});

describe('pdf-canvas', () => {
  const paint = (): void => undefined;

  it('takes its size from width and height, padding and border included', () => {
    const canvas = el('pdf-canvas', { width: '120', height: '40', padding: '4' }, [], { paint });
    const box = lay(el('pdf-view', {}, [canvas]), 300).children[0]!;
    expect(box).toMatchObject({ w: 120, h: 40, children: [] });
    expect(box.padding).toEqual({ top: 4, right: 4, bottom: 4, left: 4 });
  });

  it('stretches across a column and grows with flex', () => {
    const canvas = el('pdf-canvas', { flex: '1' }, [], { paint });
    const box = lay(el('pdf-view', { height: '90' }, [canvas]), 300).children[0]!;
    expect(box).toMatchObject({ w: 300, h: 90 });
  });

  it('is 0 tall without a height, and warns', () => {
    const warn = vi.fn();
    const canvas = el('pdf-canvas', {}, [], { paint });
    const box = lay(el('pdf-view', {}, [canvas]), 300, warn).children[0]!;
    expect(box.h).toBe(0);
    expect(warn).toHaveBeenCalledWith('ngpdf: a pdf-canvas has no height; set its height or flex');
    const sized = vi.fn();
    lay(el('pdf-view', {}, [el('pdf-canvas', { height: '10' }, [], { paint })]), 300, sized);
    expect(sized).not.toHaveBeenCalled();
  });

  it('ignores text inside it', () => {
    const canvas = el('pdf-canvas', { height: '10' }, [textNode('alt')], { paint });
    const box = lay(el('pdf-view', {}, [canvas]), 300).children[0]!;
    expect(box.children).toEqual([]);
    expect(box.text).toBeUndefined();
  });
});
