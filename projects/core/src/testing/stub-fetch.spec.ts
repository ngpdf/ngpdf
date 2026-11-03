import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from './stub-fetch';

describe('stubFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends other binary data URLs to the stub', async () => {
    const stub = vi.fn(() => Promise.resolve(new Response('stubbed')));
    stubFetch(stub);
    const png = 'data:application/octet-stream;base64,iVBORw0KGgo=';
    await fetch(png);
    expect(stub).toHaveBeenCalledWith(png);
  });

  it('sends a WebAssembly data URL to the real fetch', async () => {
    const stub = vi.fn();
    stubFetch(stub);
    // "\0asm" and version 1: the start of Yoga's inlined module.
    const response = await fetch('data:application/octet-stream;base64,AGFzbQEAAAA=');
    expect(stub).not.toHaveBeenCalled();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]),
    );
  });
});
