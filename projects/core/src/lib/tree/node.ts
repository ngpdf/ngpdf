export type PdfNodeKind = 'element' | 'text' | 'comment';

export interface PdfNode {
  kind: PdfNodeKind;
  /** Element tag; empty for text and comment nodes. */
  tag: string;
  /** The element component that owns this node; set by the pdf-* components. */
  owner: { pdfProps(): Record<string, unknown> } | null;
  /** Kebab-case CSS property to its value as written. */
  rawStyle: Record<string, string>;
  text: string;
  parent: PdfNode | null;
  children: PdfNode[];
}

/**
 * Once an app has hydrated from server-rendered HTML, Angular reads the `ngh` attribute of every
 * component host it creates, ours included, to find server-rendered DOM to reuse. A PDF node has
 * none, so it answers that it has no attributes. Non-enumerable, so copies and equality checks
 * of nodes never see these.
 */
const NO_ATTRIBUTES: PropertyDescriptorMap = {
  getAttribute: { value: (): null => null },
  hasAttribute: { value: (): boolean => false },
};

export function createNode(kind: PdfNodeKind, tag = '', text = ''): PdfNode {
  const node: PdfNode = { kind, tag, owner: null, rawStyle: {}, text, parent: null, children: [] };
  return kind === 'element' ? Object.defineProperties(node, NO_ATTRIBUTES) : node;
}

export function elementChildren(node: PdfNode): PdfNode[] {
  return node.children.filter((child) => child.kind === 'element');
}

export function textContent(node: PdfNode): string {
  if (node.kind === 'text') return node.text;
  if (node.kind === 'comment') return '';
  return node.children.map(textContent).join('');
}

export function propsOf(node: PdfNode): Record<string, unknown> {
  return node.owner?.pdfProps() ?? {};
}
