import { describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { dissolveHosts } from './hosts';

function el(tag: string, children: PdfNode[] = [], rawStyle: Record<string, string> = {}): PdfNode {
  const node = createNode('element', tag);
  node.rawStyle = rawStyle;
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

const tags = (node: PdfNode): string[] =>
  node.children.map((child) => (child.kind === 'element' ? child.tag : `#${child.kind}`));

describe('dissolveHosts', () => {
  it('puts the children of component hosts in their place, at any depth', () => {
    const text = createNode('text', '', 'bare');
    const rows = el('app-rows', [el('pdf-row'), el('app-row', [el('pdf-row')])]);
    const table = el('pdf-table', [el('pdf-row'), rows, text]);
    const page = el('pdf-page', [el('app-section', [table])]);
    const document = el('pdf-document', [el('app-cover', [page])]);

    const out = dissolveHosts(document, vi.fn());

    expect(tags(out)).toEqual(['pdf-page']);
    const outPage = out.children[0]!;
    expect(tags(outPage)).toEqual(['pdf-table']);
    const outTable = outPage.children[0]!;
    expect(tags(outTable)).toEqual(['pdf-row', 'pdf-row', 'pdf-row', '#text']);
    // The copies point at their new parents; owners and text are kept.
    expect(outTable.parent).toBe(outPage);
    expect(outTable.children.every((child) => child.parent === outTable)).toBe(true);
    expect(outTable.children[3]!.text).toBe('bare');
    expect(out.parent).toBeNull();
  });

  it('keeps pdf-spans and dissolves a component that wraps one inside a pdf-text', () => {
    const span = el('pdf-span', [createNode('text', '', 'bold')]);
    const text = el('pdf-text', [el('app-amount', [span])]);
    const document = el('pdf-document', [el('pdf-page', [text])]);
    const outText = dissolveHosts(document, vi.fn()).children[0]!.children[0]!;
    expect(tags(outText)).toEqual(['pdf-span']);
    expect(tags(outText.children[0]!)).toEqual(['#text']);
  });

  it('keeps a pdf-note and dissolves a component around one', () => {
    const note = el('pdf-note', [createNode('text', '', 'Check')]);
    const page = el('pdf-page', [el('app-review', [note])]);
    const outPage = dissolveHosts(el('pdf-document', [page]), vi.fn()).children[0]!;
    expect(tags(outPage)).toEqual(['pdf-note']);
    expect(tags(outPage.children[0]!)).toEqual(['#text']);
  });

  it('leaves the input tree unchanged', () => {
    const page = el('pdf-page');
    const host = el('app-cover', [page]);
    const document = el('pdf-document', [host]);
    dissolveHosts(document, vi.fn());
    expect(document.children).toEqual([host]);
    expect(page.parent).toBe(host);
  });

  it('treats any element other than the pdf-* elements as a host, unknown pdf- tags too', () => {
    const document = el('pdf-document', [el('div', [el('pdf-invoice', [el('pdf-page')])])]);
    expect(tags(dissolveHosts(document, vi.fn()))).toEqual(['pdf-page']);
  });

  it('warns once per host tag that carries styles, also above the document', () => {
    const warn = vi.fn();
    const document = el('pdf-document', [
      el('app-cover', [el('pdf-page')], { color: 'red' }),
      el('app-cover', [el('pdf-page')], { color: 'blue' }),
      el('app-plain', [el('pdf-page')]),
    ]);
    el('app-root', [document], { padding: '4' });
    dissolveHosts(document, warn);
    expect(warn.mock.calls).toEqual([
      ['ngpdf: styles on <app-root> are ignored; style a pdf-* element inside it'],
      ['ngpdf: styles on <app-cover> are ignored; style a pdf-* element inside it'],
      ['ngpdf: styles on <app-cover> are ignored; style a pdf-* element inside it'],
    ]);
  });

  it('throws when the document has no pdf-page', () => {
    expect(() => dissolveHosts(el('pdf-document', [el('pdf-view')]), vi.fn())).toThrow(
      'ngpdf: pdf-document has no pdf-page',
    );
    expect(() => dissolveHosts(el('pdf-document', [el('app-empty')]), vi.fn())).toThrow(
      'ngpdf: pdf-document has no pdf-page',
    );
  });

  it('throws on pdf-* nesting deeper than 64, not counting hosts', () => {
    let deep = el('pdf-view');
    for (let i = 0; i < 70; i++) deep = el(i % 2 ? 'pdf-view' : 'app-wrap', [deep]);
    expect(() =>
      dissolveHosts(el('pdf-document', [el('pdf-page', [deep])]), vi.fn()),
    ).not.toThrow();
    let deeper = el('pdf-view');
    for (let i = 0; i < 70; i++) deeper = el('pdf-view', [deeper]);
    expect(() => dissolveHosts(el('pdf-document', [el('pdf-page', [deeper])]), vi.fn())).toThrow(
      'ngpdf: nesting deeper than 64',
    );
  });

  it('counts only elements towards the limit, not the text or comment inside the last one', () => {
    // pdf-document > pdf-page > 61 pdf-view > innermost pdf-view: 64 elements.
    const chain = (inner: PdfNode): PdfNode => {
      let node = el('pdf-view', [inner]);
      for (let i = 0; i < 60; i++) node = el('pdf-view', [node]);
      return el('pdf-document', [el('pdf-page', [node])]);
    };
    const withText = chain(el('pdf-view', [createNode('text', '', 'deepest')]));
    const withAnchor = chain(el('pdf-view', [createNode('comment', '', 'container')]));
    expect(() => dissolveHosts(withText, vi.fn())).not.toThrow();
    expect(() => dissolveHosts(withAnchor, vi.fn())).not.toThrow();
    expect(() => dissolveHosts(chain(el('pdf-view', [el('pdf-view')])), vi.fn())).toThrow(
      'ngpdf: nesting deeper than 64',
    );
  });

  it('looks through a very long chain of hosts without overflowing the stack', () => {
    let chain = el('pdf-view');
    for (let i = 0; i < 100_000; i++) chain = el('app-wrap', [chain]);

    const out = dissolveHosts(el('pdf-document', [el('pdf-page', [chain])]), vi.fn());

    expect(tags(out.children[0]!)).toEqual(['pdf-view']);
  });

  describe('display', () => {
    it('drops an element with display: none and everything inside it, at any depth', () => {
      const hidden = el('pdf-view', [el('pdf-text', [createNode('text', '', 'gone')])], {
        display: 'none',
      });
      const kept = el('pdf-view', [], { display: 'flex' });
      const span = el('pdf-span', [createNode('text', '', 'x')], { display: ' None ' });
      const line = el('pdf-text', [createNode('text', '', 'a'), span, createNode('text', '', 'b')]);
      const page = el('pdf-page', [el('app-card', [hidden, kept]), line]);

      const outPage = dissolveHosts(el('pdf-document', [page]), vi.fn()).children[0]!;

      expect(tags(outPage)).toEqual(['pdf-view', 'pdf-text']);
      expect(outPage.children[0]!.rawStyle).toEqual({ display: 'flex' });
      expect(tags(outPage.children[1]!)).toEqual(['#text', '#text']);
    });

    it('drops hidden pages, and throws when every page is hidden', () => {
      const hidden = el('pdf-page', [], { display: 'none' });
      expect(tags(dissolveHosts(el('pdf-document', [hidden, el('pdf-page')]), vi.fn()))).toEqual([
        'pdf-page',
      ]);
      expect(() =>
        dissolveHosts(el('pdf-document', [el('pdf-page', [], { display: 'none' })]), vi.fn()),
      ).toThrow('ngpdf: pdf-document has no pdf-page');
      expect(() =>
        dissolveHosts(el('pdf-document', [el('pdf-page')], { display: 'none' }), vi.fn()),
      ).toThrow('ngpdf: pdf-document has no pdf-page');
    });

    it('throws on any other value, naming the allowed ones', () => {
      for (const value of ['block', 'grid', 'contents', '']) {
        const page = el('pdf-page', [el('pdf-view', [], { display: value })]);
        expect(() => dissolveHosts(el('pdf-document', [page]), vi.fn())).toThrow(
          `ngpdf: invalid value "${value}" for display on pdf-view; use flex or none`,
        );
      }
      expect(() =>
        dissolveHosts(el('pdf-document', [el('pdf-page')], { display: 'inline' }), vi.fn()),
      ).toThrow('ngpdf: invalid value "inline" for display on pdf-document; use flex or none');
    });

    it('does not read display on a component host, whose styles are ignored', () => {
      const warn = vi.fn();
      const page = el('pdf-page', [el('app-card', [el('pdf-view')], { display: 'none' })]);
      const outPage = dissolveHosts(el('pdf-document', [page]), warn).children[0]!;
      expect(tags(outPage)).toEqual(['pdf-view']);
      expect(warn).toHaveBeenCalledWith(
        'ngpdf: styles on <app-card> are ignored; style a pdf-* element inside it',
      );
    });

    it('does not count or check what a hidden element holds', () => {
      let deep = el('pdf-view', [], { display: 'grid' });
      for (let i = 0; i < 70; i++) deep = el('pdf-view', [deep]);
      const hidden = el('pdf-view', [deep], { display: 'none' });
      expect(() =>
        dissolveHosts(el('pdf-document', [el('pdf-page', [hidden])]), vi.fn()),
      ).not.toThrow();
    });

    it('leaves the input tree unchanged', () => {
      const hidden = el('pdf-view', [], { display: 'none' });
      const page = el('pdf-page', [hidden]);
      dissolveHosts(el('pdf-document', [page]), vi.fn());
      expect(page.children).toEqual([hidden]);
    });
  });
});
