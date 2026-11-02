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
      letterSpacing: 0,
      textTransform: 'none',
      hyphens: 'manual',
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

  it('reads breakAfter from props or break-after: page, and ignores other keywords', () => {
    const withProp = el('pdf-view');
    withProp.owner = { pdfProps: () => ({ breakAfter: true }) };
    const root = el('pdf-document', {}, [withProp, el('pdf-view', { 'break-after': 'page' })]);
    const styles = resolveStyles(root);
    expect(styles.get(withProp)?.breakAfter).toBe(true);
    expect(styles.get(root.children[1]!)?.breakAfter).toBe(true);
    expect(styleOf({}).breakAfter).toBe(false);
    expect(styleOf({ 'break-after': 'avoid' }).breakAfter).toBe(false);
  });

  it('reads break-after: avoid as keepWithNext, not inherited', () => {
    expect(styleOf({}).keepWithNext).toBe(false);
    expect(styleOf({ 'break-after': 'avoid' }).keepWithNext).toBe(true);
    expect(styleOf({ 'break-after': 'avoid-page' }).keepWithNext).toBe(true);
    expect(styleOf({ 'break-after': 'page' }).keepWithNext).toBe(false);
    expect(styleOf({ 'break-after': 'avoid-column' }).keepWithNext).toBe(false);
    const text = el('pdf-text');
    const view = el('pdf-view', { 'break-after': 'avoid' }, [text]);
    expect(resolveStyles(view).get(text)?.keepWithNext).toBe(false);
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
    const span = el('pdf-span', {
      'font-style': 'italic',
      padding: '4',
      'text-align': 'right',
      'break-after': 'page',
    });
    resolveStyles(el('pdf-document', {}, [el('pdf-text', {}, [span])]), warn);
    expect(warn.mock.calls).toEqual([
      ['ngpdf: padding has no effect on pdf-span'],
      ['ngpdf: text-align has no effect on pdf-span'],
      ['ngpdf: break-after has no effect on pdf-span'],
    ]);
  });

  it('styles an inline pdf-link like a pdf-span, and lets a pdf-span sit inside one', () => {
    const warn = vi.fn();
    const span = el('pdf-span', { 'font-weight': 'bold' });
    const link = el('pdf-link', { color: 'blue', padding: '4' }, [span]);
    const styles = resolveStyles(el('pdf-document', {}, [el('pdf-text', {}, [link])]), warn);
    expect(styles.get(span)).toMatchObject({ fontWeight: 'bold', color: BLUE });
    expect(warn).toHaveBeenCalledExactlyOnceWith('ngpdf: padding has no effect on pdf-link');
  });

  it('styles a block pdf-link like a column pdf-view, without warnings', () => {
    const warn = vi.fn();
    const style = styleOf({ padding: '4', 'background-color': 'red' }, 'pdf-link', warn);
    expect(style).toMatchObject({ flexDirection: 'column', backgroundColor: RED });
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws for a pdf-link inside a pdf-link, at any depth', () => {
    const nested = (inner: PdfNode): PdfNode =>
      el('pdf-document', {}, [el('pdf-link', {}, [inner])]);
    expect(() => resolveStyles(nested(el('pdf-view', {}, [el('pdf-link')])))).toThrow(
      'ngpdf: pdf-link inside a pdf-link',
    );
    expect(() =>
      resolveStyles(nested(el('pdf-text', {}, [el('pdf-span', {}, [el('pdf-link')])]))),
    ).toThrow('ngpdf: pdf-link inside a pdf-link');
    const siblings = el('pdf-document', {}, [el('pdf-link'), el('pdf-view', {}, [el('pdf-link')])]);
    expect(() => resolveStyles(siblings)).not.toThrow();
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

  it('throws a clear error for a pdf-canvas with an element child, which would size and draw it', () => {
    const canvas = el('pdf-canvas', {}, [el('pdf-view', { height: '40' })]);
    expect(() => resolveStyles(el('pdf-document', {}, [canvas]))).toThrow(
      'ngpdf: pdf-canvas cannot have children (found <pdf-view>)',
    );
  });

  it('lets a pdf-canvas hold text, which is ignored', () => {
    const canvas = el('pdf-canvas', {}, [createNode('text', '', 'alt')]);
    expect(() => resolveStyles(el('pdf-document', {}, [canvas]))).not.toThrow();
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
    expect(style.borderRadius).toEqual({ topLeft: 3, topRight: 3, bottomRight: 3, bottomLeft: 3 });
    expect(style.objectFit).toBe('cover');
  });

  it('expands 1 to 4 border-radius values in CSS corner order', () => {
    const radiiOf = (value: string) => styleOf({ 'border-radius': value }).borderRadius;
    expect(styleOf({}).borderRadius).toEqual({
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    });
    expect(radiiOf('1 2')).toEqual({ topLeft: 1, topRight: 2, bottomRight: 1, bottomLeft: 2 });
    expect(radiiOf('1 2 3')).toEqual({ topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 2 });
    expect(radiiOf('1 2 3 4')).toEqual({ topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 });
    expect(radiiOf('1in 0')).toEqual({ topLeft: 72, topRight: 0, bottomRight: 72, bottomLeft: 0 });
    expect(() => radiiOf('1 2 3 4 5')).toThrow(/^ngpdf: expected 1 to 4 values/);
  });

  it('sets one corner with the border-<corner>-radius longhands', () => {
    const style = styleOf({
      'border-radius': '2',
      'border-top-left-radius': '4',
      'border-top-right-radius': '5',
      'border-bottom-right-radius': '6pt',
      'border-bottom-left-radius': '1in',
    });
    expect(style.borderRadius).toEqual({
      topLeft: 4,
      topRight: 5,
      bottomRight: 6,
      bottomLeft: 72,
    });
    const one = styleOf({ 'border-radius': '2', 'border-bottom-left-radius': '0' });
    expect(one.borderRadius).toEqual({ topLeft: 2, topRight: 2, bottomRight: 2, bottomLeft: 0 });
  });

  it('throws on elliptical, percent and negative radii', () => {
    for (const value of ['4 / 8', '4/8', '10%', '-2', '1 -2', 'auto']) {
      expect(() => styleOf({ 'border-radius': value }), value).toThrow(/^ngpdf:/);
    }
    expect(() => styleOf({ 'border-radius': '4 / 8' })).toThrow(
      'ngpdf: elliptical radii are not supported in "4 / 8"',
    );
    expect(() => styleOf({ 'border-radius': '-2' })).toThrow(
      'ngpdf: expected a non-negative length in "-2"',
    );
    for (const value of ['4 8', '10%', '-1', '4/8']) {
      expect(() => styleOf({ 'border-top-left-radius': value }), value).toThrow(/^ngpdf:/);
    }
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

  it('reads max-lines as an integer of at least 1 or none, not inherited', () => {
    expect(styleOf({}).maxLines).toBeNull();
    expect(styleOf({ 'max-lines': ' 3 ' }).maxLines).toBe(3);
    expect(styleOf({ 'max-lines': 'NONE' }).maxLines).toBeNull();
    const text = el('pdf-text');
    const view = el('pdf-view', { 'max-lines': '2' }, [text]);
    expect(resolveStyles(view).get(text)?.maxLines).toBeNull();
    for (const value of ['0', '-1', '1.5', 'two']) {
      expect(() => styleOf({ 'max-lines': value })).toThrow(
        `ngpdf: expected an integer of at least 1 in "${value}" for max-lines`,
      );
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

  it('reads overflow: hidden, clip, scroll and auto as hidden, not inherited', () => {
    expect(styleOf({}).overflow).toBe('visible');
    expect(styleOf({ overflow: 'visible' }).overflow).toBe('visible');
    for (const keyword of ['hidden', 'clip', 'scroll', 'auto']) {
      expect(styleOf({ overflow: keyword }).overflow).toBe('hidden');
    }
    const text = el('pdf-text');
    const view = el('pdf-view', { overflow: 'hidden' }, [text]);
    expect(resolveStyles(view).get(text)?.overflow).toBe('visible');
    // Only both axes at once are supported.
    expect(styleOf({ 'overflow-x': 'hidden', 'overflow-y': 'hidden' }).overflow).toBe('visible');
  });

  it('ignores overflow on a pdf-page and a pdf-table but still checks the keyword', () => {
    expect(styleOf({ overflow: 'hidden' }, 'pdf-page').overflow).toBe('visible');
    expect(styleOf({ overflow: 'hidden' }, 'pdf-table').overflow).toBe('visible');
    expect(() => styleOf({ overflow: 'none' }, 'pdf-table')).toThrow(
      'ngpdf: invalid value "none" for overflow on pdf-table',
    );
  });

  it('reads letter-spacing as a length, negative or normal, and throws on a percentage', () => {
    expect(styleOf({}).letterSpacing).toBe(0);
    expect(styleOf({ 'letter-spacing': '2' }).letterSpacing).toBe(2);
    expect(styleOf({ 'letter-spacing': '1mm' }).letterSpacing).toBeCloseTo(2.835, 3);
    expect(styleOf({ 'letter-spacing': '-0.5pt' }).letterSpacing).toBe(-0.5);
    expect(styleOf({ 'letter-spacing': 'normal' }).letterSpacing).toBe(0);
    expect(() => styleOf({ 'letter-spacing': '10%' })).toThrow('ngpdf:');
  });

  it('reads text-transform keywords, none by default', () => {
    expect(styleOf({}).textTransform).toBe('none');
    for (const keyword of ['none', 'uppercase', 'lowercase', 'capitalize'] as const) {
      expect(styleOf({ 'text-transform': keyword }).textTransform).toBe(keyword);
    }
  });

  it('reads hyphens keywords, manual by default', () => {
    expect(styleOf({}).hyphens).toBe('manual');
    for (const keyword of ['none', 'manual', 'auto'] as const) {
      expect(styleOf({ hyphens: keyword }).hyphens).toBe(keyword);
    }
  });

  it('inherits hyphens and lets a pdf-span set it', () => {
    const warn = vi.fn();
    const span = el('pdf-span', { hyphens: 'none' });
    const text = el('pdf-text', {}, [span]);
    const view = el('pdf-view', { hyphens: 'auto' }, [text]);
    const styles = resolveStyles(el('pdf-document', {}, [view]), warn);
    expect(styles.get(text)?.hyphens).toBe('auto');
    expect(styles.get(span)?.hyphens).toBe('none');
    expect(warn).not.toHaveBeenCalled();
  });

  it('inherits letter-spacing and text-transform, and lets a pdf-span set them', () => {
    const warn = vi.fn();
    const span = el('pdf-span', { 'letter-spacing': '1', 'text-transform': 'lowercase' });
    const text = el('pdf-text', {}, [span]);
    const view = el('pdf-view', { 'letter-spacing': '4', 'text-transform': 'uppercase' }, [text]);
    const styles = resolveStyles(el('pdf-document', {}, [view]), warn);
    expect(styles.get(text)).toMatchObject({ letterSpacing: 4, textTransform: 'uppercase' });
    expect(styles.get(span)).toMatchObject({ letterSpacing: 1, textTransform: 'lowercase' });
    expect(warn).not.toHaveBeenCalled();
  });

  describe('transform', () => {
    const DEG = Math.PI / 180;

    it('is none with a centered origin by default, and not inherited', () => {
      expect(styleOf({})).toMatchObject({
        transform: [],
        transformOrigin: { x: { percent: 50 }, y: { percent: 50 } },
      });
      const text = el('pdf-text');
      const view = el('pdf-view', { transform: 'rotate(10deg)', 'transform-origin': 'left' }, [
        text,
      ]);
      expect(resolveStyles(view).get(text)).toMatchObject({
        transform: [],
        transformOrigin: { x: { percent: 50 }, y: { percent: 50 } },
      });
      expect(styleOf({ transform: 'NONE' }).transform).toEqual([]);
    });

    it('reads rotate in deg, rad and turn, and a bare 0', () => {
      const angle = (value: string) => {
        const [first] = styleOf({ transform: `rotate(${value})` }).transform;
        if (first?.kind !== 'rotate') throw new Error('expected a rotation');
        return first.angle;
      };
      expect(angle('90deg')).toBeCloseTo(90 * DEG, 12);
      expect(angle('-1.5rad')).toBe(-1.5);
      expect(angle('0.25turn')).toBeCloseTo(Math.PI / 2, 12);
      expect(angle('45DEG')).toBeCloseTo(45 * DEG, 12);
      expect(angle('0')).toBe(0);
    });

    it('reads scale, scaleX and scaleY', () => {
      expect(styleOf({ transform: 'scale(2)' }).transform).toEqual([{ kind: 'scale', x: 2, y: 2 }]);
      expect(styleOf({ transform: 'scale(2, -0.5)' }).transform).toEqual([
        { kind: 'scale', x: 2, y: -0.5 },
      ]);
      expect(styleOf({ transform: 'scaleX(3) scaleY(.5)' }).transform).toEqual([
        { kind: 'scale', x: 3, y: 1 },
        { kind: 'scale', x: 1, y: 0.5 },
      ]);
    });

    it('reads translate, translateX and translateY in lengths and percentages', () => {
      expect(styleOf({ transform: 'translate(10pt)' }).transform).toEqual([
        { kind: 'translate', x: 10, y: 0 },
      ]);
      expect(styleOf({ transform: 'translate(1in,50%)' }).transform).toEqual([
        { kind: 'translate', x: 72, y: { percent: 50 } },
      ]);
      expect(styleOf({ transform: 'translateX(-25%) translateY(4px)' }).transform).toEqual([
        { kind: 'translate', x: { percent: -25 }, y: 0 },
        { kind: 'translate', x: 0, y: 4 },
      ]);
    });

    it('keeps the functions in order, in any case, with or without spaces between', () => {
      expect(
        styleOf({ transform: ' TRANSLATE( 5 , 6 )Rotate(1rad)  scale(2) ' }).transform,
      ).toEqual([
        { kind: 'translate', x: 5, y: 6 },
        { kind: 'rotate', angle: 1 },
        { kind: 'scale', x: 2, y: 2 },
      ]);
    });

    it.each([
      ['skew(10deg)', 'unknown transform function "skew" in "skew(10deg)"'],
      ['matrix(1, 0, 0, 1, 0, 0)', 'unknown transform function "matrix"'],
      ['rotate3d(1, 0, 0, 45deg)', 'unknown transform function "rotate3d"'],
      ['translateZ(4pt)', 'unknown transform function "translateZ"'],
      ['rotate(45)', 'invalid angle "45" in "rotate(45)"'],
      ['rotate(45grad)', 'invalid angle "45grad"'],
      ['rotate(1deg, 2deg)', 'expected 1 value in "rotate(1deg, 2deg)"'],
      ['scale()', 'expected 1 or 2 values in "scale()"'],
      ['scale(1, 2, 3)', 'expected 1 or 2 values'],
      ['scaleX(1, 2)', 'expected 1 value'],
      ['scale(50%)', 'invalid number "50%" in "scale(50%)"'],
      ['translate(auto)', 'expected a length in "auto"'],
      ['translate(3em)', 'unknown unit in "3em"'],
      ['translate(1,)', 'invalid length ""'],
      ['rotate(10deg', 'invalid transform "rotate(10deg"'],
      ['rotate(calc(10deg))', 'invalid'],
      ['10deg', 'invalid transform "10deg"'],
      ['', 'invalid transform ""'],
    ])('rejects transform "%s"', (value, message) => {
      expect(() => styleOf({ transform: value })).toThrow(`ngpdf: ${message}`);
    });

    it.each([
      ['left', { x: { percent: 0 }, y: { percent: 50 } }],
      ['RIGHT', { x: { percent: 100 }, y: { percent: 50 } }],
      ['top', { x: { percent: 50 }, y: { percent: 0 } }],
      ['bottom', { x: { percent: 50 }, y: { percent: 100 } }],
      ['center', { x: { percent: 50 }, y: { percent: 50 } }],
      ['10pt', { x: 10, y: { percent: 50 } }],
      ['left top', { x: { percent: 0 }, y: { percent: 0 } }],
      ['top left', { x: { percent: 0 }, y: { percent: 0 } }],
      ['bottom Right', { x: { percent: 100 }, y: { percent: 100 } }],
      ['center top', { x: { percent: 50 }, y: { percent: 0 } }],
      ['top center', { x: { percent: 50 }, y: { percent: 0 } }],
      ['25% 1in', { x: { percent: 25 }, y: 72 }],
      ['right -4', { x: { percent: 100 }, y: -4 }],
      ['5 bottom', { x: 5, y: { percent: 100 } }],
    ])('reads transform-origin "%s"', (value, expected) => {
      expect(styleOf({ 'transform-origin': value }).transformOrigin).toEqual(expected);
    });

    it.each([
      ['top 10pt', 'invalid value "top 10pt" for transform-origin'],
      ['10pt left', 'invalid value "10pt left" for transform-origin'],
      ['left right', 'invalid value "left right" for transform-origin'],
      ['top bottom', 'invalid value "top bottom" for transform-origin'],
      ['left top 4pt', 'expected 1 or 2 values in "left top 4pt"'],
      ['', 'expected 1 or 2 values in ""'],
      ['middle', 'invalid length "middle"'],
      ['auto', 'invalid value "auto" for transform-origin'],
    ])('rejects transform-origin "%s"', (value, message) => {
      expect(() => styleOf({ 'transform-origin': value })).toThrow(`ngpdf: ${message}`);
    });

    it('ignores transform on a pdf-page and a pdf-table but still checks the value', () => {
      for (const tag of ['pdf-page', 'pdf-table']) {
        expect(styleOf({ transform: 'rotate(10deg)' }, tag).transform).toEqual([]);
        expect(() => styleOf({ transform: 'skew(10deg)' }, tag)).toThrow(
          `ngpdf: unknown transform function "skew" in "skew(10deg)" on ${tag}`,
        );
      }
    });

    it('warns that transform has no effect on a pdf-span', () => {
      const warn = vi.fn();
      const span = el('pdf-span', { transform: 'rotate(10deg)' });
      resolveStyles(el('pdf-document', {}, [el('pdf-text', {}, [span])]), warn);
      expect(warn).toHaveBeenCalledWith('ngpdf: transform has no effect on pdf-span');
    });
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
    ['text-transform', 'full-width'],
    ['hyphens', 'all'],
    ['overflow', 'none'],
    ['position', 'float'],
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
    ['break-after', 'Page', 'breakAfter', true],
    ['break-inside', 'Avoid', 'breakInside', 'avoid'],
    ['break-after', 'AVOID', 'keepWithNext', true],
    ['text-transform', 'UPPERCASE', 'textTransform', 'uppercase'],
    ['hyphens', ' AUTO ', 'hyphens', 'auto'],
    ['letter-spacing', 'Normal', 'letterSpacing', 0],
    ['overflow', 'HIDDEN', 'overflow', 'hidden'],
    ['overflow', 'Visible', 'overflow', 'visible'],
    ['position', 'ABSOLUTE', 'position', 'absolute'],
    ['position', ' Relative ', 'position', 'relative'],
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
    expect(styleOf({ 'line-height': 'NORMAL' }).lineHeight).toBe(ROOT_TEXT_STYLE.lineHeight);
    expect(styleOf({ 'line-height': ' Normal ' }).lineHeight).toBe(ROOT_TEXT_STYLE.lineHeight);
    expect(() => styleOf({ 'line-height': 'auto' })).toThrow(
      'ngpdf: invalid line-height "auto" on pdf-view',
    );
  });

  it('keeps the inherited line-height for normal in any case', () => {
    const children = ['normal', 'NORMAL', 'Normal'].map((value) =>
      el('pdf-text', { 'line-height': value }),
    );
    const root = el('pdf-view', { 'line-height': '1.5' }, children);
    const styles = resolveStyles(root);
    for (const child of children) expect(styles.get(child)?.lineHeight).toBe(1.5);
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

describe('gradients', () => {
  const image = (value: string) => styleOf({ 'background-image': value }).backgroundImage;
  const stop = (color: ReturnType<typeof rgb>, position: unknown = null) => ({ color, position });

  it('has no background image by default and reads none in any case', () => {
    expect(styleOf({}).backgroundImage).toBeNull();
    expect(image(' NONE ')).toBeNull();
  });

  it('reads a linear gradient that goes to bottom by default', () => {
    expect(image('linear-gradient(red, blue)')).toEqual({
      kind: 'linear',
      direction: { angle: 180 },
      stops: [stop(RED), stop(BLUE)],
    });
  });

  it('reads angles in deg, rad and turn, and a bare 0', () => {
    const angle = (value: string) => {
      const gradient = image(`linear-gradient(${value}, red, blue)`);
      if (gradient?.kind !== 'linear' || !('angle' in gradient.direction)) throw new Error(value);
      return gradient.direction.angle;
    };
    expect(angle('45deg')).toBe(45);
    expect(angle('-90DEG')).toBe(-90);
    expect(angle(`${String(Math.PI)}rad`)).toBeCloseTo(180, 9);
    expect(angle('0.25turn')).toBe(90);
    expect(angle('0')).toBe(0);
    expect(() => image('linear-gradient(45, red, blue)')).toThrow(
      'ngpdf: invalid gradient angle "45" on pdf-view',
    );
    expect(() => image('linear-gradient(45grad, red, blue)')).toThrow(/^ngpdf: invalid gradient/);
  });

  it('reads to a side as an angle and to a corner as a corner', () => {
    const direction = (value: string) => {
      const gradient = image(`linear-gradient(${value}, red, blue)`);
      return gradient?.kind === 'linear' ? gradient.direction : null;
    };
    expect(direction('to top')).toEqual({ angle: 0 });
    expect(direction('TO Right')).toEqual({ angle: 90 });
    expect(direction('to bottom')).toEqual({ angle: 180 });
    expect(direction('to left')).toEqual({ angle: 270 });
    expect(direction('to top left')).toEqual({ corner: { x: -1, y: -1 } });
    expect(direction('to left top')).toEqual({ corner: { x: -1, y: -1 } });
    expect(direction('to bottom right')).toEqual({ corner: { x: 1, y: 1 } });
    for (const bad of ['to', 'to top bottom', 'to left right', 'to middle', 'to top left right']) {
      expect(() => image(`linear-gradient(${bad}, red, blue)`)).toThrow(
        `ngpdf: invalid gradient direction "${bad}" on pdf-view`,
      );
    }
  });

  it('reads stops with colors that hold commas and optional positions in % or a length', () => {
    expect(image('linear-gradient(rgb(255, 0, 0) 10%, rgba(0,0,255,0.5) 1in, #00ff00)')).toEqual({
      kind: 'linear',
      direction: { angle: 180 },
      stops: [stop(RED, { percent: 10 }), stop(rgb(0, 0, 255, 0.5), 72), stop(rgb(0, 255, 0))],
    });
    // The position may come first, as CSS allows.
    expect(image('linear-gradient(20px red, blue)')).toMatchObject({
      stops: [stop(RED, 20), stop(BLUE)],
    });
  });

  it('rejects bad stops with an ngpdf error', () => {
    expect(() => image('linear-gradient(red)')).toThrow(
      'ngpdf: a gradient needs at least two color stops in "linear-gradient(red)" on pdf-view',
    );
    expect(() => image('linear-gradient(red, , blue)')).toThrow(/^ngpdf: invalid color stop/);
    expect(() => image('linear-gradient(red, 30%, blue)')).toThrow(
      'ngpdf: color hints are not supported in "linear-gradient(red, 30%, blue)" on pdf-view',
    );
    expect(() => image('linear-gradient(red 10% 20%, blue)')).toThrow(
      'ngpdf: invalid color stop "red 10% 20%" on pdf-view',
    );
    expect(() => image('linear-gradient(red auto, blue)')).toThrow(/^ngpdf: invalid color stop/);
    expect(() => image('linear-gradient(red 3em, blue)')).toThrow(/^ngpdf: unknown unit/);
    expect(() => image('linear-gradient(nope, blue)')).toThrow('ngpdf: invalid color "nope"');
  });

  it('reads a radial gradient: ellipse, farthest-corner, at center by default', () => {
    expect(image('radial-gradient(red, blue)')).toEqual({
      kind: 'radial',
      shape: 'ellipse',
      size: 'farthest-corner',
      center: { x: { percent: 50 }, y: { percent: 50 } },
      stops: [stop(RED), stop(BLUE)],
    });
  });

  it('reads the radial shape, size and position in any order and case', () => {
    const radial = (head: string) => image(`radial-gradient(${head}, red, blue)`);
    expect(radial('CIRCLE')).toMatchObject({ shape: 'circle', size: 'farthest-corner' });
    expect(radial('closest-side circle')).toMatchObject({ shape: 'circle', size: 'closest-side' });
    expect(radial('ellipse Farthest-Side')).toMatchObject({
      shape: 'ellipse',
      size: 'farthest-side',
    });
    expect(radial('closest-corner')).toMatchObject({ shape: 'ellipse', size: 'closest-corner' });
    const center = (position: string) => {
      const gradient = radial(`circle at ${position}`);
      return gradient?.kind === 'radial' ? gradient.center : null;
    };
    expect(center('left')).toEqual({ x: { percent: 0 }, y: { percent: 50 } });
    expect(center('TOP')).toEqual({ x: { percent: 50 }, y: { percent: 0 } });
    expect(center('center')).toEqual({ x: { percent: 50 }, y: { percent: 50 } });
    expect(center('20%')).toEqual({ x: { percent: 20 }, y: { percent: 50 } });
    expect(center('right bottom')).toEqual({ x: { percent: 100 }, y: { percent: 100 } });
    expect(center('bottom right')).toEqual({ x: { percent: 100 }, y: { percent: 100 } });
    expect(center('top center')).toEqual({ x: { percent: 50 }, y: { percent: 0 } });
    expect(center('10 30%')).toEqual({ x: 10, y: { percent: 30 } });
    expect(radial('at 0 0')).toMatchObject({ shape: 'ellipse', center: { x: 0, y: 0 } });
  });

  it('rejects bad radial heads', () => {
    const radial = (head: string) => () => image(`radial-gradient(${head}, red, blue)`);
    expect(radial('circle 40px')).toThrow(
      'ngpdf: explicit radial gradient sizes are not supported in "circle 40px" on pdf-view',
    );
    expect(radial('circle ellipse')).toThrow(/^ngpdf: invalid radial gradient shape/);
    expect(radial('closest-side farthest-side')).toThrow(/^ngpdf: invalid radial gradient shape/);
    for (const position of ['', 'top bottom', 'left right', 'middle', 'left 10 top 5', '10 left']) {
      expect(radial(`at ${position}`)).toThrow(/^ngpdf: invalid gradient position/);
    }
  });

  it('names the unsupported images and several backgrounds', () => {
    for (const name of [
      'repeating-linear-gradient',
      'repeating-radial-gradient',
      'conic-gradient',
      'Repeating-Conic-Gradient',
      'url',
    ]) {
      expect(() => image(`${name}(red, blue)`)).toThrow(
        `ngpdf: ${name.toLowerCase()}() is not supported on pdf-view`,
      );
    }
    expect(() => image('linear-gradient(red, blue), radial-gradient(red, blue)')).toThrow(
      'ngpdf: several backgrounds are not supported on pdf-view',
    );
    for (const bad of ['red', 'linear-gradient(red, blue', 'linear-gradient(red, blue) x', 'x(']) {
      expect(() => image(bad)).toThrow(`ngpdf: invalid value "${bad}" for background-image`);
    }
  });

  it('takes a color, a gradient, or both from the background shorthand', () => {
    const gradient = { kind: 'linear', direction: { angle: 180 }, stops: [stop(RED), stop(BLUE)] };
    expect(styleOf({ background: 'navy' })).toMatchObject({
      backgroundColor: rgb(0, 0, 128),
      backgroundImage: null,
    });
    expect(styleOf({ background: 'linear-gradient(red, blue)' })).toMatchObject({
      backgroundColor: null,
      backgroundImage: gradient,
    });
    expect(styleOf({ background: 'LINEAR-GRADIENT(red, blue) rgb(0, 0, 128)' })).toMatchObject({
      backgroundColor: rgb(0, 0, 128),
      backgroundImage: { ...gradient },
    });
    expect(styleOf({ background: 'none' }).backgroundImage).toBeNull();
    // The shorthand resets what it leaves out; a later longhand wins.
    const style = styleOf({ 'background-color': 'red', background: 'linear-gradient(red, blue)' });
    expect(style.backgroundColor).toBeNull();
    expect(
      styleOf({ background: 'red', 'background-image': 'linear-gradient(red, blue)' }),
    ).toMatchObject({ backgroundColor: RED, backgroundImage: gradient });
  });

  it('rejects anything else in the background shorthand', () => {
    const background = (value: string) => () => styleOf({ background: value });
    expect(background('red blue')).toThrow('ngpdf: invalid value "red blue" for background');
    expect(background('red no-repeat')).toThrow(
      'ngpdf: invalid value "red no-repeat" for background',
    );
    expect(background('')).toThrow('ngpdf: invalid value "" for background');
    expect(background('linear-gradient(red, blue) linear-gradient(red, blue)')).toThrow(
      /^ngpdf: invalid value .* for background/,
    );
    expect(background('url(a.png)')).toThrow('ngpdf: url() is not supported on pdf-view');
    expect(background('fancy-gradient(red, blue)')).toThrow(
      'ngpdf: invalid value "fancy-gradient(red, blue)" for background',
    );
    expect(() => image('rgb(1, 2, 3)')).toThrow(
      'ngpdf: invalid value "rgb(1, 2, 3)" for background-image',
    );
    expect(background('red, blue')).toThrow('ngpdf: several backgrounds are not supported');
  });

  it('is not inherited', () => {
    const child = el('pdf-text');
    const parent = el('pdf-view', { 'background-image': 'linear-gradient(red, blue)' }, [child]);
    const styles = resolveStyles(el('pdf-document', {}, [parent]));
    expect(styles.get(parent)?.backgroundImage).not.toBeNull();
    expect(styles.get(child)?.backgroundImage).toBeNull();
  });
});

describe('position', () => {
  const AUTO_INSET = { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' };

  it('is static with auto offsets by default, and not inherited', () => {
    expect(styleOf({})).toMatchObject({ position: 'static', inset: AUTO_INSET });
    const text = el('pdf-text');
    const view = el('pdf-view', { position: 'absolute', top: '4' }, [text]);
    expect(resolveStyles(view).get(text)).toMatchObject({ position: 'static', inset: AUTO_INSET });
  });

  it('reads static, relative and absolute', () => {
    for (const keyword of ['static', 'relative', 'absolute'] as const) {
      expect(styleOf({ position: keyword }).position).toBe(keyword);
    }
  });

  it('reads top, right, bottom and left as lengths, percentages or auto', () => {
    const style = styleOf({ top: '1cm', right: '-5', bottom: '10%', left: 'AUTO' });
    expect(style.inset.top).toBeCloseTo(28.346, 3);
    expect(style.inset).toMatchObject({ right: -5, bottom: { percent: 10 }, left: 'auto' });
  });

  it('keeps the offsets of a static element, which layout then ignores', () => {
    expect(styleOf({ top: '4' })).toMatchObject({ position: 'static', inset: { top: 4 } });
  });

  it.each(['fixed', 'Sticky'])('throws on position: %s', (keyword) => {
    expect(() => styleOf({ position: keyword })).toThrow(
      `ngpdf: position "${keyword.toLowerCase()}" is not supported`,
    );
  });

  it('points position: fixed at the fixed input of pdf-view', () => {
    expect(() => styleOf({ position: 'fixed' })).toThrow(
      'ngpdf: position "fixed" is not supported (use <pdf-view fixed>) on pdf-view',
    );
  });

  it.each([
    ['top', '3em', 'ngpdf: unknown unit in "3em" on pdf-view'],
    ['left', 'middle', 'ngpdf: invalid length "middle" on pdf-view'],
    ['bottom', '', 'ngpdf: invalid length "" on pdf-view'],
  ])('throws on an invalid %s "%s"', (property, value, message) => {
    expect(() => styleOf({ [property]: value })).toThrow(message);
  });

  it.each(['pdf-page', 'pdf-row', 'pdf-cell'])(
    'ignores position and offsets on a %s but still checks the values',
    (tag) => {
      expect(styleOf({ position: 'absolute', top: '4' }, tag)).toMatchObject({
        position: 'static',
        inset: AUTO_INSET,
      });
      expect(() => styleOf({ position: 'fixed' }, tag)).toThrow(/^ngpdf: position "fixed"/);
      expect(() => styleOf({ right: '1em' }, tag)).toThrow(
        `ngpdf: unknown unit in "1em" on ${tag}`,
      );
    },
  );

  it('warns that position and offsets have no effect on a pdf-span', () => {
    const warn = vi.fn();
    const span = el('pdf-span', { position: 'relative', top: '2' });
    resolveStyles(el('pdf-document', {}, [el('pdf-text', {}, [span])]), warn);
    expect(warn).toHaveBeenCalledWith('ngpdf: position has no effect on pdf-span');
    expect(warn).toHaveBeenCalledWith('ngpdf: top has no effect on pdf-span');
  });
});

describe('resolveStyles: pdf-note', () => {
  const YELLOW = rgb(255, 212, 0);
  const note = (style: Record<string, string> = {}, children: PdfNode[] = []): PdfNode =>
    el('pdf-note', style, children);

  it('colors a note sticky-note yellow, not with the color around it', () => {
    const plain = note();
    const inRed = el('pdf-view', { color: 'red' }, [plain]);
    expect(resolveStyles(el('pdf-document', {}, [inRed])).get(plain)?.color).toEqual(YELLOW);
    expect(styleOf({ color: 'blue' }, 'pdf-note').color).toEqual(BLUE);
  });

  it('takes text only', () => {
    const bold = note({}, [el('pdf-span')]);
    expect(() => resolveStyles(el('pdf-document', {}, [bold]))).toThrow(
      'ngpdf: pdf-note takes text only',
    );
    const text = note({}, [createNode('text', '', 'fine')]);
    expect(() => resolveStyles(el('pdf-document', {}, [text]))).not.toThrow();
  });

  it('throws inside a pdf-text, also through a span or a link', () => {
    const inText = (inner: PdfNode): PdfNode =>
      el('pdf-document', {}, [el('pdf-text', {}, [inner])]);
    expect(() => resolveStyles(inText(note()))).toThrow('ngpdf: pdf-note inside a pdf-text');
    expect(() => resolveStyles(inText(el('pdf-span', {}, [note()])))).toThrow(
      'ngpdf: pdf-note inside a pdf-text',
    );
    expect(() => resolveStyles(inText(el('pdf-link', {}, [note()])))).toThrow(
      'ngpdf: pdf-note inside a pdf-text',
    );
    expect(() =>
      resolveStyles(el('pdf-document', {}, [el('pdf-link', {}, [note()])])),
    ).not.toThrow();
  });

  it('throws under a pdf-text at any depth, also inside a view in it', () => {
    const deep = el('pdf-text', {}, [el('pdf-view', {}, [el('pdf-view', {}, [note()])])]);
    expect(() => resolveStyles(el('pdf-document', {}, [deep]))).toThrow(
      'ngpdf: pdf-note inside a pdf-text',
    );
    const beside = el('pdf-view', {}, [el('pdf-text'), el('pdf-view', {}, [note()])]);
    expect(() => resolveStyles(el('pdf-document', {}, [beside]))).not.toThrow();
  });

  it('drops the properties that do not apply before parsing them, with a warning', () => {
    const warn = vi.fn();
    const style = styleOf(
      { transform: 'rotate(45deg)', padding: 'not a length', margin: '10', color: 'blue' },
      'pdf-note',
      warn,
    );
    expect(style.transform).toEqual([]);
    expect(style.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(style.margin).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(style.color).toEqual(BLUE);
    expect(warn.mock.calls).toEqual([
      ['ngpdf: transform has no effect on pdf-note'],
      ['ngpdf: padding has no effect on pdf-note'],
      ['ngpdf: margin has no effect on pdf-note'],
    ]);
  });

  it('warns about properties other than color and position', () => {
    const warn = vi.fn();
    styleOf(
      { color: 'red', position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' },
      'pdf-note',
      warn,
    );
    expect(warn).not.toHaveBeenCalled();
    styleOf({ padding: '4', 'font-size': '20' }, 'pdf-note', warn);
    expect(warn.mock.calls).toEqual([
      ['ngpdf: padding has no effect on pdf-note'],
      ['ngpdf: font-size has no effect on pdf-note'],
    ]);
  });
});
