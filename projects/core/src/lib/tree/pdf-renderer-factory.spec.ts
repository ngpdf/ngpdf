import { describe, expect, it } from 'vitest';
import type { Renderer2, RendererFactory2 } from '@angular/core';
import { elementChildren, propsOf, textContent, type PdfNode } from './node';
import { PdfRendererFactory } from './pdf-renderer-factory';

function setup(): Renderer2 {
  const factory: RendererFactory2 = new PdfRendererFactory();
  return factory.createRenderer(null, null);
}

describe('PdfRendererFactory tree operations', () => {
  it('shares one renderer per factory', () => {
    const factory: RendererFactory2 = new PdfRendererFactory();
    expect(factory.createRenderer(null, null)).toBe(factory.createRenderer({}, null));
  });

  it('creates element, text and comment nodes', () => {
    const r = setup();
    const el = r.createElement('pdf-view') as PdfNode;
    const text = r.createText('hi') as PdfNode;
    const comment = r.createComment('c') as PdfNode;
    expect([el.kind, el.tag]).toEqual(['element', 'pdf-view']);
    expect([text.kind, text.tag, text.text]).toEqual(['text', '', 'hi']);
    expect([comment.kind, comment.tag]).toEqual(['comment', '']);
  });

  it('keeps parent and children consistent across append, insertBefore and remove', () => {
    const r = setup();
    const p = r.createElement('p') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    const b = r.createElement('b') as PdfNode;
    const c = r.createElement('c') as PdfNode;
    r.appendChild(p, a);
    r.appendChild(p, c);
    r.insertBefore(p, b, c);
    expect(p.children).toEqual([a, b, c]);
    expect(b.parent).toBe(p);
    expect(r.parentNode(b)).toBe(p);
    expect(r.nextSibling(a)).toBe(b);
    expect(r.nextSibling(c)).toBeNull();
    r.removeChild(p, b);
    expect(p.children).toEqual([a, c]);
    expect(b.parent).toBeNull();
    expect(r.parentNode(b)).toBeNull();
  });

  it('insertBefore with a null reference appends', () => {
    const r = setup();
    const p = r.createElement('p') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    r.insertBefore(p, a, null);
    expect(p.children).toEqual([a]);
  });

  it('moves a node when it is appended again', () => {
    const r = setup();
    const p1 = r.createElement('p') as PdfNode;
    const p2 = r.createElement('p') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    r.appendChild(p1, a);
    r.appendChild(p2, a);
    expect(p1.children).toEqual([]);
    expect(p2.children).toEqual([a]);
    expect(a.parent).toBe(p2);
    r.insertBefore(p1, a, null);
    expect(p2.children).toEqual([]);
    expect(p1.children).toEqual([a]);
  });

  it('moves within the same parent without duplicating', () => {
    const r = setup();
    const p = r.createElement('p') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    const b = r.createElement('b') as PdfNode;
    r.appendChild(p, a);
    r.appendChild(p, b);
    r.insertBefore(p, b, a);
    expect(p.children).toEqual([b, a]);
  });

  it('removeChild ignores a node that is not a child', () => {
    const r = setup();
    const p = r.createElement('p') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    r.removeChild(p, a);
    expect(p.children).toEqual([]);
  });

  it('setValue changes text and selectRootElement returns a root element', () => {
    const r = setup();
    const t = r.createText('a') as PdfNode;
    r.setValue(t, 'b');
    expect(t.text).toBe('b');
    const root = r.selectRootElement('x') as PdfNode;
    expect([root.kind, root.tag]).toEqual(['element', 'root']);
  });

  it('ignores attributes, properties, classes and events', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'id', 'a');
    r.setProperty(el, 'foo', 1);
    r.addClass(el, 'k');
    r.removeClass(el, 'k');
    r.removeAttribute(el, 'id');
    const off = r.listen(el, 'click', () => undefined);
    expect(typeof off).toBe('function');
    off();
    expect(el.rawStyle).toEqual({});
    expect(r.destroyNode).toBeNull();
  });
});

describe('PdfRendererFactory styles', () => {
  it('parses the style attribute into kebab-case rawStyle, last wins', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', 'font-size: 9; color:#666');
    expect(el.rawStyle).toEqual({ 'font-size': '9', color: '#666' });
    r.setAttribute(el, 'style', 'color: red; color: blue;;');
    expect(el.rawStyle).toEqual({ color: 'blue' });
  });

  it('keeps colons inside values', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', 'background: url(a:b)');
    expect(el.rawStyle).toEqual({ background: 'url(a:b)' });
  });

  it('keeps a ; inside url(...) or inside quotes in the value', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(
      el,
      'style',
      `background-image: url(data:image/png;base64,AAAA); font-family: "A;B", 'C;D'; color: red`,
    );
    expect(el.rawStyle).toEqual({
      'background-image': 'url(data:image/png;base64,AAAA)',
      'font-family': `"A;B", 'C;D'`,
      color: 'red',
    });
  });

  it('keeps an escaped quote inside a quoted value', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', String.raw`content: "a\";b"; color: red`);
    expect(el.rawStyle).toEqual({ content: String.raw`"a\";b"`, color: 'red' });
  });

  it('reads an unclosed quote or parenthesis to the end, and ignores a stray )', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', `color: red; content: "a; b: c`);
    expect(el.rawStyle).toEqual({ color: 'red', content: `"a; b: c` });
    r.setAttribute(el, 'style', 'a: url(x; b: 1');
    expect(el.rawStyle).toEqual({ a: 'url(x; b: 1' });
    r.setAttribute(el, 'style', 'a: 1); b: 2');
    expect(el.rawStyle).toEqual({ a: '1)', b: '2' });
  });

  it('splits a long style in linear time', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    const started = performance.now();
    r.setAttribute(el, 'style', `a: ${'('.repeat(200_000)}; ${'b: "x;"; '.repeat(20_000)}`);
    // Well under 100 ms; the budget only has to catch a quadratic scan.
    expect(performance.now() - started).toBeLessThan(2000);
    expect(Object.keys(el.rawStyle)).toEqual(['a']);
  });

  it('setStyle kebab-cases the name and stringifies the value', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setStyle(el, 'backgroundColor', '#f2f2f2');
    r.setStyle(el, 'flexGrow', 1);
    expect(el.rawStyle['background-color']).toBe('#f2f2f2');
    expect(el.rawStyle['flex-grow']).toBe('1');
    r.removeStyle(el, 'backgroundColor');
    expect(el.rawStyle['background-color']).toBeUndefined();
  });
});

