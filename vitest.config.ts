import angular from '@analogjs/vite-plugin-angular';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles Angular components in specs; plain TypeScript specs pass through untouched.
  plugins: [angular({ tsconfig: 'projects/core/tsconfig.spec.json' })],
  resolve: {
    alias: [
      // The viewer entry point imports the primary one by its package name, as ng-packagr needs.
      {
        find: /^@ngpdf\/core$/,
        replacement: fileURLToPath(new URL('./projects/core/src/public-api.ts', import.meta.url)),
      },
      // Under Node, `pdfkit` resolves to its Node build. Specs run the browser build that apps ship.
      {
        find: /^pdfkit$/,
        replacement: fileURLToPath(
          new URL('./node_modules/pdfkit/js/pdfkit.browser.mjs', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '.stryker-tmp/**'],
    setupFiles: ['projects/core/src/testing/setup.ts'],
    include: [
      'projects/core/src/**/*.spec.ts',
      'projects/core/viewer/**/*.spec.ts',
      'projects/core/schematics/**/*.spec.ts',
      'scripts/**/*.spec.mjs',
    ],
    coverage: {
      provider: 'v8',
      include: ['projects/core/src/lib/**/*.ts', 'projects/core/viewer/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.bench.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov'],
      // Per-folder gates from docs/ENGINEERING.md.
      thresholds: {
        'projects/core/src/lib/engine/**': { lines: 95, branches: 90 },
        'projects/core/src/lib/tree/**': { lines: 90 },
        'projects/core/src/lib/elements/**': { lines: 90 },
        'projects/core/src/lib/render/**': { lines: 90 },
        'projects/core/viewer/**': { lines: 90 },
      },
    },
  },
});
