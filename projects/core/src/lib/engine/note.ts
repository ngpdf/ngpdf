import { propsOf, type PdfNode } from '../tree/node';
import type { NoteIcon } from '../tree/note-icon';
import { show } from './style';
import { collapseWhitespace } from './text';

/** What a pdf-note box carries to the display list; its icon color is the note's `color`. */
export interface NoteContent {
  /** Plain text, whitespace collapsed as in a pdf-text. */
  readonly text: string;
  /** Trimmed; left out when missing or empty. */
  readonly author?: string;
  readonly icon: NoteIcon;
  readonly open: boolean;
}

const ICONS: ReadonlySet<string> = new Set<NoteIcon>([
  'comment',
  'note',
  'help',
  'key',
  'insert',
  'paragraph',
  'new-paragraph',
]);

function isIcon(value: unknown): value is NoteIcon {
  return typeof value === 'string' && ICONS.has(value);
}

/**
 * The text and inputs of a pdf-note. Its text nodes are joined and collapsed as one paragraph;
 * the style stage has already refused element children. Throws on an icon that is not standard.
 */
export function noteOf(node: PdfNode): NoteContent {
  const props = propsOf(node);
  const icon = props['icon'] ?? 'comment';
  if (!isIcon(icon)) {
    const shown = typeof icon === 'string' ? show(icon) : typeof icon;
    throw new Error(`ngpdf: unknown icon "${shown}" on pdf-note`);
  }
  const pieces = node.children.flatMap((child) => (child.kind === 'text' ? [child.text] : []));
  const text = collapseWhitespace(pieces).join('');
  const author = typeof props['author'] === 'string' ? props['author'].trim() : '';
  return { text, ...(author !== '' && { author }), icon, open: props['open'] === true };
}
