import { Component, computed, effect, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { renderMarkdown } from '../markdown';
import { breadcrumbs, Seo } from '../seo';
import { editUrlFor, SITE_NAME } from '../site';
import { DOC_PAGES, SECTIONS, docBySlug, docsInSection } from './docs-index';

@Component({
  selector: 'site-docs-page',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './docs-page.html',
  styleUrl: './docs-page.css',
})
export class DocsPage {
  private readonly seo = inject(Seo);
  private readonly sanitizer = inject(DomSanitizer);

  /** Bound from the route parameter (`withComponentInputBinding`). */
  readonly slug = input.required<string>();

  protected readonly sections = SECTIONS.map((name) => ({ name, pages: docsInSection(name) }));
  protected readonly page = computed(() => docBySlug(this.slug()));
  private readonly rendered = computed(() => {
    const page = this.page();
    return page ? renderMarkdown(page.body) : undefined;
  });
  // The Markdown is this repository's own, bundled at build time, so its HTML is trusted.
  protected readonly html = computed(() => {
    const rendered = this.rendered();
    return rendered ? this.sanitizer.bypassSecurityTrustHtml(rendered.html) : '';
  });
  protected readonly headings = computed(() => this.rendered()?.headings ?? []);
  protected readonly neighbours = computed(() => {
    const index = DOC_PAGES.findIndex((page) => page.slug === this.slug());
    return { previous: DOC_PAGES[index - 1], next: DOC_PAGES[index + 1] };
  });
  protected readonly editUrl = computed(() => editUrlFor(this.slug()));

  constructor() {
    // Runs during the prerender too, which is what puts the tags in the static HTML, and again
    // when the router reuses this component for another page.
    effect(() => {
      this.applySeo();
    });
  }

  private applySeo(): void {
    const page = this.page();
    if (!page) {
      this.seo.apply({
        title: `Page not found - ${SITE_NAME}`,
        description: 'This documentation page does not exist.',
        path: `/docs/${this.slug()}`,
        noindex: true,
      });
      return;
    }
    const path = `/docs/${page.slug}`;
    this.seo.apply({
      title: `${page.title} - ${SITE_NAME} docs`,
      description: page.description,
      path,
      type: 'article',
      structuredData: breadcrumbs([
        { name: 'Docs', path: '/docs' },
        { name: page.title, path },
      ]),
    });
  }
}
