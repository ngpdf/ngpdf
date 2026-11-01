import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import type { Box } from './layout';
import { paginatePage } from './paginate';
import { resolveStyles } from './style';
import { createPdfkitWriter, type PdfWriter } from './writer';

let yoga: Yoga;
let writer: PdfWriter;
beforeAll(async () => {
  const { loadYoga } = await import('yoga-layout/load');
  yoga = await loadYoga();
  writer = await createPdfkitWriter({ compress: false });
});

const CONTENT_BOTTOM = 841.89 - 36 - 9;
const CONTENT_HEIGHT = CONTENT_BOTTOM - 36;

function el(tag: string, style: Record<string, string>, props: Record<string, unknown> = {}) {
  const node = createNode('element', tag);
  node.rawStyle = style;
  node.owner = { pdfProps: () => props };
  return node;
}

function adopt(parent: PdfNode, children: PdfNode[]): PdfNode {
  for (const child of children) {
    child.parent = parent;
    parent.children.push(child);
  }
  return parent;
}

function rowOf(height: number, header = false): PdfNode {
  return adopt(el('pdf-row', { height: String(height) }, { header }), [el('pdf-cell', {})]);
}

describe('paginatePage properties', () => {
  it('places every row once and in order, above the content bottom, under its header', () => {
    fc.assert(
      fc.property(
        // size 'max': the default size would keep the arrays a few rows long.
        fc.array(fc.integer({ min: 5, max: 900 }), { maxLength: 300, size: 'max' }),
        fc.option(fc.integer({ min: 5, max: 100 }), { nil: undefined }),
        fc.boolean(),
        (heights, headerHeight, wrapped) => {
          const header = headerHeight === undefined ? undefined : rowOf(headerHeight, true);
          const rows = heights.map((h) => rowOf(h));
          const table = adopt(el('pdf-table', {}, { columns: ['1fr'] }), [
            ...(header ? [header] : []),
            ...rows,
          ]);
          const content = wrapped ? adopt(el('pdf-view', {}), [table]) : table;
          const page = adopt(el('pdf-page', { padding: '36' }, { size: 'A4' }), [
            content,
            el('pdf-page-number', { height: '9' }),
          ]);
          const warnings: string[] = [];
          const pages = paginatePage(page, resolveStyles(page), {
            yoga,
            metrics: writer,
            images: new Map(),
            warn: (message) => warnings.push(message),
          });

          expect(pages.length).toBeGreaterThanOrEqual(1);
          const isRow = new Set(rows);
          const placedNodes = pages.flatMap((p) => p.placed.map((placed) => placed.box.node));
          expect(placedNodes.filter((node) => isRow.has(node))).toEqual(rows);
          // Besides rows, only the header is placed, or the table itself when it is empty.
          const others = placedNodes.filter((node) => !isRow.has(node));
          if (!header) expect(others).toEqual(rows.length === 0 ? [table] : []);

          let clipped = 0;
          for (const laid of pages) {
            for (const placed of laid.placed) {
              if (placed.clipBottom === undefined) {
                expect(placed.y + placed.box.h).toBeLessThanOrEqual(CONTENT_BOTTOM + 1e-6);
              } else {
                clipped++;
                expect(placed.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
              }
            }
            const pageRows = laid.placed.filter((placed) => isRow.has(placed.box.node));
            const nodes = laid.placed.map((placed) => placed.box.node);
            if (header && pageRows.length > 0) {
              if (nodes[0] === header) {
                // The header once, then only rows.
                expect(nodes.filter((node) => node === header)).toHaveLength(1);
                expect(pageRows).toHaveLength(nodes.length - 1);
              } else {
                // Skipped only when the page's first row fits a page without it and not with it.
                expect(pageRows).toHaveLength(nodes.length);
                expect(headerHeight! + pageRows[0]!.box.h).toBeGreaterThan(CONTENT_HEIGHT);
                expect(pageRows[0]!.box.h).toBeLessThanOrEqual(CONTENT_HEIGHT + 1e-6);
              }
            }
          }
          expect(warnings).toHaveLength(clipped);
          if (header && rows.length === 0) {
            expect(pages).toHaveLength(1);
            expect(pages[0]!.placed.map((placed) => placed.box.node)).toEqual([header]);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('draws every line of a split row once, in order, above the content bottom', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 220 }), fc.integer({ min: 6, max: 30 })), {
          minLength: 1,
          maxLength: 4,
        }),
        fc.option(fc.integer({ min: 5, max: 100 }), { nil: undefined }),
        fc.integer({ min: 0, max: 700 }),
        (cells, headerHeight, before) => {
          const contents = cells.map(([count], c) =>
            Array.from({ length: count }, (_, i) => `c${String(c)}w${String(i)}`).join(' '),
          );
          const texts = cells.map(([, size], c) => {
            const style = { 'font-size': String(size), 'line-height': '1' };
            return adopt(el('pdf-text', style), [createNode('text', '', contents[c])]);
          });
          const row = adopt(
            el('pdf-row', {}),
            texts.map((text) => adopt(el('pdf-cell', {}), [text])),
          );
          const header = headerHeight === undefined ? null : rowOf(headerHeight, true);
          const table = adopt(el('pdf-table', {}, { columns: cells.map(() => '1fr') }), [
            ...(header ? [header] : []),
            row,
          ]);
          const page = adopt(el('pdf-page', { padding: '36' }, { size: 'A4' }), [
            el('pdf-view', { height: String(before) }),
            table,
            el('pdf-page-number', { height: '9' }),
          ]);
          const warnings: string[] = [];
          const pages = paginatePage(page, resolveStyles(page), {
            yoga,
            metrics: writer,
            images: new Map(),
            warn: (message) => warnings.push(message),
          });
          expect(warnings).toEqual([]);

          const drawn = texts.map((): string[] => []);
          const walk = (box: Box): void => {
            const index = texts.indexOf(box.node);
            if (index >= 0) drawn[index]!.push(...(box.text?.lines ?? []).map((l) => l.text));
            box.children.forEach(walk);
          };
          for (const laid of pages) {
            for (const placed of laid.placed) {
              walk(placed.box);
              expect(placed.y + placed.box.h).toBeLessThanOrEqual(CONTENT_BOTTOM + 1e-6);
            }
            const nodes = laid.placed.map((placed) => placed.box.node);
            if (header && nodes.includes(row)) expect(nodes[nodes.indexOf(row) - 1]).toBe(header);
          }
          drawn.forEach((lines, c) => {
            expect(lines.join(' ')).toBe(contents[c]);
          });
        },
      ),
      { numRuns: 60 },
    );
  });
});
