import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach } from 'vitest';

// Zoneless TestBed for component specs. Node-environment specs never touch it.
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

// Angular tears TestBed down after each test only when `afterEach` is a global, and Vitest's
// globals are off here. Without this, fixtures and the test injector live on into later tests.
afterEach(() => {
  getTestBed().resetTestingModule();
});

// jsdom has no web streams, which every browser ngpdf supports has; the writer inflates PNG data
// with them. Node's are the same API.
if (typeof globalThis.DecompressionStream === 'undefined') {
  const streams = await import('node:stream/web');
  Object.assign(globalThis, {
    ReadableStream: streams.ReadableStream,
    DecompressionStream: streams.DecompressionStream,
  });
}
