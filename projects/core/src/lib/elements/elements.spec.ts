// @vitest-environment jsdom
import {
  ApplicationRef,
  Component,
  EnvironmentInjector,
  RendererFactory2,
  createComponent,
  createEnvironmentInjector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { elementChildren, propsOf, textContent, type PdfNode } from '../tree/node';
import { PdfRendererFactory } from '../tree/pdf-renderer-factory';
import { PDF_ELEMENTS, type PdfDocument, type PdfTable, type TableColumn } from '.';
import type { PageSize } from './page';

@Component({
  selector: 'pdf-test-defaults',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-view />
        <pdf-text />
        <pdf-image src="data:image/png;base64,AAAA" />
        <pdf-table>
          <pdf-row><pdf-cell /></pdf-row>
        </pdf-table>
        <pdf-page-number />
      </pdf-page>
    </pdf-document>
  `,
})
class DefaultsDocument {}

const BLOB = new Blob(['x']);

@Component({
  selector: 'pdf-test-bound',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page size="Letter" orientation="landscape" />
      <pdf-page [size]="[100, 200]" />
      <pdf-view breakBefore />
      <pdf-view [breakBefore]="false" breakAfter />
      <pdf-text breakBefore="true" [breakAfter]="true" />
      <pdf-image [src]="blob" />
      <pdf-page-number format="Page {page}" />
      <pdf-table [columns]="['1fr', 40]">
        <pdf-row header><pdf-cell span="2" /></pdf-row>
      </pdf-table>
      <pdf-view fixed="top" />
    </pdf-document>
  `,
})
class BoundDocument {
  readonly blob = BLOB;
}

@Component({
  selector: 'pdf-test-spans',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-text
        >Total: <pdf-span style="font-weight: bold">{{ total }}</pdf-span>
        @if (late) {
          <pdf-span>, late</pdf-span>
        }
        @for (tag of tags; track tag) {
          <pdf-span
            ><pdf-span> #{{ tag }}</pdf-span></pdf-span
          >
        }
      </pdf-text>
    </pdf-document>
  `,
})
class SpansDocument {
  readonly total = 42;
  readonly late = true;
  readonly tags = ['a', 'b'];
}

@Component({
  selector: 'pdf-test-links',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-link href="https://example.com/a"><pdf-text>Block</pdf-text></pdf-link>
      <pdf-text>See <pdf-link [href]="url" style="color: blue">the docs</pdf-link>.</pdf-text>
    </pdf-document>
  `,
})
class LinksDocument {
  readonly url = 'mailto:team@example.com';
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${String(index)}`);
  return item;
}

describe('pdf-* elements', () => {
  let rendered: { destroy(): void }[] = [];

  beforeAll(async () => {
    await TestBed.inject(ApplicationRef).whenStable();
  });

  afterEach(() => {
    for (const result of rendered) result.destroy();
    rendered = [];
  });

  function render(
    component:
      typeof DefaultsDocument | typeof BoundDocument | typeof SpansDocument | typeof LinksDocument,
  ): PdfNode {
    const environmentInjector = createEnvironmentInjector(
      [{ provide: RendererFactory2, useFactory: () => new PdfRendererFactory() }],
      TestBed.inject(EnvironmentInjector),
    );
    const ref = createComponent(component, { environmentInjector });
    rendered.push({
      destroy: () => {
        ref.destroy();
        environmentInjector.destroy();
      },
    });
    ref.changeDetectorRef.detectChanges();
    return at(elementChildren(ref.location.nativeElement as PdfNode), 0);
  }

  it('registers each element component as the owner of its node', () => {
    const page = at(elementChildren(render(DefaultsDocument)), 0);
    const kids = elementChildren(page);
    expect(kids.map((n) => n.tag)).toEqual([
      'pdf-view',
      'pdf-text',
      'pdf-image',
      'pdf-table',
      'pdf-page-number',
    ]);
    for (const node of [page, ...kids]) expect(node.owner).not.toBeNull();
  });

  it('exposes the default input values through pdfProps', () => {
    const page = at(elementChildren(render(DefaultsDocument)), 0);
    const kids = elementChildren(page);
    expect(propsOf(page)).toEqual({ size: 'A4', orientation: 'portrait' });
    expect(propsOf(at(kids, 0))).toEqual({ breakBefore: false, breakAfter: false });
    expect(propsOf(at(kids, 1))).toEqual({ breakBefore: false, breakAfter: false });
    expect(propsOf(at(kids, 2))).toEqual({ src: 'data:image/png;base64,AAAA' });
    expect(propsOf(at(kids, 4))).toEqual({ format: '{page} / {total}' });
    const cell = at(elementChildren(at(elementChildren(at(kids, 3)), 0)), 0);
    expect(propsOf(cell)).toEqual({ span: 1 });
  });

  it('exposes bound and attribute values, applying the input transforms', () => {
    const children = elementChildren(render(BoundDocument));
    expect(propsOf(at(children, 0))).toEqual({ size: 'Letter', orientation: 'landscape' });
    expect(propsOf(at(children, 1))['size']).toEqual([100, 200]);
    expect(propsOf(at(children, 2))).toEqual({ breakBefore: true, breakAfter: false });
    expect(propsOf(at(children, 3))).toEqual({ breakBefore: false, breakAfter: true });
    expect(propsOf(at(children, 4))).toEqual({ breakBefore: true, breakAfter: true });
    expect(propsOf(at(children, 5))).toEqual({ src: BLOB });
    expect(propsOf(at(children, 6))).toEqual({ format: 'Page {page}' });
    const table = at(children, 7);
    expect(propsOf(table)['columns']).toEqual(['1fr', 40]);
    const row = at(elementChildren(table), 0);
    expect(propsOf(row)['header']).toBe(true);
    expect(propsOf(at(elementChildren(row), 0))).toEqual({ span: 2 });
    expect(propsOf(at(children, 8))).toEqual({
      breakBefore: false,
      breakAfter: false,
      fixed: 'top',
    });
  });

  it('renders pdf-span with interpolation, @if and @for inside a pdf-text', () => {
    const text = at(elementChildren(render(SpansDocument)), 0);
    const spans = elementChildren(text);
    expect(spans.map((span) => span.tag)).toEqual(['pdf-span', 'pdf-span', 'pdf-span', 'pdf-span']);
    for (const span of spans) {
      expect(span.owner).not.toBeNull();
      expect(propsOf(span)).toEqual({});
    }
    expect(at(spans, 0).rawStyle).toEqual({ 'font-weight': 'bold' });
    expect(textContent(text)).toBe('Total: 42, late #a #b');
  });

  it('renders pdf-link as a block and inside a pdf-text, exposing href through pdfProps', () => {
    const children = elementChildren(render(LinksDocument));
    const block = at(children, 0);
    expect(block.tag).toBe('pdf-link');
    expect(block.owner).not.toBeNull();
    expect(propsOf(block)).toEqual({ href: 'https://example.com/a' });
    const inline = at(elementChildren(at(children, 1)), 0);
    expect(inline.tag).toBe('pdf-link');
    expect(propsOf(inline)).toEqual({ href: 'mailto:team@example.com' });
    expect(inline.rawStyle).toEqual({ color: 'blue' });
  });
});

describe('element input types', () => {
  it('accept readonly arrays, as an `as const` or a readonly field gives them', () => {
    // Checked by the typecheck (tsc over the specs); the call itself does nothing at runtime.
    expectTypeOf<readonly TableColumn[]>().toExtend<ReturnType<PdfTable['columns']>>();
    expectTypeOf<readonly [number, number]>().toExtend<PageSize>();
    expectTypeOf<readonly string[]>().toExtend<ReturnType<PdfDocument['keywords']>>();
  });
});
