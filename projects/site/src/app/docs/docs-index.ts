// Every documentation page, in reading order. The Markdown is bundled as text (the `.md` loader in
// angular.json); adding a page means adding its import and its entry in SOURCES.
import componentsInDocuments from '../../content/docs/components-in-documents.md';
import contributing from '../../content/docs/contributing.md';
import documentsAndPages from '../../content/docs/documents-and-pages.md';
import elements from '../../content/docs/elements.md';
import gettingStarted from '../../content/docs/getting-started.md';
import howItWorks from '../../content/docs/how-it-works.md';
import images from '../../content/docs/images.md';
import layoutAndStyling from '../../content/docs/layout-and-styling.md';
import linesAndShapes from '../../content/docs/lines-and-shapes.md';
import limitationsAndRoadmap from '../../content/docs/limitations-and-roadmap.md';
import pagination from '../../content/docs/pagination.md';
import renderingApi from '../../content/docs/rendering-api.md';
import security from '../../content/docs/security.md';
import serverRendering from '../../content/docs/server-rendering.md';
import styleProperties from '../../content/docs/style-properties.md';
import tables from '../../content/docs/tables.md';
import textAndFonts from '../../content/docs/text-and-fonts.md';
import { parseFrontMatter, type FrontMatter } from '../markdown';

const SOURCES: Readonly<Record<string, string>> = {
  'getting-started': gettingStarted,
  'documents-and-pages': documentsAndPages,
  'layout-and-styling': layoutAndStyling,
  'text-and-fonts': textAndFonts,
  tables,
  pagination,
  images,
  'lines-and-shapes': linesAndShapes,
  'components-in-documents': componentsInDocuments,
  'server-rendering': serverRendering,
  elements,
  'rendering-api': renderingApi,
  'style-properties': styleProperties,
  'how-it-works': howItWorks,
  security,
  'limitations-and-roadmap': limitationsAndRoadmap,
  contributing,
};

export const SECTIONS = ['Guide', 'Reference', 'Project'] as const;

export interface DocPage extends FrontMatter {
  readonly slug: string;
  readonly body: string;
}

export const DOC_PAGES: readonly DocPage[] = Object.entries(SOURCES)
  .map(([slug, source]) => {
    const { data, body } = parseFrontMatter(source);
    return { slug, body, ...data };
  })
  .sort(
    (a, b) =>
      SECTIONS.indexOf(a.section as (typeof SECTIONS)[number]) -
        SECTIONS.indexOf(b.section as (typeof SECTIONS)[number]) || a.order - b.order,
  );

export function docBySlug(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

export function docsInSection(section: string): readonly DocPage[] {
  return DOC_PAGES.filter((page) => page.section === section);
}
