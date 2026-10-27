import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { fontFor } from './fonts';
import { parseLength, resolveStyles, ROOT_TEXT_STYLE } from './style';

function el(tag: string, rawStyle: Record<string, string> = {}, children: PdfNode[] = []): PdfNode {
  const node = createNode('element', tag);
  node.rawStyle = rawStyle;
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });
const BLACK = rgb(0, 0, 0);
const RED = rgb(255, 0, 0);
const BLUE = rgb(0, 0, 255);

function styleOf(
  rawStyle: Record<string, string>,
  tag = 'pdf-view',
  warn?: (message: string) => void,
) {
  const node = el(tag, rawStyle);
  const style = resolveStyles(el('pdf-document', {}, [node]), warn).get(node);
  if (!style) throw new Error('missing style');
  return style;
}

describe('parseLength', () => {
  it('converts units to points', () => {
    expect(parseLength('10mm')).toBeCloseTo(28.346, 3);
    expect(parseLength('1in')).toBe(72);
    expect(parseLength('1cm')).toBeCloseTo(28.346, 3);
    expect(parseLength('12px')).toBe(12);
    expect(parseLength('12pt')).toBe(12);
    expect(parseLength('12')).toBe(12);
    expect(parseLength('-4.5')).toBe(-4.5);
  });

  it('parses percent and auto', () => {
    expect(parseLength('50%')).toEqual({ percent: 50 });
    expect(parseLength('auto')).toBe('auto');
  });

  it('throws on unknown units and garbage', () => {
    expect(() => parseLength('3em')).toThrow(/^ngpdf: unknown unit in "3em"/);
    expect(() => parseLength('abc')).toThrow(/^ngpdf:/);
    expect(() => parseLength('')).toThrow(/^ngpdf:/);
  });
});

