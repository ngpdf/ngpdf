import { describe, expect, it, vi } from 'vitest';
import { MAX_SVG_ELEMENTS, parseXml, type XmlElement } from './xml';

const parse = (source: string, warn: (message: string) => void = () => undefined): XmlElement =>
  parseXml(source, warn);

describe('parseXml', () => {
  it('reads elements, attributes and nesting', () => {
    const root = parse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- a logo -->\n<svg viewBox='0 0 10 10' width="20"><g id="a"><path d="M0 0"/></g><rect/></svg>\n`,
    );
    expect(root.name).toBe('svg');
    expect(root.attributes.get('viewBox')).toBe('0 0 10 10');
    expect(root.attributes.get('width')).toBe('20');
    expect(root.children.map((child) => child.name)).toEqual(['g', 'rect']);
    expect(root.children[0]?.children[0]?.attributes.get('d')).toBe('M0 0');
    expect(root.children[0]?.offset).toBe(root.offset + 36);
  });

  it('skips a byte order mark, comments, CDATA and text', () => {
    const root = parse('﻿<svg><![CDATA[ <not> & markup ]]>text<!-- <g> --><g/></svg>');
    expect(root.children.map((child) => child.name)).toEqual(['g']);
  });

  it('decodes the five XML entities and character references in attribute values', () => {
    const root = parse('<svg a="&lt;&gt;&amp;&apos;&quot;" b="&#65;&#x42;&#X43;" c="x\ty\nz\r"/>');
    expect(root.attributes.get('a')).toBe(`<>&'"`);
    expect(root.attributes.get('b')).toBe('ABC');
    expect(root.attributes.get('c')).toBe('x y z ');
  });

  it('keeps namespaced names as written', () => {
    const root = parse('<svg xmlns:xlink="x"><use xlink:href="#a"/><sodipodi:namedview/></svg>');
    expect(root.children[0]?.attributes.get('xlink:href')).toBe('#a');
    expect(root.children[1]?.name).toBe('sodipodi:namedview');
  });

  it('allows whitespace around = and inside end tags', () => {
    const root = parse('<svg  a = "1"\n><g\n/></svg >');
    expect(root.attributes.get('a')).toBe('1');
  });

  describe('skips what it never reads, with a warning', () => {
    it('a DTD, with its internal subset', () => {
      const warn = vi.fn();
      const root = parse(
        `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd" [ <!ENTITY a "]>"> <!ENTITY b '>'> ]><svg/>`,
        warn,
      );
      expect(root.name).toBe('svg');
      expect(warn).toHaveBeenCalledWith('ngpdf: pdf-svg skipped a DTD');
    });

    it('an entity the file declares, as an empty string', () => {
      const warn = vi.fn();
      const root = parse('<!DOCTYPE svg [<!ENTITY lol "lol">]><svg a="x&lol;y">&lol;</svg>', warn);
      expect(root.attributes.get('a')).toBe('xy');
      expect(warn).toHaveBeenCalledWith('ngpdf: pdf-svg skipped the entity "&lol;"');
    });

    it('processing instructions other than the XML declaration', () => {
      const warn = vi.fn();
      parse('<?xml version="1.0"?><?xml-stylesheet href="a.css"?><svg><?php x ?></svg>', warn);
      expect(warn.mock.calls).toEqual([
        ['ngpdf: pdf-svg skipped the processing instruction "xml-stylesheet"'],
        ['ngpdf: pdf-svg skipped the processing instruction "php"'],
      ]);
    });
  });

  describe('throws on malformed markup, with the offset', () => {
    const cases: [string, string][] = [
      ['', 'no root element at 0'],
      ['   ', 'no root element at 3'],
      ['text', 'text outside the root element at 0'],
      ['<svg>', 'unclosed <svg> at 5'],
      ['<svg></g>', '</g> does not close <svg> at 5'],
      ['<svg/><svg/>', 'a second root element at 6'],
      ['<svg/>x', 'text outside the root element at 6'],
      ['<svg a="1" a="2"/>', 'duplicate attribute "a" at 11'],
      ['<svg a=1/>', 'unquoted attribute value at 7'],
      ['<svg a="1/>', 'unclosed attribute value at 7'],
      ['<svg a="<"/>', '"<" in an attribute value at 8'],
      ['<svg a/>', 'attribute "a" has no value at 6'],
      ['<svg a="1"b="2"/>', 'no space between attributes at 10'],
      ['<svg <g/>', 'unexpected "<" in a tag at 5'],
      ['<svg', 'unclosed tag at 4'],
      ['<1svg/>', 'invalid name at 1'],
      ['</svg>', 'end tag with no element to close at 0'],
      ['<svg></svg', 'unclosed end tag at 10'],
      ['<svg></>', 'malformed end tag at 5'],
      ['<svg/ >', '"/" not followed by ">" at 4'],
      ['<svg><!-- x</svg>', 'unclosed comment at 5'],
      ['<svg><![CDATA[ x</svg>', 'unclosed CDATA section at 5'],
      ['<![CDATA[x]]><svg/>', 'CDATA outside the root element at 0'],
      ['<svg/><!DOCTYPE svg>', 'a DTD after the root element at 6'],
      ['<!DOCTYPE svg [ <svg/>', 'unclosed DTD at 0'],
      ['<svg><!ELEMENT x></svg>', 'unknown markup declaration at 5'],
      ['<svg><?pi</svg>', 'unclosed processing instruction at 5'],
      ['<svg a="&"/>', '"&" that starts no reference at 8'],
      ['<svg a="&amp"/>', '"&" that starts no reference at 8'],
      ['<svg a="&#xZZ;"/>', 'invalid character reference at 8'],
      ['<svg a="&#0;"/>', 'invalid character reference at 8'],
      ['<svg a="&#xD800;"/>', 'invalid character reference at 8'],
      ['<svg a="&#x110000;"/>', 'invalid character reference at 8'],
      ['<svg a="&#;"/>', 'invalid character reference at 8'],
      ['<svg a="&1a;"/>', '"&" that starts no reference at 8'],
      ['<svg>a & b</svg>', '"&" that starts no reference at 7'],
    ];
    it.each(cases)('%j', (source, reason) => {
      expect(() => parse(source)).toThrow(`ngpdf: invalid SVG: ${reason}`);
    });
  });

  describe('limits', () => {
    it('throws past 64 levels of nesting', () => {
      const ok = '<g>'.repeat(63) + '</g>'.repeat(63);
      expect(() => parse(`<svg>${ok}</svg>`)).not.toThrow();
      const deep = '<g>'.repeat(64) + '</g>'.repeat(64);
      expect(() => parse(`<svg>${deep}</svg>`)).toThrow('ngpdf: pdf-svg nesting deeper than 64');
    });

    it(`throws past ${String(MAX_SVG_ELEMENTS)} elements`, () => {
      const many = (count: number): string => `<svg>${'<g/>'.repeat(count - 1)}</svg>`;
      expect(parse(many(MAX_SVG_ELEMENTS)).children).toHaveLength(MAX_SVG_ELEMENTS - 1);
      expect(() => parse(many(MAX_SVG_ELEMENTS + 1))).toThrow(
        `ngpdf: pdf-svg has more than ${String(MAX_SVG_ELEMENTS)} elements`,
      );
    });

    it('stays linear on hostile input', () => {
      const inputs = [
        `<svg a="${'&'.repeat(200_000)}"/>`,
        `<svg>${'&a'.repeat(200_000)}</svg>`,
        `<svg>${'<!--'.repeat(1)}${'-'.repeat(500_000)}`,
        `<!DOCTYPE svg [${'['.repeat(300_000)}`,
        `<svg ${'a'.repeat(500_000)}`,
        `<svg>${'<'.repeat(300_000)}`,
      ];
      const started = performance.now();
      for (const input of inputs) expect(() => parse(input)).toThrow('ngpdf:');
      expect(performance.now() - started).toBeLessThan(2000);
    });
  });
});
