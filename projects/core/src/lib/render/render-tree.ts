import {
  RendererFactory2,
  type ComponentRef,
  createComponent,
  createEnvironmentInjector,
  type EnvironmentInjector,
  type Type,
} from '@angular/core';
import { PdfRendererFactory } from '../tree/pdf-renderer-factory';
import type { PdfNode } from '../tree/node';

/**
 * Renders a component into a PdfNode tree. The component gets its own child injector so each
 * render has its own renderer and tree; the caller's injector is only the parent.
 */
export function renderTree<T>(
  component: Type<T>,
  parent: EnvironmentInjector,
  inputs: Record<string, unknown> = {},
): { root: PdfNode; destroy(): void } {
  const environmentInjector = createEnvironmentInjector(
    [{ provide: RendererFactory2, useFactory: () => new PdfRendererFactory() }],
    parent,
  );
  let ref: ComponentRef<T>;
  try {
    ref = createComponent(component, { environmentInjector });
  } catch (error) {
    // A constructor that throws (the document's or a child's) leaves no ComponentRef: Angular drops
    // the half-built views without destroying them, so their DestroyRef callbacks are out of reach.
    // The injector is ours to destroy, and that runs its own DestroyRef callbacks.
    environmentInjector.destroy();
    throw error;
  }
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    ref.destroy();
    environmentInjector.destroy();
  };
  try {
    for (const [name, value] of Object.entries(inputs)) ref.setInput(name, value);
    ref.changeDetectorRef.detectChanges();
  } catch (error) {
    destroy();
    throw error;
  }
  return { root: ref.location.nativeElement as PdfNode, destroy };
}