describe('resolveStyles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses root text defaults', () => {
    const style = styleOf({});
    expect(style).toMatchObject(ROOT_TEXT_STYLE);
    expect(ROOT_TEXT_STYLE).toEqual({
      color: BLACK,
      fontFamily: 'Helvetica',
      fontSize: 10,
      fontWeight: 'normal',
      fontStyle: 'normal',
      lineHeight: 1.2,
      textAlign: 'left',
      textDecoration: 'none',
      orphans: 2,
      widows: 2,
    });
  });

  it('expands padding and margin shorthands', () => {
    const style = styleOf({ padding: '4 8', margin: '1 2 3' });
    expect(style.padding).toEqual({ top: 4, right: 8, bottom: 4, left: 8 });
    expect(style.margin).toEqual({ top: 1, right: 2, bottom: 3, left: 2 });
    expect(styleOf({ padding: '5' }).padding).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
    expect(styleOf({ padding: '1 2 3 4' }).padding).toEqual({
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    });
    expect(styleOf({ margin: 'auto 10%' }).margin.top).toBe('auto');
  });

  it('lets a longhand override the shorthand it follows', () => {
    const style = styleOf({ padding: '4', 'padding-left': '9' });
    expect(style.padding).toEqual({ top: 4, right: 4, bottom: 4, left: 9 });
  });

  it('rejects auto padding, which CSS does not have', () => {
    expect(() => styleOf({ padding: 'auto' })).toThrow(/^ngpdf: expected a length in "auto"/);
    expect(() => styleOf({ padding: '4 auto' })).toThrow(/^ngpdf:/);
    expect(() => styleOf({ 'padding-left': 'auto' })).toThrow(/^ngpdf:/);
    expect(styleOf({ padding: '10%' }).padding.left).toEqual({ percent: 10 });
  });

  it('rejects a negative font-size or padding but keeps negative margins', () => {
    expect(() => styleOf({ 'font-size': '-10' }, 'pdf-text')).toThrow(
      /^ngpdf: expected a non-negative length in "-10"/,
    );
    expect(() => styleOf({ padding: '-10' })).toThrow(
      /^ngpdf: expected a non-negative length in "-10"/,
    );
    expect(() => styleOf({ padding: '4 -1mm' })).toThrow(/^ngpdf:/);
    expect(() => styleOf({ 'padding-top': '-5%' })).toThrow(/^ngpdf:/);
    expect(styleOf({ 'font-size': '0' }, 'pdf-text').fontSize).toBe(0);
    expect(styleOf({ margin: '-10' }).margin.top).toBe(-10);
  });

  it('rejects a shorthand with too many values', () => {
    expect(() => styleOf({ padding: '1 2 3 4 5' })).toThrow(/^ngpdf:/);
  });

  it('sets only one side with border-bottom', () => {
    const style = styleOf({ 'border-bottom': '1 solid #ddd' });
    expect(style.borderWidth).toEqual({ top: 0, right: 0, bottom: 1, left: 0 });
    expect(style.borderColor.bottom).toEqual(rgb(221, 221, 221));
    expect(style.borderColor.top).toEqual(BLACK);
  });

  it('applies border to all sides and draws other styles solid', () => {
    const warn = vi.fn();
    const style = styleOf({ border: '2pt dashed red' }, 'pdf-view', warn);
    expect(style.borderWidth).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    expect(style.borderColor.left).toEqual(RED);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'ngpdf: border style "dashed" is not supported; drawing solid',
    );
  });

  it('sends the border style warning to the sink only, never to the console', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    styleOf({ border: '2pt dashed red' });
    styleOf({ border: '2pt dashed red' }, 'pdf-view', vi.fn());
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('expands border-width and border-color like margin', () => {
    const style = styleOf({ 'border-width': '1 2', 'border-color': 'red blue green' });
    expect(style.borderWidth).toEqual({ top: 1, right: 2, bottom: 1, left: 2 });
    expect(style.borderColor).toEqual({
      top: RED,
      right: BLUE,
      bottom: rgb(0, 128, 0),
      left: BLUE,
    });
    expect(() => styleOf({ 'border-width': '1 2 3 4 5' })).toThrow(/^ngpdf:/);
    expect(() => styleOf({ 'border-width': '2%' })).toThrow(/^ngpdf:/);
  });

  it('sets one side with the border-<side>-width and -color longhands', () => {
    const width = styleOf({ 'border-top-width': '3', 'border-left-width': '1mm' });
    expect(width.borderWidth.top).toBe(3);
    expect(width.borderWidth.left).toBeCloseTo(2.835, 3);
    expect(width.borderWidth.right).toBe(0);
    const color = styleOf({ 'border-right-color': 'blue', 'border-bottom-color': '#abc' });
    expect(color.borderColor).toEqual({
      top: BLACK,
      right: BLUE,
      bottom: rgb(170, 187, 204),
      left: BLACK,
    });
  });

  it('applies border declarations in order', () => {
    const later = styleOf({ border: '1 solid red', 'border-left-color': 'blue' });
    expect(later.borderColor).toEqual({ top: RED, right: RED, bottom: RED, left: BLUE });
    const earlier = styleOf({ 'border-left-color': 'blue', border: '1 solid red' });
    expect(earlier.borderColor.left).toEqual(RED);
    const widths = styleOf({ border: '1 solid red', 'border-width': '4' });
    expect(widths.borderWidth.top).toBe(4);
    expect(widths.borderColor.top).toEqual(RED);
  });

  it('expands the flex shorthand', () => {
    const one = styleOf({ flex: '2' });
    expect([one.flexGrow, one.flexShrink, one.flexBasis]).toEqual([2, 1, 0]);
    const two = styleOf({ flex: '2 3' });
    expect([two.flexGrow, two.flexShrink, two.flexBasis]).toEqual([2, 3, 0]);
    const three = styleOf({ flex: '1 0 50%' });
    expect([three.flexGrow, three.flexShrink, three.flexBasis]).toEqual([1, 0, { percent: 50 }]);
    const basis = styleOf({ flex: '1 10mm' });
    expect(basis.flexShrink).toBe(1);
    expect(basis.flexBasis).toBeCloseTo(28.346, 3);
  });

  it('defaults flexDirection by tag', () => {
    expect(styleOf({}, 'pdf-row').flexDirection).toBe('row');
    expect(styleOf({}, 'pdf-view').flexDirection).toBe('column');
    expect(styleOf({ 'flex-direction': 'row' }).flexDirection).toBe('row');
  });

  it('resolves bold from keyword or weight >= 600', () => {
    expect(styleOf({ 'font-weight': 'bold' }).fontWeight).toBe('bold');
    expect(styleOf({ 'font-weight': '600' }).fontWeight).toBe('bold');
    expect(styleOf({ 'font-weight': '500' }).fontWeight).toBe('normal');
  });

  it('resolves line-height from a multiplier or a length', () => {
    expect(styleOf({ 'line-height': '1.5' }).lineHeight).toBe(1.5);
    expect(styleOf({ 'line-height': '14pt', 'font-size': '10' }).lineHeight).toBeCloseTo(1.4);
    expect(styleOf({ 'line-height': '150%' }).lineHeight).toBe(1.5);
    expect(styleOf({ 'line-height': '14', 'font-size': '10' }).lineHeight).toBe(14);
    expect(styleOf({ 'line-height': '20px', 'font-size': '10' }).lineHeight).toBe(2);
  });

  it('does not divide by a zero font size', () => {
    const style = styleOf({ 'line-height': '14pt', 'font-size': '0' });
    expect(style.lineHeight).toBe(1.2);
  });

  it('inherits text properties from the nearest setting ancestor, not the rest', () => {
    const white = el('pdf-text', { color: 'white', 'font-weight': '700' });
    const plain = el('pdf-text');
    const row = el('pdf-row', { color: 'white', 'font-weight': '700', 'background-color': 'red' }, [
      el('pdf-text', {}, []),
    ]);
    const sibling = el('pdf-row', {}, [plain]);
    const inner = el('pdf-view', { padding: '4' }, [white]);
    const root = el('pdf-document', {}, [row, sibling, inner]);
    const styles = resolveStyles(root);

    const rowText = row.children[0]!;
    expect(styles.get(rowText)).toMatchObject({ color: rgb(255, 255, 255), fontWeight: 'bold' });
    expect(styles.get(rowText)?.backgroundColor).toBeNull();
    expect(styles.get(rowText)?.padding.top).toBe(0);
    expect(styles.get(plain)).toMatchObject({ color: BLACK, fontWeight: 'normal' });
    expect(styles.get(white)).toMatchObject({ color: rgb(255, 255, 255), fontWeight: 'bold' });
  });

  it('inherits through an intermediate that does not set the property', () => {
    const leaf = el('pdf-text');
    const mid = el('pdf-view', {}, [leaf]);
    const top = el('pdf-view', { 'font-size': '20', 'text-align': 'center' }, [mid]);
    const styles = resolveStyles(el('pdf-document', {}, [top]));
    expect(styles.get(leaf)).toMatchObject({ fontSize: 20, textAlign: 'center' });
  });

  it('reads breakBefore from props or break-before: page', () => {
    const withProp = el('pdf-view');
    withProp.owner = { pdfProps: () => ({ breakBefore: true }) };
    const root = el('pdf-document', {}, [withProp, el('pdf-view', { 'break-before': 'page' })]);
    const styles = resolveStyles(root);
    expect(styles.get(withProp)?.breakBefore).toBe(true);
    expect(styles.get(root.children[1]!)?.breakBefore).toBe(true);
    expect(styleOf({}).breakBefore).toBe(false);
  });

  it('ignores unknown properties and throws on unknown units', () => {
    expect(() => styleOf({ 'z-index': '3', cursor: 'pointer' })).not.toThrow();
    expect(() => styleOf({ width: '3em' }, 'pdf-view')).toThrow(
      'ngpdf: unknown unit in "3em" on pdf-view',
    );
  });

  it('skips text and comment nodes', () => {
    const text = createNode('text', '', 'hi');
    const view = el('pdf-text', {}, [text]);
    const styles = resolveStyles(el('pdf-document', {}, [view]));
    expect(styles.has(text)).toBe(false);
    expect(styles.has(view)).toBe(true);
  });

  it('accepts 64 nested elements and throws on the 65th', () => {
    const build = (depth: number) => {
      let node = el('pdf-view');
      for (let i = 1; i < depth; i++) node = el('pdf-view', {}, [node]);
      return node;
    };
    expect(() => resolveStyles(build(64))).not.toThrow();
    expect(() => resolveStyles(build(65))).toThrow('ngpdf: nesting deeper than 64');
    expect(() => resolveStyles(build(100000))).toThrow('ngpdf: nesting deeper than 64');
  });

  it('lets a pdf-span inherit and override the text styles of its pdf-text', () => {
    const span = el('pdf-span', { 'font-weight': 'bold', color: 'red' }, [
      createNode('text', '', 'x'),
    ]);
    const text = el('pdf-text', { 'font-size': '14', color: 'blue' }, [span]);
    const style = resolveStyles(el('pdf-document', {}, [text])).get(span);
    expect(style).toMatchObject({ fontSize: 14, fontWeight: 'bold', color: { r: 255, b: 0 } });
  });

  it('accepts a pdf-span inside a pdf-span and throws for one outside a pdf-text', () => {
    const nested = el('pdf-text', {}, [el('pdf-span', {}, [el('pdf-span')])]);
    expect(() => resolveStyles(el('pdf-document', {}, [nested]))).not.toThrow();
    expect(() =>
      resolveStyles(el('pdf-document', {}, [el('pdf-view', {}, [el('pdf-span')])])),
    ).toThrow('ngpdf: pdf-span must be inside a pdf-text');
  });

  it('warns about properties that have no effect on a pdf-span', () => {
    const warn = vi.fn();
    const span = el('pdf-span', { 'font-style': 'italic', padding: '4', 'text-align': 'right' });
    resolveStyles(el('pdf-document', {}, [el('pdf-text', {}, [span])]), warn);
    expect(warn.mock.calls).toEqual([
      ['ngpdf: padding has no effect on pdf-span'],
      ['ngpdf: text-align has no effect on pdf-span'],
    ]);
  });

  it('warns that a pdf-text inside a pdf-text is flattened', () => {
    const warn = vi.fn();
    const inner = el('pdf-text', { 'font-weight': 'bold' });
    resolveStyles(
      el('pdf-document', {}, [el('pdf-text', {}, [el('pdf-span', {}, [inner])])]),
      warn,
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'ngpdf: a pdf-text inside a pdf-text is drawn in the outer style; use pdf-span',
    );
  });

  it('throws a clear error for a pdf-image with an element child, which Yoga cannot lay out', () => {
    const image = el('pdf-image', {}, [el('pdf-text', {}, [createNode('text', '', 'x')])]);
    expect(() => resolveStyles(el('pdf-document', {}, [image]))).toThrow(
      'ngpdf: pdf-image cannot have children (found <pdf-text>)',
    );
  });

  it('lets a pdf-image hold text, which is ignored', () => {
    const image = el('pdf-image', {}, [createNode('text', '', 'alt')]);
    expect(() => resolveStyles(el('pdf-document', {}, [image]))).not.toThrow();
  });
});