describe('PdfRendererFactory edge cases', () => {
  it('keeps a --custom property name as written, in the attribute and in setStyle', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', '--Accent-Color: red; fontSize: 9');
    expect(el.rawStyle).toEqual({ '--Accent-Color': 'red', 'font-size': '9' });
    r.setStyle(el, '--gapSize', 4);
    expect(el.rawStyle['--gapSize']).toBe('4');
    r.removeStyle(el, '--gapSize');
    expect(el.rawStyle['--gapSize']).toBeUndefined();
  });

  it('keeps !important as part of the value', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', 'color: red !important');
    expect(el.rawStyle).toEqual({ color: 'red !important' });
    r.setStyle(el, 'padding', '4 !important');
    expect(el.rawStyle['padding']).toBe('4 !important');
  });

  it('skips declarations without a name or a colon', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', ': red; junk; color: blue');
    expect(el.rawStyle).toEqual({ color: 'blue' });
  });

  it('appends when the reference child is not in the parent', () => {
    const r = setup();
    const p = r.createElement('p') as PdfNode;
    const other = r.createElement('o') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    const b = r.createElement('b') as PdfNode;
    const stranger = r.createElement('s') as PdfNode;
    r.appendChild(p, a);
    r.appendChild(other, stranger);
    r.insertBefore(p, b, stranger);
    expect(p.children).toEqual([a, b]);
    expect(b.parent).toBe(p);
    expect(other.children).toEqual([stranger]);
  });

  it('removeChild with the wrong parent leaves the child where it is', () => {
    const r = setup();
    const p = r.createElement('p') as PdfNode;
    const wrong = r.createElement('w') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    r.appendChild(p, a);
    r.removeChild(wrong, a);
    expect(p.children).toEqual([a]);
    expect(a.parent).toBe(p);
  });

  it('removeChild with a null parent detaches from the real parent', () => {
    const r = setup();
    const p = r.createElement('p') as PdfNode;
    const a = r.createElement('a') as PdfNode;
    r.appendChild(p, a);
    r.removeChild(null, a);
    expect(p.children).toEqual([]);
    expect(a.parent).toBeNull();
  });

  it('removeChild with a null parent on a detached node does nothing', () => {
    const r = setup();
    const a = r.createElement('a') as PdfNode;
    r.removeChild(null, a);
    expect(a.parent).toBeNull();
  });

  it('setAttribute("style") after setStyle replaces the whole style', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setStyle(el, 'color', 'red');
    r.setStyle(el, 'padding', '4');
    r.setAttribute(el, 'style', 'margin: 2');
    expect(el.rawStyle).toEqual({ margin: '2' });
  });

  it('setStyle after setAttribute("style") adds to it', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', 'margin: 2');
    r.setStyle(el, 'color', 'red');
    expect(el.rawStyle).toEqual({ margin: '2', color: 'red' });
  });

  it('removeAttribute("style") clears the style but other attributes do not', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'style', 'margin: 2');
    r.removeAttribute(el, 'title');
    expect(el.rawStyle).toEqual({ margin: '2' });
    r.removeAttribute(el, 'style');
    expect(el.rawStyle).toEqual({});
  });

  it('matches the style attribute name in any case, as HTML does', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    r.setAttribute(el, 'STYLE', 'margin: 2');
    expect(el.rawStyle).toEqual({ margin: '2' });
    r.removeAttribute(el, 'STYLE');
    expect(el.rawStyle).toEqual({});
    r.setAttribute(el, 'Style', 'color: red');
    expect(el.rawStyle).toEqual({ color: 'red' });
    r.removeAttribute(el, 'Style');
    expect(el.rawStyle).toEqual({});
  });

  it('nextSibling is null for a detached node', () => {
    const r = setup();
    expect(r.nextSibling(r.createElement('a') as PdfNode)).toBeNull();
  });
});

describe('node helpers', () => {
  it('propsOf returns owner props or an empty object', () => {
    const r = setup();
    const el = r.createElement('x') as PdfNode;
    expect(propsOf(el)).toEqual({});
    el.owner = { pdfProps: () => ({ size: 'A4' }) };
    expect(propsOf(el)).toEqual({ size: 'A4' });
  });

  it('textContent concatenates text descendants and skips comments', () => {
    const r = setup();
    const x = r.createElement('x') as PdfNode;
    const y = r.createElement('y') as PdfNode;
    r.appendChild(x, r.createText('a'));
    r.appendChild(x, r.createComment('no'));
    r.appendChild(x, y);
    r.appendChild(y, r.createText('b'));
    expect(textContent(x)).toBe('ab');
  });

  it('elementChildren keeps element nodes only', () => {
    const r = setup();
    const x = r.createElement('x') as PdfNode;
    const y = r.createElement('y') as PdfNode;
    r.appendChild(x, r.createText('a'));
    r.appendChild(x, y);
    r.appendChild(x, r.createComment('c'));
    expect(elementChildren(x)).toEqual([y]);
  });
});
