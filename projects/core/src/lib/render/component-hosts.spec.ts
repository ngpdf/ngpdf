// @vitest-environment jsdom
/* eslint-disable @angular-eslint/component-selector -- user components here use app-, like an app's would */
import { ApplicationRef, Component, EnvironmentInjector, input, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { renderTree } from './render-tree';

type PageOps = Parameters<
  Awaited<ReturnType<typeof import('../engine/writer').createPdfkitWriter>>['write']
>[0][number];
type TextOp = Extract<PageOps['ops'][number], { op: 'text' }>;

@Component({
  selector: 'app-cover',
  imports: [PDF_ELEMENTS],
  template: `<pdf-page><pdf-text>Cover</pdf-text></pdf-page>`,
})
class Cover {}

@Component({
  selector: 'app-amount',
  imports: [PDF_ELEMENTS],
  template: `<pdf-cell style="padding: 4">{{ value() }}</pdf-cell>`,
})
class Amount {
  readonly value = input.required<string>();
}

@Component({
  selector: 'app-rows',
  imports: [PDF_ELEMENTS, Amount],
  template: `
    @for (item of items(); track $index) {
      <pdf-row>
        <pdf-cell style="padding: 4">{{ item }}</pdf-cell>
        <app-amount [value]="'R$ ' + $index" />
      </pdf-row>
    }
  `,
})
class Rows {
  readonly items = input.required<string[]>();
}

@Component({
  selector: 'app-lines',
  imports: [PDF_ELEMENTS],
  template: `
    @for (line of lines(); track $index) {
      <pdf-text style="height: 20">{{ line }}</pdf-text>
    }
  `,
})
class Lines {
  readonly lines = input.required<string[]>();
}

// Helvetica 10pt in a 12pt line: (12 - 7.18 ascent - 2.07 descent) / 2 above the text.
const HALF_LEADING = (12 - 7.18 - 2.07) / 2;

const ITEMS = Array.from({ length: 60 }, (_, i) => `Item ${String(i + 1)}`);

@Component({
  selector: 'app-cover-document',
  imports: [PDF_ELEMENTS, Cover],
  template: `<pdf-document><app-cover /></pdf-document>`,
})
class CoverDocument {}

@Component({
  selector: 'app-table-document',
  imports: [PDF_ELEMENTS, Rows],
  template: `
    <pdf-document>
      <pdf-page style="padding: 36">
        <pdf-table [columns]="[120, '1fr']">
          <pdf-row header>
            <pdf-cell style="padding: 4">Name</pdf-cell>
            <pdf-cell style="padding: 4">Amount</pdf-cell>
          </pdf-row>
          <app-rows [items]="items" />
        </pdf-table>
      </pdf-page>
    </pdf-document>
  `,
})
class TableDocument {
  readonly items = ITEMS;
}

@Component({
  selector: 'app-list-document',
  imports: [PDF_ELEMENTS, Lines],
  template: `
    <pdf-document>
      <pdf-page style="padding: 36">
        <app-lines [lines]="items" style="color: red" />
      </pdf-page>
    </pdf-document>
  `,
})
class ListDocument {
  readonly items = ITEMS;
}

@Component({
  selector: 'app-pageless-document',
  imports: [PDF_ELEMENTS, Lines],
  template: `<pdf-document
    ><pdf-view><app-lines [lines]="['x']" /></pdf-view
  ></pdf-document>`,
})
class PagelessDocument {}

/** Renders a real template through the real engine and hands back the pages it wrote. */
async function pagesOf(component: Type<unknown>, dev = false): Promise<PageOps[]> {
  const { renderDocument } = await import('../engine');
  const { createPdfkitWriter } = await import('../engine/writer');
  const real = await createPdfkitWriter({ compress: false });
  let pages: PageOps[] = [];
  const writer = {
    ...real,
    write: (written: readonly PageOps[]) => {
      pages = [...written];
      return Promise.resolve(new Blob());
    },
  };
  const tree = renderTree(component, TestBed.inject(EnvironmentInjector));
  try {
    await renderDocument(tree.root, { writer, dev });
  } finally {
    tree.destroy();
  }
  return pages;
}

const texts = (page: PageOps): TextOp[] => page.ops.filter((op): op is TextOp => op.op === 'text');

describe('user component hosts', () => {
  beforeEach(async () => {
    await TestBed.inject(ApplicationRef).whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds a pdf-page inside a component', async () => {
    const pages = await pagesOf(CoverDocument);
    expect(pages).toHaveLength(1);
    expect(texts(pages[0]!).map((op) => op.text)).toEqual(['Cover']);
  });

  it('keeps rows from a row component in their columns and repeats the header', async () => {
    const pages = await pagesOf(TableDocument);
    expect(pages.length).toBeGreaterThan(1);
    const all = pages.flatMap(texts);
    const name = all.find((op) => op.text === 'Name')!;
    const amount = all.find((op) => op.text === 'Amount')!;
    // Second column: 36 page padding + 120 first column + 4 cell padding.
    expect(amount.x).toBeCloseTo(160, 6);
    for (const [index, item] of ITEMS.entries()) {
      const row = all.find((op) => op.text === item)!;
      const value = all.find((op) => op.text === `R$ ${String(index)}`)!;
      expect(row.x).toBeCloseTo(name.x, 6);
      expect(value.x).toBeCloseTo(amount.x, 6);
      expect(value.y).toBeCloseTo(row.y, 6);
    }
    // Both header cells, in their columns, open every page.
    for (const page of pages) {
      const header = texts(page).slice(0, 2);
      expect(header.map(({ text, x }) => ({ text, x }))).toEqual([
        { text: 'Name', x: name.x },
        { text: 'Amount', x: amount.x },
      ]);
      for (const cell of header) expect(cell.y).toBeCloseTo(40 + HALF_LEADING, 6);
    }
  });

  it('paginates a long list inside a component host instead of clipping it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pages = await pagesOf(ListDocument, true);
    // 60 lines of 20pt in an A4 content box of 769.89pt: 38 lines per page.
    expect(pages.map((page) => texts(page).length)).toEqual([38, 22]);
    const [first] = texts(pages[1]!);
    expect({ text: first?.text, x: first?.x }).toEqual({ text: 'Item 39', x: 36 });
    expect(first?.y).toBeCloseTo(36 + HALF_LEADING, 6);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'ngpdf: styles on <app-lines> are ignored; style a pdf-* element inside it',
    );
  });

  it('rejects a pdf-document with no pdf-page', async () => {
    await expect(pagesOf(PagelessDocument)).rejects.toThrow('ngpdf: pdf-document has no pdf-page');
  });
});
