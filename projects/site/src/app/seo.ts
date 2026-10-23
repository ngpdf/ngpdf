import { DOCUMENT, Service, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { OG_IMAGE, SITE_NAME, urlFor } from './site';

export interface PageSeo {
  /** The full title, already suffixed where the page wants it. */
  readonly title: string;
  readonly description: string;
  /** Leading slash, no trailing one except for `/`. */
  readonly path: string;
  readonly type?: 'website' | 'article';
  readonly structuredData?: object;
  readonly noindex?: boolean;
}

const STRUCTURED_DATA_ID = 'structured-data';

/**
 * Writes a page's head: title, description, canonical, Open Graph, Twitter and JSON-LD. Pages call
 * it while they render, so the prerendered HTML a crawler reads already carries the tags.
 */
@Service()
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  apply(page: PageSeo): void {
    const url = urlFor(page.path);
    const image = urlFor(OG_IMAGE);
    this.title.setTitle(page.title);
    this.meta.updateTag({ name: 'description', content: page.description });
    if (page.noindex) this.meta.updateTag({ name: 'robots', content: 'noindex' });
    else this.meta.removeTag('name="robots"');

    this.link('canonical', url);
    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: page.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
    this.structuredData(page.structuredData);
  }

  private link(rel: string, href: string): void {
    let element = this.document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!element) {
      element = this.document.createElement('link');
      element.rel = rel;
      this.document.head.appendChild(element);
    }
    element.href = href;
  }

  private structuredData(data: object | undefined): void {
    this.document.getElementById(STRUCTURED_DATA_ID)?.remove();
    if (!data) return;
    const script = this.document.createElement('script');
    script.id = STRUCTURED_DATA_ID;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    this.document.head.appendChild(script);
  }
}

export function breadcrumbs(items: readonly { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: urlFor(item.path),
    })),
  };
}
