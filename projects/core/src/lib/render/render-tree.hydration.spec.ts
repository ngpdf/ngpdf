// @vitest-environment jsdom
// Its own file: turning hydration on swaps Angular's hydration hooks for the rest of the module.
import { APP_ID, Component, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideClientHydration } from '@angular/platform-browser';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { textContent } from '../tree/node';
import { renderTree } from './render-tree';

@Component({
  selector: 'pdf-test-hydrated',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page><pdf-text>Rendered from a hydrated app</pdf-text></pdf-page>
    </pdf-document>
  `,
})
class HydratedAppDocument {}

describe('renderTree in an app that hydrated from server-rendered HTML', () => {
  beforeAll(() => {
    // What a server-rendered page carries: the integrity marker and the hydration state, which
    // turn Angular's hydration on for every component created afterwards.
    document.body.prepend(document.createComment('nghm'));
    const state = document.createElement('script');
    state.id = 'ng-state';
    state.type = 'application/json';
    state.textContent = JSON.stringify({ __nghData__: [] });
    document.body.append(state);
    TestBed.configureTestingModule({
      providers: [{ provide: APP_ID, useValue: 'ng' }, provideClientHydration()],
    });
  });

  it('renders, because the PDF tree is never matched against server-rendered DOM', () => {
    const tree = renderTree(HydratedAppDocument, TestBed.inject(EnvironmentInjector));
    try {
      expect(tree.root.tag).toBe('pdf-test-hydrated');
      expect(textContent(tree.root)).toBe('Rendered from a hydrated app');
    } finally {
      tree.destroy();
    }
  });
});
