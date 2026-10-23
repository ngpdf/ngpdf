import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_DATA } from '../../generated/site-data';
import { Seo } from '../seo';
import {
  DEFAULT_DESCRIPTION,
  GITHUB_URL,
  PACKAGE_NAME,
  SITE_NAME,
  SITE_URL,
  TAGLINE,
  VERSION,
} from '../site';
import { CodeSheet } from './code-sheet';
import { CopyCommand } from './copy-command';
import { HeroPress } from './hero-press';
import { LiveDemo } from './live-demo';
import { HERO_TEMPLATE, RENDER_SNIPPET } from './snippets';

const STEPS = [
  { name: 'Your component', detail: 'renders through a custom Angular renderer into a plain tree' },
  { name: 'Styles', detail: 'are resolved: units, colors, fonts, inheritance' },
  { name: 'Layout', detail: 'comes from Yoga, the flexbox engine behind React Native' },
  { name: 'Pages', detail: 'are cut between rows, with table headers repeated' },
  { name: 'The PDF', detail: 'is written by pdfkit, in the browser' },
] as const;

@Component({
  selector: 'site-landing',
  imports: [RouterLink, CodeSheet, CopyCommand, HeroPress, LiveDemo],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly installCommand = `npm install ${PACKAGE_NAME}`;
  protected readonly heroTemplate = HERO_TEMPLATE;
  protected readonly renderSnippet = RENDER_SNIPPET;
  protected readonly steps = STEPS;
  protected readonly contributors = SITE_DATA.contributors;
  protected readonly version = VERSION;
  protected readonly githubUrl = GITHUB_URL;

  constructor() {
    inject(Seo).apply({
      title: `${SITE_NAME} - ${TAGLINE}`,
      description: DEFAULT_DESCRIPTION,
      path: '/',
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        url: `${SITE_URL}/`,
        codeRepository: GITHUB_URL,
        programmingLanguage: 'TypeScript',
        runtimePlatform: 'Angular',
        license: 'https://opensource.org/licenses/MIT',
        version: VERSION,
        author: {
          '@type': 'Person',
          name: 'Gabriel Silva',
          url: 'https://github.com/GabeSilvaDev',
        },
      },
    });
  }
}
