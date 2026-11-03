import {
  DestroyRef,
  Directive,
  ElementRef,
  type EmbeddedViewRef,
  type OnInit,
  TemplateRef,
  inject,
} from '@angular/core';
import { createNode, propsOf, type PdfNode } from '../tree/node';
import type { PdfPerSheetContext } from '../tree/per-sheet';

/** Whether a pdf-view with `fixed` holds `node`, at any depth. */
function inFixedView(node: PdfNode): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (current.tag !== 'pdf-view') continue;
    const fixed = propsOf(current)['fixed'];
    if (fixed === 'top' || fixed === 'bottom') return true;
  }
  return false;
}

/**
 * Renders its `ng-template` once per sheet, with that sheet's numbers, inside a fixed pdf-view.
 * The template is not rendered with the document: the engine asks for it through `render`.
 */
@Directive({ selector: '[pdfPerSheet]' })
export class PdfPerSheet implements OnInit {
  private readonly template = inject<TemplateRef<PdfPerSheetContext>>(TemplateRef);
  // On an ng-template, the anchor comment left where the template sits.
  private readonly slot = inject(ElementRef).nativeElement as PdfNode;
  private view: EmbeddedViewRef<PdfPerSheetContext> | undefined;

  constructor() {
    this.slot.owner = this;
    // A view made from a TemplateRef belongs to no container, so nothing else destroys it.
    inject(DestroyRef).onDestroy(() => this.view?.destroy());
  }

  // Read by the template type checker only, which types `let-*` from it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static ngTemplateContextGuard(_dir: PdfPerSheet, ctx: unknown): ctx is PdfPerSheetContext {
    return true;
  }

  // By now the whole creation pass has run, so the slot sits in its pdf-view.
  ngOnInit(): void {
    if (!inFixedView(this.slot)) {
      throw new Error('ngpdf: pdfPerSheet must be inside a fixed pdf-view');
    }
  }

  pdfProps(): Record<string, unknown> {
    return { perSheet: true };
  }

  /**
   * One sheet's content: the previous sheet's view is destroyed first, so a long document holds
   * one view at a time. The root nodes go under a host node before the check, so an `@if` at the
   * template's root has a parent to insert its content into.
   */
  render(context: PdfPerSheetContext): PdfNode {
    this.view?.destroy();
    this.view = undefined;
    const view = this.template.createEmbeddedView(context);
    this.view = view;
    const root = createNode('element', 'ng-template');
    for (const node of view.rootNodes as PdfNode[]) {
      node.parent = root;
      root.children.push(node);
    }
    view.detectChanges();
    return root;
  }
}