describe('resolveStyles property coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps font-family keywords to the three standard families', () => {
    expect(fontFor(styleOf({ 'font-family': 'Courier New, monospace' }))).toBe('Courier');
    expect(fontFor(styleOf({ 'font-family': 'ui-monospace' }))).toBe('Courier');
    expect(fontFor(styleOf({ 'font-family': 'Times New Roman' }))).toBe('Times-Roman');
    expect(fontFor(styleOf({ 'font-family': 'Georgia, serif' }))).toBe('Times-Roman');
    expect(fontFor(styleOf({ 'font-family': 'sans-serif' }))).toBe('Helvetica');
    expect(fontFor(styleOf({ 'font-family': 'Arial' }))).toBe('Helvetica');
  });

  it('resolves text properties', () => {
    const style = styleOf({
      color: '#336699',
      'font-size': '14pt',
      'font-weight': '700',
      'font-style': 'oblique',
      'text-align': 'right',
      'text-decoration': 'line-through',
    });
    expect(style).toMatchObject({
      color: rgb(51, 102, 153),
      fontSize: 14,
      fontWeight: 'bold',
      fontStyle: 'italic',
      textAlign: 'right',
      textDecoration: 'line-through',
    });
    expect(styleOf({ 'font-weight': '400' }).fontWeight).toBe('normal');
    expect(styleOf({ 'font-weight': 'bolder' }).fontWeight).toBe('bold');
    expect(styleOf({ 'font-style': 'normal' }).fontStyle).toBe('normal');
  });

  it('resolves flex container and item properties', () => {
    const style = styleOf({
      'flex-direction': 'row',
      'flex-grow': '2',
      'flex-shrink': '0',
      'flex-basis': '50%',
      'justify-content': 'space-between',
      'align-items': 'center',
      'align-self': 'flex-end',
      gap: '6',
    });
    expect(style).toMatchObject({
      flexDirection: 'row',
      flexGrow: 2,
      flexShrink: 0,
      flexBasis: { percent: 50 },
      justifyContent: 'space-between',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 6,
    });
  });

  it('resolves size, background, radius, opacity and object-fit', () => {
    const style = styleOf({
      width: '50%',
      height: '2cm',
      'min-width': '10',
      'min-height': '11',
      'max-width': '12',
      'max-height': 'auto',
      'background-color': '#eee',
      'border-radius': '3',
      'object-fit': 'cover',
    });
    expect(style.width).toEqual({ percent: 50 });
    expect(style.height).toBeCloseTo(56.693, 3);
    expect([style.minWidth, style.minHeight, style.maxWidth, style.maxHeight]).toEqual([
      10,
      11,
      12,
      'auto',
    ]);
    expect(style.backgroundColor).toEqual(rgb(238, 238, 238));
    expect(style.borderRadius).toBe(3);
    expect(style.objectFit).toBe('cover');
  });

  it('reads orphans and widows as integers of at least 1, inherited, default 2', () => {
    expect(styleOf({})).toMatchObject({ orphans: 2, widows: 2 });
    expect(styleOf({ orphans: '3', widows: ' 1 ' })).toMatchObject({ orphans: 3, widows: 1 });
    const text = el('pdf-text');
    const view = el('pdf-view', { orphans: '4', widows: '5' }, [text]);
    expect(resolveStyles(view).get(text)).toMatchObject({ orphans: 4, widows: 5 });
    for (const property of ['orphans', 'widows']) {
      for (const value of ['0', '-1', '1.5', 'two']) {
        expect(() => styleOf({ [property]: value })).toThrow(
          `ngpdf: expected an integer of at least 1 in "${value}" for ${property}`,
        );
      }
    }
  });

  it('reads break-inside: avoid, not inherited', () => {
    expect(styleOf({}).breakInside).toBe('auto');
    expect(styleOf({ 'break-inside': 'avoid' }).breakInside).toBe('avoid');
    expect(styleOf({ 'break-inside': 'avoid-page' }).breakInside).toBe('avoid');
    expect(styleOf({ 'break-inside': 'auto' }).breakInside).toBe('auto');
    // Columns don't exist here, so avoiding a column break avoids nothing.
    expect(styleOf({ 'break-inside': 'avoid-column' }).breakInside).toBe('auto');
    const text = el('pdf-text');
    const view = el('pdf-view', { 'break-inside': 'avoid' }, [text]);
    expect(resolveStyles(view).get(text)?.breakInside).toBe('auto');
  });

  it('clamps opacity to 0..1', () => {
    expect(styleOf({ opacity: '0.4' }).opacity).toBe(0.4);
    expect(styleOf({ opacity: '3' }).opacity).toBe(1);
    expect(styleOf({ opacity: '-2' }).opacity).toBe(0);
  });

  it.each([
    ['text-align', 'start'],
    ['text-decoration', 'overline'],
    ['flex-direction', 'row-reverse'],
    ['justify-content', 'start'],
    ['align-items', 'baseline'],
    ['align-self', 'baseline'],
    ['object-fit', 'fill'],
  ])('rejects an invalid %s value "%s"', (property, value) => {
    expect(() => styleOf({ [property]: value })).toThrow(
      `ngpdf: invalid value "${value}" for ${property} on pdf-view`,
    );
  });

  // CSS keywords are case-insensitive, and a value can arrive with spaces around it.
  it.each([
    ['text-align', 'CENTER', 'textAlign', 'center'],
    ['text-align', ' Right ', 'textAlign', 'right'],
    ['text-align', 'Justify', 'textAlign', 'justify'],
    ['text-decoration', 'Line-Through', 'textDecoration', 'line-through'],
    ['flex-direction', 'ROW', 'flexDirection', 'row'],
    ['flex-direction', 'Column', 'flexDirection', 'column'],
    ['justify-content', 'Space-Between', 'justifyContent', 'space-between'],
    ['justify-content', 'CENTER', 'justifyContent', 'center'],
    ['align-items', 'CENTER', 'alignItems', 'center'],
    ['align-self', 'Flex-End', 'alignSelf', 'flex-end'],
    ['align-self', 'STRETCH', 'alignSelf', 'stretch'],
    ['object-fit', 'COVER', 'objectFit', 'cover'],
    ['object-fit', 'Contain', 'objectFit', 'contain'],
    ['font-weight', 'BOLD', 'fontWeight', 'bold'],
    ['font-weight', 'Bolder', 'fontWeight', 'bold'],
    ['font-weight', ' 700 ', 'fontWeight', 'bold'],
    ['font-style', 'ITALIC', 'fontStyle', 'italic'],
    ['font-style', 'Oblique', 'fontStyle', 'italic'],
    ['break-before', 'PAGE', 'breakBefore', true],
    ['break-inside', 'Avoid', 'breakInside', 'avoid'],
  ])('reads %s "%s" case-insensitively', (property, value, key, expected) => {
    expect(styleOf({ [property]: value })).toMatchObject({ [key]: expected });
  });

  it('reads auto, none and border styles in any case', () => {
    expect(styleOf({ width: 'AUTO', margin: 'Auto' })).toMatchObject({
      width: 'auto',
      margin: { top: 'auto', left: 'auto' },
    });
    expect(styleOf({ flex: 'AUTO' })).toMatchObject({ flexGrow: 1, flexShrink: 1 });
    expect(styleOf({ flex: 'None' })).toMatchObject({ flexGrow: 0, flexShrink: 0 });
    expect(styleOf({ border: '2 SOLID red' }).borderWidth.top).toBe(2);
    expect(styleOf({ border: '2 None red' }).borderWidth.top).toBe(0);
    const warn = vi.fn();
    styleOf({ border: '1 Dashed red' }, 'pdf-view', warn);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: border style "dashed" is not supported; drawing solid',
    );
  });

  it('still rejects an unknown keyword in any case, naming the value as written', () => {
    expect(() => styleOf({ 'text-align': 'START' })).toThrow(
      'ngpdf: invalid value "START" for text-align on pdf-view',
    );
    expect(styleOf({ 'font-weight': 'HEAVY' }).fontWeight).toBe('normal');
  });

  it.each(['flex-grow', 'flex-shrink', 'opacity'])('rejects a non-numeric %s', (property) => {
    expect(() => styleOf({ [property]: 'lots' })).toThrow(
      `ngpdf: invalid value "lots" for ${property} on pdf-view`,
    );
  });

  it('expands the flex shorthand in every form', () => {
    expect(styleOf({ flex: 'auto' })).toMatchObject({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
    });
    expect(styleOf({ flex: 'none' })).toMatchObject({
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 'auto',
    });
    expect(styleOf({ flex: '3' })).toMatchObject({ flexGrow: 3, flexShrink: 1, flexBasis: 0 });
    expect(styleOf({ flex: '100pt' })).toMatchObject({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 100,
    });
    expect(styleOf({ flex: '2 3' })).toMatchObject({ flexGrow: 2, flexShrink: 3, flexBasis: 0 });
    expect(styleOf({ flex: '2 50%' })).toMatchObject({
      flexGrow: 2,
      flexShrink: 1,
      flexBasis: { percent: 50 },
    });
    expect(styleOf({ flex: '1 2 10' })).toMatchObject({
      flexGrow: 1,
      flexShrink: 2,
      flexBasis: 10,
    });
  });

  it('rejects malformed flex shorthands', () => {
    expect(() => styleOf({ flex: '' })).toThrow('ngpdf: expected 1 to 3 values in "" on pdf-view');
    expect(() => styleOf({ flex: '1 2 3 4' })).toThrow(/^ngpdf: expected 1 to 3 values/);
    expect(() => styleOf({ flex: 'a 1' })).toThrow('ngpdf: invalid flex-grow in "a 1" on pdf-view');
    expect(() => styleOf({ flex: '1 b 3' })).toThrow(
      'ngpdf: invalid flex-shrink in "1 b 3" on pdf-view',
    );
  });

  it('parses border shorthand parts in any order and the none keyword', () => {
    expect(styleOf({ border: 'red solid 3' }).borderColor.top).toEqual(RED);
    expect(styleOf({ border: 'red solid 3' }).borderWidth.top).toBe(3);
    expect(styleOf({ border: 'solid' }).borderWidth.top).toBe(1);
    expect(styleOf({ border: 'solid' }).borderColor.top).toEqual(BLACK);
    expect(styleOf({ border: '4 none' }).borderWidth.top).toBe(0);
    expect(styleOf({ border: 'hidden' }).borderWidth.left).toBe(0);
    expect(styleOf({ border: '1 solid rgb(1, 2, 3)' }).borderColor.top).toEqual(rgb(1, 2, 3));
    expect(() => styleOf({ border: '1 solid red blue' })).toThrow(/^ngpdf: too many values/);
  });

  it('supports CSS border width keywords', () => {
    expect(styleOf({ border: 'thin solid red' }).borderWidth.top).toBe(1);
    expect(styleOf({ 'border-top': 'medium solid red' }).borderWidth.top).toBe(3);
    expect(styleOf({ 'border-top': 'MEDIUM solid red' }).borderWidth.top).toBe(3);
    expect(styleOf({ 'border-width': 'thick' }).borderWidth).toEqual({
      top: 5,
      right: 5,
      bottom: 5,
      left: 5,
    });
    expect(styleOf({ 'border-right-width': 'medium' }).borderWidth.right).toBe(3);
    expect(styleOf({ 'border-right-width': 'Medium' }).borderWidth.right).toBe(3);
    expect(styleOf({ 'border-right-width': ' thin ' }).borderWidth.right).toBe(1);
  });

  it('rejects negative border widths', () => {
    expect(() => styleOf({ border: '-2 solid red' })).toThrow(
      'ngpdf: expected a non-negative length in "-2" on pdf-view',
    );
    expect(() => styleOf({ 'border-top': '-2 solid red' })).toThrow(
      'ngpdf: expected a non-negative length in "-2" on pdf-view',
    );
    expect(() => styleOf({ 'border-width': '-2' })).toThrow(
      'ngpdf: expected a non-negative length in "-2" on pdf-view',
    );
    expect(() => styleOf({ 'border-right-width': '-2' })).toThrow(
      'ngpdf: expected a non-negative length in "-2" on pdf-view',
    );
  });

  it('warns for an unsupported border style on a side shorthand too', () => {
    const warn = vi.fn();
    styleOf({ 'border-top': '1 dotted red' }, 'pdf-view', warn);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'ngpdf: border style "dotted" is not supported; drawing solid',
    );
  });

  it('does not warn for solid or none borders', () => {
    const warn = vi.fn();
    styleOf({ border: '1 solid red' }, 'pdf-view', warn);
    styleOf({ border: 'none' }, 'pdf-view', warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it('parses every color property and names the element of an invalid one', () => {
    const style = styleOf({
      color: 'rgba(255, 0, 0, 0.5)',
      'background-color': 'Navy',
      'border-color': '#0f08 red',
      'border-left-color': 'rgb(0 255 0)',
      'border-top': '1 solid Red',
    });
    expect(style.color).toEqual(rgb(255, 0, 0, 0.5));
    expect(style.backgroundColor).toEqual(rgb(0, 0, 128));
    expect(style.borderColor).toEqual({
      top: RED,
      right: RED,
      bottom: rgb(0, 255, 0, 0x88 / 255),
      left: rgb(0, 255, 0),
    });
    for (const property of ['color', 'background-color', 'border-color', 'border-top-color']) {
      expect(() => styleOf({ [property]: 'reddish' }, 'pdf-text')).toThrow(
        'ngpdf: invalid color "reddish" on pdf-text',
      );
    }
    expect(() => styleOf({ border: '1 solid reddish' })).toThrow(
      'ngpdf: invalid color "reddish" on pdf-view',
    );
  });

  it('paints no background for a transparent color', () => {
    expect(styleOf({ 'background-color': 'transparent' }).backgroundColor).toBeNull();
    expect(styleOf({ 'background-color': 'rgba(1, 2, 3, 0)' }).backgroundColor).toBeNull();
    expect(styleOf({ color: 'transparent' }).color).toEqual(rgb(0, 0, 0, 0));
  });

  it('resolves line-height forms', () => {
    expect(styleOf({ 'line-height': '1.5' }).lineHeight).toBe(1.5);
    expect(styleOf({ 'line-height': '150%' }).lineHeight).toBe(1.5);
    expect(styleOf({ 'font-size': '10', 'line-height': '20pt' }).lineHeight).toBe(2);
    expect(styleOf({ 'line-height': 'normal' }).lineHeight).toBe(ROOT_TEXT_STYLE.lineHeight);
    expect(() => styleOf({ 'line-height': 'auto' })).toThrow(
      'ngpdf: invalid line-height "auto" on pdf-view',
    );
  });

  it('rejects percent where points are required', () => {
    expect(() => styleOf({ gap: '10%' })).toThrow('ngpdf: expected a length in "10%" on pdf-view');
    expect(() => styleOf({ 'font-size': 'auto' })).toThrow(/^ngpdf: expected a length/);
  });

  it('rejects non-finite numbers and truncates long values in errors', () => {
    expect(() => parseLength('1e999')).toThrow(/^ngpdf: unknown unit/);
    expect(() => parseLength('9'.repeat(400))).toThrow(/^ngpdf: invalid length "9{60}\.\.\."/);
    expect(() => styleOf({ opacity: '9'.repeat(400) })).toThrow(/^ngpdf: invalid value/);
  });
});
