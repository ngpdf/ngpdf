import { Component, inject } from '@angular/core';
import { SITE_DATA } from '../../generated/site-data';
import { renderMarkdown } from '../markdown';
import { Seo } from '../seo';
import { GITHUB_URL, SITE_NAME } from '../site';

@Component({
  selector: 'site-changelog-page',
  template: `
    <div class="container page narrow">
      <p class="eyebrow">Releases</p>
      <h1 class="page-title">Changelog</h1>
      <p class="page-lede">
        Every version of <code>&#64;ngpdf/core</code>, newest first. Each one is published from
        GitHub Actions with npm provenance, and its
        <a [href]="releasesUrl" rel="noopener" target="_blank">GitHub release</a> carries an SBOM.
      </p>
      <div class="prose changelog" [innerHTML]="html"></div>
    </div>
  `,
})
export class ChangelogPage {
  protected readonly releasesUrl = `${GITHUB_URL}/releases`;
  // Angular sanitizes it: the changelog needs no ids, scripts or styles, so its headings get no
  // anchors either (the sanitizer would strip their ids and leave the links dangling).
  protected readonly html = renderMarkdown(SITE_DATA.changelog, { headingAnchors: false }).html;

  constructor() {
    inject(Seo).apply({
      title: `Changelog - ${SITE_NAME}`,
      description:
        'Release notes for @ngpdf/core: what changed in each version of the Angular PDF library, with links to the pull requests.',
      path: '/changelog',
    });
  }
}
