import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seo } from '../seo';
import { SITE_NAME } from '../site';

@Component({
  selector: 'site-not-found-page',
  imports: [RouterLink],
  template: `
    <div class="container page narrow not-found">
      <p class="eyebrow">Error 404</p>
      <h1 class="page-title">This page fell off the press</h1>
      <p class="page-lede">The address may be mistyped, or the page may have moved.</p>
      <div class="actions">
        <a class="button primary" routerLink="/">Go to the home page</a>
        <a class="button" routerLink="/docs">Read the docs</a>
      </div>
    </div>
  `,
  styles: `
    .not-found {
      padding-block: 6rem;
    }
  `,
})
export class NotFoundPage {
  constructor() {
    inject(Seo).apply({
      title: `Page not found - ${SITE_NAME}`,
      description: 'This page does not exist on ngpdf.dev.',
      path: '/404',
      noindex: true,
    });
  }
}
