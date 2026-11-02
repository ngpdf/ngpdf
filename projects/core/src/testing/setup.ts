import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

// Zoneless TestBed for component specs. Node-environment specs never touch it.
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

// jsdom has no web streams, which every browser ngpdf supports has; the writer inflates PNG data
// with them. Node's are the same API.
if (typeof globalThis.DecompressionStream === 'undefined') {
  const streams = await import('node:stream/web');
  Object.assign(globalThis, {
    ReadableStream: streams.ReadableStream,
    DecompressionStream: streams.DecompressionStream,
  });
}
