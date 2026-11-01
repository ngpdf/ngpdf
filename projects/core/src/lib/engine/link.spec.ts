import { describe, expect, it } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { linkUrl } from './link';

function link(href: unknown): PdfNode {
  const node = createNode('element', 'pdf-link');
  node.owner = { pdfProps: () => ({ href }) };
  return node;
}

function resolve(href: unknown): { url: string | undefined; warnings: string[] } {
  const warnings: string[] = [];
  const url = linkUrl(link(href), (message) => warnings.push(message));
  return { url, warnings };
}

describe('linkUrl', () => {
  it('keeps http, https and mailto URLs in their normalized form', () => {
    expect(resolve('https://example.com/a b?q=1#top')).toEqual({
      url: 'https://example.com/a%20b?q=1#top',
      warnings: [],
    });
    expect(resolve('HTTP://Example.COM').url).toBe('http://example.com/');
    expect(resolve('  https://example.com/x  ').url).toBe('https://example.com/x');
    expect(resolve('https://bücher.example/ä').url).toBe('https://xn--bcher-kva.example/%C3%A4');
    expect(resolve('mailto:team@example.com?subject=Hi there').url).toBe(
      'mailto:team@example.com?subject=Hi%20there',
    );
  });

  it('writes no link for any other scheme, with a warning naming the URL', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<b>x</b>',
      'ftp://example.com/',
      'tel:+15550100',
    ]) {
      const { url, warnings } = resolve(href);
      expect(url).toBeUndefined();
      expect(warnings).toEqual([
        `ngpdf: pdf-link href "${href}" is not an absolute http, https or mailto URL; no link written`,
      ]);
    }
  });

  it('writes no link for a relative, malformed, empty or missing URL', () => {
    for (const href of ['/pay', 'example.com/pay', '#top', 'https://', 'http://exa mple.com', '']) {
      expect(resolve(href).url).toBeUndefined();
      expect(resolve(href).warnings).toHaveLength(1);
    }
    expect(resolve(undefined)).toEqual({
      url: undefined,
      warnings: [
        'ngpdf: pdf-link href "undefined" is not an absolute http, https or mailto URL; no link written',
      ],
    });
  });

  it('shortens a long URL in the warning', () => {
    const { warnings } = resolve(`javascript:${'a'.repeat(500)}`);
    expect(warnings[0]!.length).toBeLessThan(200);
  });
});
