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
});
