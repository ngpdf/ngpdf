// @vitest-environment jsdom
import { DatePipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import {
  ApplicationRef,
  Component,
  DestroyRef,
  EnvironmentInjector,
  InjectionToken,
  type Type,
  LOCALE_ID,
  createEnvironmentInjector,
  inject,
  input,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { elementChildren, propsOf, textContent, type PdfNode } from '../tree/node';
import type { PdfPerSheetContext } from '../tree/per-sheet';
import { renderTree } from './render-tree';

registerLocaleData(localePt);

const GREETING = new InjectionToken<string>('GREETING');
const destroyed: string[] = [];

@Component({
  selector: 'pdf-test-document',
  imports: [PDF_ELEMENTS, DatePipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  template: `
    <pdf-document title="Report">
      <pdf-page>
        <pdf-table [columns]="columns">
          <pdf-row header><pdf-cell>Name</pdf-cell></pdf-row>
          @for (item of items(); track item) {
            <pdf-row style="padding: 6" [style.background-color]="$odd ? '#f2f2f2' : '#ffffff'">
              <pdf-cell>{{ item }}</pdf-cell>
            </pdf-row>
          }
        </pdf-table>
        <pdf-text>{{ day() | date: 'shortDate' }}</pdf-text>
        <pdf-text>{{ greeting }}</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
class TestDocument {
  readonly columns = ['2fr', '1fr'] as ('2fr' | '1fr')[];
  readonly items = () => ['a', 'b', 'c'];
  readonly day = () => new Date(2026, 9, 22);
  readonly greeting = inject(GREETING, { optional: true }) ?? 'none';

  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('test-document'));
  }
}

function find(node: PdfNode, tag: string): PdfNode[] {
  return [
    ...(node.tag === tag ? [node] : []),
    ...elementChildren(node).flatMap((child) => find(child, tag)),
  ];
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${String(index)}`);
  return item;
}

const FIXED_DATE = new Date(2020, 0, 2);

@Component({
  selector: 'pdf-test-dated',
  imports: [PDF_ELEMENTS],
  template: `<pdf-document [creationDate]="date" />`,
})
class DatedDocument {
  readonly date = FIXED_DATE;
}

@Component({
  selector: 'pdf-test-cascade',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-view style="margin-top: 20; margin: 0; margin-top: 5" />
        <pdf-view style="margin-top: 5; margin: 10" [style.margin-top.pt]="top" />
        <pdf-view style="margin-top: 7" [style.margin-top.pt]="unset" />
        <pdf-view style="margin-top: 7" [style.margin-top.pt]="removed" />
      </pdf-page>
    </pdf-document>
  `,
})
class CascadeDocument {
  readonly top = 20;
  readonly unset = undefined;
  readonly removed = null;
}

const seen: { injector?: EnvironmentInjector } = {};

@Component({
  selector: 'pdf-test-throwing',
  imports: [PDF_ELEMENTS],
  template: `<pdf-document />`,
})
class ThrowingInputDocument {
  readonly boom = input(0, {
    transform: (value: number): number => {
      if (value < 0) throw new Error('bad input');
      return value;
    },
  });

  constructor() {
    seen.injector = inject(EnvironmentInjector);
    inject(DestroyRef).onDestroy(() => destroyed.push('throwing-document'));
  }
}

@Component({
  selector: 'pdf-test-throwing-render',
  imports: [PDF_ELEMENTS],
  template: `<pdf-document [title]="explode()" />`,
})
class ThrowingRenderDocument {
  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('throwing-render'));
  }

  explode(): string {
    throw new Error('bad template');
  }
}

@Component({
  selector: 'pdf-test-constructor-throws',
  imports: [PDF_ELEMENTS],
  template: `<pdf-document />`,
})
class ConstructorThrowsDocument {
  constructor() {
    seen.injector = inject(EnvironmentInjector);
    seen.injector.get(DestroyRef).onDestroy(() => destroyed.push('root-injector'));
    throw new Error('root boom');
  }
}

@Component({ selector: 'pdf-test-sibling', template: '' })
class Sibling {
  constructor() {
    inject(EnvironmentInjector)
      .get(DestroyRef)
      .onDestroy(() => destroyed.push('sibling-injector'));
    inject(DestroyRef).onDestroy(() => destroyed.push('sibling-view'));
  }
}

@Component({ selector: 'pdf-test-boom', template: '' })
class Boom {
  constructor() {
    throw new Error('child boom');
  }
}

@Component({
  selector: 'pdf-test-child-throws',
  imports: [PDF_ELEMENTS, Sibling, Boom],
  template: `<pdf-document><pdf-test-sibling /><pdf-test-boom /></pdf-document>`,
})
class ChildThrowsDocument {
  constructor() {
    seen.injector = inject(EnvironmentInjector);
  }
}

const sheetLog: string[] = [];

@Component({ selector: 'pdf-test-tracked', template: '' })
class Tracked {
  readonly label = input('');

  constructor() {
    sheetLog.push('create');
    inject(DestroyRef).onDestroy(() => sheetLog.push('destroy'));
  }
}

@Component({
  selector: 'pdf-test-per-sheet',
  imports: [PDF_ELEMENTS, Tracked],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-view fixed="bottom">
          <pdf-text>Static</pdf-text>
          <pdf-view>
            <ng-template
              pdfPerSheet
              let-n
              let-sheet="sheet"
              let-total="total"
              let-first="first"
              let-last="last"
              let-page="page"
            >
              <pdf-test-tracked />
              <pdf-text>{{ n }} {{ sheet }}/{{ total }} {{ first }} {{ last }} {{ page }}</pdf-text>
              <pdf-text>{{ greeting }}</pdf-text>
              @if (sheet < total) {
                <pdf-text>Continued on next page</pdf-text>
              } @else {
                <pdf-text>End of report</pdf-text>
              }
            </ng-template>
          </pdf-view>
        </pdf-view>
        <pdf-text>Body</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
class PerSheetDocument {
  readonly greeting = inject(GREETING, { optional: true }) ?? 'none';
}

@Component({
  selector: 'pdf-test-per-sheet-in-flow',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-view>
          <ng-template pdfPerSheet let-sheet
            ><pdf-text>{{ sheet }}</pdf-text></ng-template
          >
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
class PerSheetInFlowDocument {}

function slotIn(node: PdfNode): PdfNode | undefined {
  if (node.kind === 'comment' && propsOf(node)['perSheet'] === true) return node;
  for (const child of node.children) {
    const found = slotIn(child);
    if (found) return found;
  }
  return undefined;
}

const sheetContext = (sheet: number, total: number, page = 1): PdfPerSheetContext => ({
  $implicit: sheet,
  sheet,
  total,
  first: sheet === 1,
  last: sheet === total,
  page,
});

describe('renderTree', () => {
  let parent: EnvironmentInjector;
  let rendered: { destroy(): void }[] = [];

  const render = (
    component: Type<unknown>,
    injector: EnvironmentInjector = parent,
  ): ReturnType<typeof renderTree> => {
    const result = renderTree(component, injector);
    rendered.push(result);
    return result;
  };

  afterEach(() => {
    // Last made first: a tree goes before the injector it was rendered in.
    for (const result of rendered.reverse()) result.destroy();
    rendered = [];
  });

  // TestBed's injector is torn down after each test, so each test takes the current one.
  beforeEach(async () => {
    parent = TestBed.inject(EnvironmentInjector);
    await TestBed.inject(ApplicationRef).whenStable();
  });

  it('builds document > page > table > rows with props', () => {
    const result = render(TestDocument, parent);
    const documents = find(result.root, 'pdf-document');
    expect(documents).toHaveLength(1);
    const document = at(documents, 0);
    expect(propsOf(document)['title']).toBe('Report');
    expect(elementChildren(document).map((n) => n.tag)).toEqual(['pdf-page']);
    const tables = find(result.root, 'pdf-table');
    expect(tables).toHaveLength(1);
    const table = at(tables, 0);
    expect(propsOf(table)['columns']).toEqual(['2fr', '1fr']);
    const rows = elementChildren(table);
    expect(rows.map((n) => n.tag)).toEqual(['pdf-row', 'pdf-row', 'pdf-row', 'pdf-row']);
    expect(propsOf(at(rows, 0))['header']).toBe(true);
    expect(propsOf(at(rows, 1))['header']).toBe(false);
  });

  it('leaves creationDate undefined unless bound, and passes a bound Date through', () => {
    const unbound = render(TestDocument);
    expect(propsOf(at(find(unbound.root, 'pdf-document'), 0))['creationDate']).toBeUndefined();
    const bound = render(DatedDocument);
    expect(propsOf(at(find(bound.root, 'pdf-document'), 0))['creationDate']).toBe(FIXED_DATE);
  });

  it('applies static and bound styles', () => {
    const result = render(TestDocument, parent);
    const rows = elementChildren(at(find(result.root, 'pdf-table'), 0));
    expect(at(rows, 1).rawStyle['background-color']).toBe('#ffffff');
    expect(at(rows, 2).rawStyle['background-color']).toBe('#f2f2f2');
    expect(at(rows, 1).rawStyle['padding']).toBe('6');
  });

  it('lets a later longhand, static or bound, win over an earlier shorthand', async () => {
    const { resolveStyles } = await import('../engine/style');
    const result = render(CascadeDocument);
    const views = find(result.root, 'pdf-view');
    const styles = resolveStyles(result.root);
    expect(styles.get(at(views, 0))?.margin).toEqual({ top: 5, right: 0, bottom: 0, left: 0 });
    expect(styles.get(at(views, 1))?.margin).toEqual({ top: 20, right: 10, bottom: 10, left: 10 });
  });

  it('falls back to the static style for an undefined binding and removes it for null', () => {
    const views = find(render(CascadeDocument).root, 'pdf-view');
    expect(at(views, 2).rawStyle['margin-top']).toBe('7');
    expect(at(views, 3).rawStyle['margin-top']).toBeUndefined();
  });

  it('formats dates through pipes with the component locale', () => {
    const result = render(TestDocument, parent);
    expect(textContent(at(find(result.root, 'pdf-text'), 0))).toBe('22/10/2026');
  });

  it('resolves services from the parent injector', () => {
    const withGreeting = createEnvironmentInjector(
      [{ provide: GREETING, useValue: 'hello' }],
      parent,
    );
    rendered.push(withGreeting);
    const result = render(TestDocument, withGreeting);
    expect(textContent(at(find(result.root, 'pdf-text'), 1))).toBe('hello');
  });

  it('runs DestroyRef callbacks on destroy', () => {
    destroyed.length = 0;
    const result = render(TestDocument, parent);
    expect(destroyed).toEqual([]);
    result.destroy();
    expect(destroyed).toEqual(['test-document']);
  });

  it('destroys the component and its injector and rethrows when an input setter throws', () => {
    destroyed.length = 0;
    expect(() => renderTree(ThrowingInputDocument, parent, { boom: -1 })).toThrow('bad input');
    expect(destroyed).toEqual(['throwing-document']);
    expect(() => seen.injector?.get(GREETING, null)).toThrow(/destroyed/i);
  });

  it('destroys the component and rethrows when change detection throws', () => {
    destroyed.length = 0;
    expect(() => renderTree(ThrowingRenderDocument, parent)).toThrow('bad template');
    expect(destroyed).toEqual(['throwing-render']);
  });

  it('destroys the injector and rethrows when the document constructor throws', () => {
    destroyed.length = 0;
    expect(() => renderTree(ConstructorThrowsDocument, parent)).toThrow('root boom');
    expect(destroyed).toEqual(['root-injector']);
    expect(() => seen.injector?.get(GREETING, null)).toThrow(/destroyed/i);
  });

  it('destroys the injector and rethrows when a child constructor throws', () => {
    destroyed.length = 0;
    expect(() => renderTree(ChildThrowsDocument, parent)).toThrow('child boom');
    expect(destroyed).toContain('sibling-injector');
    expect(() => seen.injector?.get(GREETING, null)).toThrow(/destroyed/i);
  });

  it('destroy is idempotent', () => {
    destroyed.length = 0;
    const result = render(TestDocument, parent);
    result.destroy();
    result.destroy();
    expect(destroyed).toEqual(['test-document']);
  });

  describe('pdfPerSheet', () => {
    it('leaves the template unrendered, marking its slot inside the fixed view', () => {
      const result = render(PerSheetDocument);
      const fixed = at(find(result.root, 'pdf-view'), 0);
      expect(textContent(fixed)).toBe('Static');
      expect(slotIn(fixed)).toBeDefined();
    });

    it('renders the template with the sheet context, its pipes and its injector', () => {
      const withGreeting = createEnvironmentInjector(
        [{ provide: GREETING, useValue: 'hello' }],
        parent,
      );
      const result = render(PerSheetDocument, withGreeting);
      const slot = slotIn(result.root)!;
      const middle = result.perSheet(slot, sheetContext(2, 3, 4));
      expect(find(middle, 'pdf-text').map(textContent)).toEqual([
        '2 2/3 false false 4',
        'hello',
        'Continued on next page',
      ]);
      const last = result.perSheet(slot, sheetContext(3, 3));
      expect(find(last, 'pdf-text').map(textContent)).toEqual([
        '3 3/3 false true 1',
        'hello',
        'End of report',
      ]);
    });

    it('destroys each sheet view before the next one, and the last one with the tree', () => {
      sheetLog.length = 0;
      const result = render(PerSheetDocument);
      const slot = slotIn(result.root)!;
      expect(sheetLog).toEqual([]);
      result.perSheet(slot, sheetContext(1, 2));
      expect(sheetLog).toEqual(['create']);
      result.perSheet(slot, sheetContext(2, 2));
      expect(sheetLog).toEqual(['create', 'destroy', 'create']);
      result.destroy();
      expect(sheetLog).toEqual(['create', 'destroy', 'create', 'destroy']);
    });

    it('throws for a pdfPerSheet template outside a fixed pdf-view', () => {
      expect(() => renderTree(PerSheetInFlowDocument, parent)).toThrow(
        'ngpdf: pdfPerSheet must be inside a fixed pdf-view',
      );
    });

    it('refuses a slot that is not a pdfPerSheet anchor', () => {
      const result = render(PerSheetDocument);
      expect(() =>
        result.perSheet(at(find(result.root, 'pdf-text'), 0), sheetContext(1, 1)),
      ).toThrow('ngpdf: not a pdfPerSheet template');
    });
  });
});
