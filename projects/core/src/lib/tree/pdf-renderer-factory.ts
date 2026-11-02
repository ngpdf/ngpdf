import { type Renderer2, type RendererFactory2 } from '@angular/core';
import { createNode, type PdfNode } from './node';

const toKebab = (name: string): string =>
  name.startsWith('--') ? name : name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

/**
 * Splits a style attribute into declarations at each `;` outside quotes and parentheses, so a
 * value such as `url(data:image/png;base64,...)` or `"A;B"` stays whole. A backslash escapes the
 * next character inside quotes. An unclosed quote or parenthesis runs to the end, and a stray `)`
 * is kept as text. One pass over the string, no regular expression.
 */
function splitDeclarations(source: string): string[] {
  const declarations: string[] = [];
  let start = 0;
  let quote = '';
  let depth = 0;
  for (let at = 0; at < source.length; at++) {
    const ch = source[at];
    if (quote) {
      if (ch === '\\') at++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      if (depth > 0) depth--;
    } else if (ch === ';' && depth === 0) {
      declarations.push(source.slice(start, at));
      start = at + 1;
    }
  }
  declarations.push(source.slice(start));
  return declarations;
}

function parseStyle(source: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const declaration of splitDeclarations(source)) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim();
    if (name) {
      const key = toKebab(name);
      // Repeated declarations take their final position, not just their value.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete style[key];
      style[key] = declaration.slice(colon + 1).trim();
    }
  }
  return style;
}

// HTML attribute names are case-insensitive, so `[attr.STYLE]` is the style attribute too.
const isStyleAttribute = (name: string): boolean => name.toLowerCase() === 'style';

function detach(node: PdfNode): void {
  if (!node.parent) return;
  const siblings = node.parent.children;
  const at = siblings.indexOf(node);
  if (at >= 0) siblings.splice(at, 1);
  node.parent = null;
}

/** Adapter: turns Angular's Renderer2 calls into a PdfNode tree. */
class PdfRenderer implements Renderer2 {
  readonly data: Record<string, unknown> = {};
  destroyNode = null;

  destroy(): void {
    // Nothing to release: the tree is plain data.
  }

  createElement(name: string): PdfNode {
    return createNode('element', name);
  }

  createComment(): PdfNode {
    return createNode('comment');
  }

  createText(value: string): PdfNode {
    return createNode('text', '', value);
  }

  appendChild(parent: PdfNode, newChild: PdfNode): void {
    detach(newChild);
    newChild.parent = parent;
    parent.children.push(newChild);
  }

  insertBefore(parent: PdfNode, newChild: PdfNode, refChild: PdfNode | null): void {
    detach(newChild);
    const at = refChild ? parent.children.indexOf(refChild) : -1;
    newChild.parent = parent;
    if (at < 0) parent.children.push(newChild);
    else parent.children.splice(at, 0, newChild);
  }

  removeChild(parent: PdfNode | null, oldChild: PdfNode): void {
    if (oldChild.parent === (parent ?? oldChild.parent)) detach(oldChild);
  }

  selectRootElement(): PdfNode {
    return createNode('element', 'root');
  }

  parentNode(node: PdfNode): PdfNode | null {
    return node.parent;
  }

  nextSibling(node: PdfNode): PdfNode | null {
    if (!node.parent) return null;
    return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null;
  }

  setAttribute(el: PdfNode, name: string, value: string): void {
    if (isStyleAttribute(name)) el.rawStyle = parseStyle(value);
  }

  removeAttribute(el: PdfNode, name: string): void {
    if (isStyleAttribute(name)) el.rawStyle = {};
  }

  addClass(): void {
    // Classes mean nothing in a PDF.
  }

  removeClass(): void {
    // Classes mean nothing in a PDF.
  }

  setStyle(el: PdfNode, style: string, value: unknown): void {
    const key = toKebab(style);
    // A later Angular style binding must override earlier shorthand declarations.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete el.rawStyle[key];
    el.rawStyle[key] = String(value);
  }

  removeStyle(el: PdfNode, style: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete el.rawStyle[toKebab(style)];
  }

  setProperty(): void {
    // Element data comes from the owner component.
  }

  setValue(node: PdfNode, value: string): void {
    node.text = value;
  }

  listen(): () => void {
    return () => undefined;
  }
}

export class PdfRendererFactory implements RendererFactory2 {
  private readonly renderer = new PdfRenderer();

  createRenderer(): Renderer2 {
    return this.renderer;
  }
}
