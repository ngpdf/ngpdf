// @vitest-environment jsdom
import {
  ApplicationRef,
  Component,
  EnvironmentInjector,
  createEnvironmentInjector,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pdfResource } from './pdf-resource';

const renders = vi.hoisted(() => ({
  calls: [] as { inputs: Record<string, unknown> | undefined }[],
  fail: false,
}));

// The resource is only plumbing around renderToBlob, which has its own specs.
vi.mock('./pdf-renderer', () => ({
  renderToBlob: (_component: unknown, options: { inputs?: Record<string, unknown> }) => {
    renders.calls.push({ inputs: options.inputs });
    if (renders.fail) return Promise.reject(new Error('ngpdf: render failed'));
    return Promise.resolve(new Blob([JSON.stringify(options.inputs ?? {})]));
  },
}));

@Component({ selector: 'pdf-test-document', template: '' })
class TestDocument {}

let urls = 0;
const revoked: string[] = [];

beforeEach(() => {
  renders.calls = [];
  renders.fail = false;
  urls = 0;
  revoked.length = 0;
  // jsdom has no object URLs.
  URL.createObjectURL = () => `blob:test/${String(++urls)}`;
  URL.revokeObjectURL = (url: string) => revoked.push(url);
});

const settle = () => TestBed.inject(ApplicationRef).whenStable();

function scope(): EnvironmentInjector {
  return createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
}

describe('pdfResource', () => {
  it('renders the document with its inputs and exposes the Blob and an object URL', async () => {
    const pdf = pdfResource(TestDocument, {
      inputs: () => ({ customer: 'ACME' }),
      injector: scope(),
    });
    expect(pdf.isLoading()).toBe(true);

    await settle();

    expect(pdf.status()).toBe('resolved');
    expect(renders.calls).toEqual([{ inputs: { customer: 'ACME' } }]);
    expect(await pdf.value()?.text()).toBe('{"customer":"ACME"}');
    expect(pdf.url()).toBe('blob:test/1');
  });

  it('renders with no inputs when none are given', async () => {
    const pdf = pdfResource(TestDocument, { injector: scope() });
    await settle();

    expect(pdf.status()).toBe('resolved');
    expect(renders.calls).toEqual([{ inputs: {} }]);
  });

  it('stays idle while inputs returns undefined', async () => {
    const ready = signal(false);
    const pdf = pdfResource(TestDocument, {
      inputs: () => (ready() ? { customer: 'ACME' } : undefined),
      injector: scope(),
    });
    await settle();

    expect(pdf.status()).toBe('idle');
    expect(pdf.url()).toBeUndefined();
    expect(renders.calls).toEqual([]);

    ready.set(true);
    await settle();
    expect(pdf.status()).toBe('resolved');
  });

  it('renders again when an input changes, and revokes the previous URL', async () => {
    const customer = signal('ACME');
    const pdf = pdfResource(TestDocument, {
      inputs: () => ({ customer: customer() }),
      injector: scope(),
    });
    await settle();
    expect(pdf.url()).toBe('blob:test/1');

    customer.set('Globex');
    await settle();

    expect(renders.calls.map((call) => call.inputs)).toEqual([
      { customer: 'ACME' },
      { customer: 'Globex' },
    ]);
    expect(pdf.url()).toBe('blob:test/2');
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('keeps the same URL for the current PDF while a newer render runs', async () => {
    const customer = signal('ACME');
    const pdf = pdfResource(TestDocument, {
      inputs: () => ({ customer: customer() }),
      debounce: 20,
      injector: scope(),
    });
    await settle();
    expect(pdf.url()).toBe('blob:test/1');

    customer.set('Globex');
    TestBed.tick();

    expect(pdf.isLoading()).toBe(true);
    expect(pdf.url()).toBe('blob:test/1');
    expect(revoked).toEqual([]);
    pdf.destroy();
  });

  it('renders once for a burst of changes inside the debounce window', async () => {
    const customer = signal('A');
    const pdf = pdfResource(TestDocument, {
      inputs: () => ({ customer: customer() }),
      debounce: 20,
      injector: scope(),
    });
    TestBed.tick();
    customer.set('B');
    TestBed.tick();
    customer.set('C');
    TestBed.tick();
    expect(renders.calls).toEqual([]);

    await settle();

    expect(renders.calls).toEqual([{ inputs: { customer: 'C' } }]);
    expect(pdf.status()).toBe('resolved');
  });

  it('reports a failed render as an error, with no URL', async () => {
    renders.fail = true;
    const pdf = pdfResource(TestDocument, { injector: scope() });
    await settle();

    expect(pdf.status()).toBe('error');
    expect(pdf.error()?.message).toBe('ngpdf: render failed');
    expect(pdf.url()).toBeUndefined();
  });

  it('renders again on reload', async () => {
    const pdf = pdfResource(TestDocument, { injector: scope() });
    await settle();
    expect(pdf.url()).toBe('blob:test/1');

    pdf.reload();
    await settle();

    expect(renders.calls).toHaveLength(2);
    expect(pdf.url()).toBe('blob:test/2');
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('revokes its URL when its injector is destroyed', async () => {
    const injector = scope();
    const pdf = pdfResource(TestDocument, { injector });
    await settle();
    expect(pdf.url()).toBe('blob:test/1');

    injector.destroy();

    expect(revoked).toEqual(['blob:test/1']);
    expect(pdf.status()).toBe('idle');
  });

  it('revokes its URL when destroyed by hand', async () => {
    const pdf = pdfResource(TestDocument, { injector: scope() });
    await settle();
    expect(pdf.url()).toBe('blob:test/1');

    pdf.destroy();

    expect(revoked).toEqual(['blob:test/1']);
    expect(pdf.url()).toBeUndefined();
  });

  it('works in an injection context without an injector option', async () => {
    const pdf = TestBed.runInInjectionContext(() => pdfResource(TestDocument));
    await settle();

    expect(pdf.status()).toBe('resolved');
  });

  it('throws outside an injection context when no injector is given', () => {
    expect(() => pdfResource(TestDocument)).toThrow(/injection context/);
  });
});
