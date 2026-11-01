import { describe, expect, it } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { noteOf } from './note';

function note(texts: string[], props: Record<string, unknown> = {}): PdfNode {
  const node = createNode('element', 'pdf-note');
  node.owner = { pdfProps: () => props };
  for (const text of texts) {
    const child = createNode('text', '', text);
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

describe('noteOf', () => {
  it('collapses whitespace in the text as pdf-text does, across text nodes', () => {
    expect(noteOf(note(['\n  Check the \t total', '  of\n march  '])).text).toBe(
      'Check the total of march',
    );
  });

  it('keeps any character, also outside WinAnsi', () => {
    expect(noteOf(note(['Łódź → 日本 ✓'])).text).toBe('Łódź → 日本 ✓');
  });

  it('defaults to the comment icon, closed, with no author', () => {
    expect(noteOf(note(['x']))).toEqual({ text: 'x', icon: 'comment', open: false });
  });

  it('takes a trimmed author and drops an empty or missing one', () => {
    expect(noteOf(note(['x'], { author: '  Ana  ' })).author).toBe('Ana');
    expect(noteOf(note(['x'], { author: '   ' }))).not.toHaveProperty('author');
    expect(noteOf(note(['x'], { author: null }))).not.toHaveProperty('author');
  });

  it('takes open and each standard icon', () => {
    expect(noteOf(note(['x'], { open: true })).open).toBe(true);
    for (const icon of ['comment', 'note', 'help', 'key', 'insert', 'paragraph', 'new-paragraph']) {
      expect(noteOf(note(['x'], { icon })).icon).toBe(icon);
    }
  });

  it('throws on an unknown icon', () => {
    expect(() => noteOf(note(['x'], { icon: 'star' }))).toThrow(
      'ngpdf: unknown icon "star" on pdf-note',
    );
    expect(() => noteOf(note(['x'], { icon: 'toString' }))).toThrow(
      'ngpdf: unknown icon "toString" on pdf-note',
    );
  });
});
