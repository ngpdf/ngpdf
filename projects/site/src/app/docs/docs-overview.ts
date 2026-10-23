import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { breadcrumbs, Seo } from '../seo';
import { SITE_NAME } from '../site';
import { SECTIONS, docsInSection } from './docs-index';

@Component({
  selector: 'site-docs-overview',
  imports: [RouterLink],
  template: `
    <div class="container page">
      <p class="eyebrow">Documentation</p>
      <h1 class="page-title">Learn ngpdf</h1>
      <p class="page-lede">
        Start with the guide, keep the reference open while you build, and read the project pages
        to see how the engine works and where it is going.
      </p>
      @for (section of sections; track section.name) {
        <section class="overview-section" [attr.aria-labelledby]="'section-' + section.name">
          <h2 [id]="'section-' + section.name">{{ section.name }}</h2>
          <ul class="card-grid">
            @for (page of section.pages; track page.slug) {
              <li>
                <a class="card" [routerLink]="['/docs', page.slug]">
                  <span class="card-title">{{ page.title }}</span>
                  <span class="card-text">{{ page.description }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  styles: `
    .overview-section h2 {
      margin: 3rem 0 1rem;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
  `,
})
export class DocsOverview {
  protected readonly sections = SECTIONS.map((name) => ({ name, pages: docsInSection(name) }));

  constructor() {
    inject(Seo).apply({
      title: `Documentation - ${SITE_NAME}`,
      description:
        'Guides and reference for ngpdf: documents and pages, layout and styling, tables, pagination, images, the rendering API and every pdf-* element.',
      path: '/docs',
      structuredData: breadcrumbs([{ name: 'Docs', path: '/docs' }]),
    });
  }
}
