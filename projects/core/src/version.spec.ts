import { readFileSync } from 'node:fs';
import { Version } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { VERSION } from './public-api';

// Relative to the repository root, where vitest runs.
const packageVersion = (
  JSON.parse(new TextDecoder().decode(readFileSync('projects/core/package.json'))) as {
    version: string;
  }
).version;

describe('VERSION', () => {
  it('is an Angular Version with the version of projects/core/package.json', () => {
    // Fails when the version was bumped without `npm run changeset:version`, which rewrites it.
    expect(VERSION).toBeInstanceOf(Version);
    expect(VERSION.full).toBe(packageVersion);
    const [major, minor, ...patch] = packageVersion.split('.');
    expect([VERSION.major, VERSION.minor, VERSION.patch]).toEqual([major, minor, patch.join('.')]);
  });
});
