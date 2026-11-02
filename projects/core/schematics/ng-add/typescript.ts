import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as TS from 'typescript';

/**
 * The app's own TypeScript, resolved from the folder `ng` runs in. Every Angular app has it as a
 * direct devDependency, so this finds it in any layout, where a plain `require('typescript')` from
 * @ngpdf/core misses it in a pnpm workspace without hoisting. Loaded only when a rule needs it.
 */
export function loadTypeScript(): typeof TS {
  const from = process.cwd();
  try {
    return createRequire(join(from, 'package.json'))('typescript') as typeof TS;
  } catch (error: unknown) {
    if ((error as { code?: unknown }).code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error(
      `ngpdf: --demo-route needs your app's typescript package, and none was found from ${from}.`,
      { cause: error },
    );
  }
}
