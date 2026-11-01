import { describe, expect, it } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { collectAnchors } from './anchors';

function el(tag: string, props: Record<string, unknown> = {}, children: PdfNode[] = []): PdfNode {
  const node = createNode('element', tag);
  node.owner = { pdfProps: () => props };
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

function collect(root: PdfNode): {
  anchors: ReturnType<typeof collectAnchors>;
  warnings: string[];
} {
  const warnings: string[] = [];
  return { anchors: collectAnchors(root, (message) => warnings.push(message)), warnings };
}

describe('collectAnchors', () => {
  it('marks each named element with an id and its trimmed name', () => {
    const intro = el('pdf-text', { anchor: ' intro ' });
    const table = el('pdf-table', { anchor: 'prices' });
    const { anchors, warnings } = collect(el('pdf-page', {}, [intro, el('pdf-view', {}, [table])]));
    expect(warnings).toEqual([]);
    expect(anchors.names).toEqual(new Set(['intro', 'prices']));
    expect(anchors.marks.get(intro)).toEqual({ id: 0, name: 'intro' });
    expect(anchors.marks.get(table)).toEqual({ id: 1, name: 'prices' });
    expect(anchors.marks.size).toBe(2);
    expect(anchors.outline).toEqual([]);
  });

  it('ignores a name that is empty after trimming, or not a string', () => {
    const nodes = ['', '   ', undefined, null, 42].map((anchor) => el('pdf-view', { anchor }));
    const { anchors, warnings } = collect(el('pdf-page', {}, nodes));
    expect(anchors.marks.size).toBe(0);
    expect(anchors.names.size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('keeps the first element of a name in tree order and warns about the others', () => {
    const first = el('pdf-text', { anchor: 'top' });
    const second = el('pdf-view', { anchor: 'top' });
    const third = el('pdf-row', { anchor: ' top' });
    const { anchors, warnings } = collect(
      el('pdf-page', {}, [el('pdf-view', {}, [first]), second, third]),
    );
    expect(anchors.marks.get(first)).toEqual({ id: 0, name: 'top' });
    expect(anchors.marks.has(second)).toBe(false);
    expect(anchors.marks.has(third)).toBe(false);
    expect(warnings).toEqual(['ngpdf: duplicate anchor "top"', 'ngpdf: duplicate anchor "top"']);
  });

  it('builds the outline in tree order, nesting bookmarks as the template nests them', () => {
    const a = el('pdf-view', { bookmark: 'Part A' }, [
      el('pdf-text', { bookmark: 'A.1' }),
      el('pdf-view', {}, [el('pdf-text', { bookmark: 'A.2', anchor: 'a2' })]),
    ]);
    const b = el('pdf-table', { bookmark: ' Part B ' }, [
      el('pdf-row', {}, [el('pdf-cell', { bookmark: 'B.1' })]),
    ]);
    const { anchors } = collect(el('pdf-page', {}, [a, el('pdf-text', { bookmark: '  ' }), b]));
    expect(anchors.outline).toEqual([
      {
        title: 'Part A',
        anchor: 0,
        children: [
          { title: 'A.1', anchor: 1, children: [] },
          { title: 'A.2', anchor: 2, children: [] },
        ],
      },
      { title: 'Part B', anchor: 3, children: [{ title: 'B.1', anchor: 4, children: [] }] },
    ]);
    // A bookmark needs no name; one with an anchor keeps it.
    expect(anchors.marks.get(a)).toEqual({ id: 0 });
    expect([...anchors.marks.values()].find((mark) => mark.id === 2)).toEqual({
      id: 2,
      name: 'a2',
    });
    expect(anchors.names).toEqual(new Set(['a2']));
  });

  it('points the bookmark of a duplicate anchor at its own element, without the name', () => {
    const first = el('pdf-text', { anchor: 'x' });
    const second = el('pdf-text', { anchor: 'x', bookmark: 'Second' });
    const { anchors } = collect(el('pdf-page', {}, [first, second]));
    expect(anchors.marks.get(second)).toEqual({ id: 1 });
    expect(anchors.outline).toEqual([{ title: 'Second', anchor: 1, children: [] }]);
  });
});
