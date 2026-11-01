/**
 * The icons a viewer can draw for a pdf-note, the standard Text annotation icons. The type and
 * the engine's check both come from this one list.
 */
export const NOTE_ICONS = Object.freeze([
  'comment',
  'note',
  'help',
  'key',
  'insert',
  'paragraph',
  'new-paragraph',
] as const);

/** The icon a viewer draws for a pdf-note. */
export type NoteIcon = (typeof NOTE_ICONS)[number];
