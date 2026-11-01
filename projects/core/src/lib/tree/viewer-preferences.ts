/**
 * How a viewer opens the document: no panel, the bookmarks panel, the thumbnails panel, or full
 * screen.
 */
export type PageMode = 'UseNone' | 'UseOutlines' | 'UseThumbs' | 'FullScreen';

/** How a viewer lays out the pages when it opens the document. */
export type PageLayout =
  'SinglePage' | 'OneColumn' | 'TwoColumnLeft' | 'TwoColumnRight' | 'TwoPageLeft' | 'TwoPageRight';
