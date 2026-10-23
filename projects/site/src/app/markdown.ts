import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import { Marked, type Tokens } from 'marked';

hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);

export interface Heading {
  readonly id: string;
  readonly text: string;
  readonly depth: number;
}

export interface RenderedMarkdown {
  readonly html: string;
  /** The `##` and `###` headings, for the page's table of contents. */
  readonly headings: readonly Heading[];
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Highlighted HTML for one snippet; plain escaped text for a language it does not know. */
export function highlight(code: string, lang: string | undefined): string {
  return lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang }).value
    : escapeHtml(code);
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading): string {
        const inner = this.parser.parseInline(tokens);
        const base = slugify(inner) || 'section';
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        const id = seen === 0 ? base : `${base}-${String(seen)}`;
        if (depth === 2 || depth === 3) {
          headings.push({ id, text: inner.replace(/<[^>]*>/g, ''), depth });
        }
        return `<h${String(depth)} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${String(depth)}>\n`;
      },
      code({ text, lang }: Tokens.Code): string {
        const language = lang?.split(/\s/)[0];
        const label = language ? `<span class="code-lang">${escapeHtml(language)}</span>` : '';
        return `<div class="code-block">${label}<pre><code class="hljs">${highlight(text, language)}</code></pre></div>\n`;
      },
      link({ href, tokens }: Tokens.Link): string {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href);
        const rel = external ? ' rel="noopener" target="_blank"' : '';
        return `<a href="${escapeHtml(href)}"${rel}>${inner}</a>`;
      },
    },
  });
  // Wide reference tables scroll inside the column instead of widening the page on a phone.
  const html = marked
    .parse(source, { async: false })
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');
  return { html, headings };
}

export interface FrontMatter {
  readonly title: string;
  readonly description: string;
  readonly section: string;
  readonly order: number;
}

/** Splits a `---` front-matter block of `key: value` lines from the body. */
export function parseFrontMatter(source: string): { data: FrontMatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new Error('markdown page has no front matter');
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const field = (name: string): string => {
    const value = fields.get(name);
    if (value === undefined) throw new Error(`markdown front matter has no "${name}"`);
    return value.replace(/^["']|["']$/g, '');
  };
  return {
    data: {
      title: field('title'),
      description: field('description'),
      section: field('section'),
      order: Number(field('order')),
    },
    body: source.slice(match[0].length),
  };
}
