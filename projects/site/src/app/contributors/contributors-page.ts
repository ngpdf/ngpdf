import { Component, inject } from '@angular/core';
import { SITE_DATA } from '../../generated/site-data';
import { Seo } from '../seo';
import { GITHUB_URL, SITE_NAME } from '../site';

@Component({
  selector: 'site-contributors-page',
  template: `
    <div class="container page">
      <p class="eyebrow">Community</p>
      <h1 class="page-title">Contributors</h1>
      <p class="page-lede">
        ngpdf is built in the open. Everyone who helps, with code, documentation, bug reports,
        reviews or ideas, is listed here, following the
        <a href="https://allcontributors.org" rel="noopener" target="_blank">all-contributors</a>
        specification.
      </p>

      <ul class="contributors">
        @for (person of contributors; track person.login) {
          <li class="contributor">
            <a [href]="person.profile" rel="noopener" target="_blank">
              <img
                [src]="person.avatar + '&s=192'"
                alt=""
                width="96"
                height="96"
                loading="lazy"
                decoding="async"
              />
              <span class="contributor-name">{{ person.name }}</span>
              <span class="contributor-login">&#64;{{ person.login }}</span>
            </a>
            <ul class="tags" [attr.aria-label]="'Contributions by ' + person.name">
              @for (kind of person.contributions; track kind) {
                <li>{{ kind }}</li>
              }
            </ul>
          </li>
        }
      </ul>

      <section class="join" aria-labelledby="join-title">
        <h2 id="join-title">Join them</h2>
        <p>
          Pick an issue labelled <em>good first issue</em>, improve a page of these docs, or report
          a document that renders wrong. After your pull request is merged, a maintainer adds you
          here with the all-contributors bot.
        </p>
        <div class="actions">
          <a class="button primary" [href]="githubUrl + '/issues'" rel="noopener" target="_blank"
            >Browse issues</a
          >
          <a
            class="button"
            [href]="githubUrl + '/blob/main/CONTRIBUTING.md'"
            rel="noopener"
            target="_blank"
            >Read the contributing guide</a
          >
        </div>
      </section>
    </div>
  `,
  styles: `
    .contributors {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
      gap: 1.25rem;
      margin: 2.5rem 0 0;
      padding: 0;
      list-style: none;
    }
    .contributor {
      padding: 1.5rem 1.25rem;
      border: 1px solid var(--rule);
      border-radius: var(--radius);
      background: var(--paper-raised);
      text-align: center;
    }
    .contributor > a {
      display: block;
      color: var(--ink);
      text-decoration: none;
    }
    .contributor img {
      display: block;
      margin: 0 auto 0.75rem;
      border-radius: 50%;
      border: 1px solid var(--rule);
    }
    .contributor-name {
      display: block;
      font-weight: 600;
    }
    .contributor-login {
      display: block;
      font-size: 0.85rem;
      color: var(--muted);
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.35rem;
      margin: 1rem 0 0;
      padding: 0;
      list-style: none;
    }
    .tags li {
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: var(--accent-wash);
      color: var(--accent-ink);
      font-size: 0.72rem;
    }
    .join {
      margin-top: 4rem;
      padding: 2rem;
      border: 1px dashed var(--rule-strong);
      border-radius: var(--radius);
    }
    .join h2 {
      margin: 0 0 0.5rem;
      font-family: var(--font-display);
    }
  `,
})
export class ContributorsPage {
  protected readonly contributors = SITE_DATA.contributors;
  protected readonly githubUrl = GITHUB_URL;

  constructor() {
    inject(Seo).apply({
      title: `Contributors - ${SITE_NAME}`,
      description:
        'The people who build ngpdf, the open source library that renders Angular components to PDF, and how to join them.',
      path: '/contributors',
    });
  }
}
