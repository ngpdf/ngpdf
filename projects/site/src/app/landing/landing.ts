import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_DATA } from '../../generated/site-data';
import { Seo } from '../seo';
import {
  DEFAULT_DESCRIPTION,
  GITHUB_URL,
  NPM_URL,
  PACKAGE_NAME,
  SITE_NAME,
  SITE_URL,
  TAGLINE,
  VERSION,
} from '../site';
import { CodeSheet } from './code-sheet';
import { CopyCommand } from './copy-command';
import { LiveDemo } from './live-demo';
import { HERO_TEMPLATE, RENDER_SNIPPET } from './snippets';

const FEATURES = [
  {
    title: 'It is just Angular',
    text: 'Signals, inputs, pipes, dependency injection, @for and @if all work, because a document is an ordinary component rendered by Angular itself.',
  },
  {
    title: 'Tables that paginate',
    text: 'Declare columns once in points, percentages or fr. Rows never split across pages, and header rows repeat on every page the table reaches.',
  },
  {
    title: 'Real, selectable text',
    text: 'Text is drawn as text, not as a screenshot, so it stays sharp at any zoom, can be searched and copied, and keeps files small.',
  },
  {
    title: 'A 2 KB first load',
    text: 'Importing @ngpdf/core adds about 2 KB gzipped to your initial bundle. The layout and PDF engine loads on the first render.',
  },
  {
    title: 'Images that fit',
    text: 'PNG and JPEG from a URL, a data URL, a Blob or an ArrayBuffer, with object-fit contain or cover.',
  },
  {
    title: 'Safe by construction',
    text: 'No PDF JavaScript, actions or embedded files are ever written, parsers run in linear time, and the same input gives the same bytes.',
  },
] as const;

const STEPS = [
  { name: 'Your component', detail: 'pdf-* elements in a normal template' },
  { name: 'Node tree', detail: 'a custom Angular renderer builds it' },
  { name: 'Layout', detail: 'flexbox with Yoga' },
  { name: 'Pages', detail: 'units placed, headers repeated' },
  { name: 'PDF', detail: 'written by pdfkit, in the browser' },
] as const;

@Component({
  selector: 'site-landing',
  imports: [RouterLink, CodeSheet, CopyCommand, LiveDemo],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly installCommand = `npm install ${PACKAGE_NAME}`;
  protected readonly heroTemplate = HERO_TEMPLATE;
  protected readonly renderSnippet = RENDER_SNIPPET;
  protected readonly features = FEATURES;
  protected readonly steps = STEPS;
  protected readonly contributors = SITE_DATA.contributors;
  protected readonly version = VERSION;
  protected readonly githubUrl = GITHUB_URL;
  protected readonly npmUrl = NPM_URL;

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
