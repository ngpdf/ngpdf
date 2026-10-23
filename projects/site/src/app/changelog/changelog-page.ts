import { Component, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
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
  // Generated from the repository's own CHANGELOG.md at build time, so it is trusted.
  protected readonly html = inject(DomSanitizer).bypassSecurityTrustHtml(
    renderMarkdown(SITE_DATA.changelog).html,
  );

  constructor() {
    inject(Seo).apply({
      title: `Changelog - ${SITE_NAME}`,
      description:
        'Release notes for @ngpdf/core: what changed in each version of the Angular PDF library, with links to the pull requests.',
      path: '/changelog',
    });
  }
}
