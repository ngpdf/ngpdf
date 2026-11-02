import eslint from '@eslint/js';
import angular from 'angular-eslint';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import regexp from 'eslint-plugin-regexp';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const lib = 'projects/core/src/lib';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', '.angular/', 'out-tsc/', 'node_modules/', '.superpowers/'] },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      ...angular.configs.tsRecommended,
      regexp.configs['flat/recommended'],
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts', 'vitest.stryker.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'pdf', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'pdf', style: 'kebab-case' },
      ],
      'regexp/no-super-linear-backtracking': 'error',
      // Angular components and directives are often decorated empty classes.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    // The demo is an app, not the library: its selectors use `app`.
    files: ['projects/demo/**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    // The site (ngpdf.dev) is an app too: its selectors use `site`.
    files: ['projects/site/**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'site', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'site', style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
  },
  {
    // Architecture: docs/ARCHITECTURE.md "Dependency direction".
    files: [`${lib}/**/*.ts`],
    plugins: { boundaries },
    settings: {
      'boundaries/dependency-nodes': ['import', 'export', 'dynamic-import'],
      // Resolves extensionless relative imports to files, so the rules can classify them.
      'import/resolver': { typescript: { project: 'projects/core/tsconfig.lib.json' } },
      'boundaries/elements': [
        { type: 'tree', pattern: `${lib}/tree/**` },
        { type: 'elements', pattern: `${lib}/elements/**` },
        { type: 'render', pattern: `${lib}/render/**` },
        { type: 'engine', pattern: `${lib}/engine/**` },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            // tree is the base layer; elements build on it; render builds on both.
            {
              from: { element: { type: 'tree' } },
              disallow: { to: { element: { type: ['elements', 'render', 'engine'] } } },
            },
            {
              from: { element: { type: 'elements' } },
              disallow: { to: { element: { type: ['render', 'engine'] } } },
            },
            // The engine reads tree types only; render reaches it through import() alone.
            {
              from: { element: { type: 'engine' } },
              disallow: { to: { element: { type: ['elements', 'render'] } } },
            },
            {
              from: { element: { type: 'render' } },
              disallow: {
                to: { element: { type: 'engine' } },
                dependency: { nodeKind: ['import', 'export'] },
              },
            },
          ],
        },
      ],
      'boundaries/no-unknown': 'off',
    },
  },
  {
    // pdfkit and Yoga stay behind the engine's two entry files.
    files: [`${lib}/**/*.ts`],
    ignores: [`${lib}/engine/writer.ts`, `${lib}/engine/index.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pdfkit', 'pdfkit/*', 'yoga-layout', 'yoga-layout/*'],
              // Types are erased; only runtime imports would pull the library into a bundle.
              allowTypeImports: true,
              message: 'Only engine/writer.ts and engine/index.ts import pdfkit and yoga-layout.',
            },
          ],
        },
      ],
      // The rule above does not see import(): a lazy pdfkit or Yoga load stays in the two files.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/pdfkit|yoga-layout/]',
          message: 'Only engine/writer.ts and engine/index.ts import pdfkit and yoga-layout.',
        },
      ],
    },
  },
  {
    // @angular/common is not a peer dependency: the published library must not import it.
    files: [`${lib}/**/*.ts`],
    ignores: [`${lib}/**/*.spec.ts`, `${lib}/engine/writer.ts`, `${lib}/engine/index.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pdfkit', 'pdfkit/*', 'yoga-layout', 'yoga-layout/*'],
              allowTypeImports: true,
              message: 'Only engine/writer.ts and engine/index.ts import pdfkit and yoga-layout.',
            },
            {
              group: ['@angular/common', '@angular/common/*'],
              message: '@ngpdf/core peers on @angular/core only.',
            },
          ],
        },
      ],
    },
  },
  {
    // The viewer and the server are entry points of their own: ng-packagr builds them apart from
    // @ngpdf/core, so they reach the primary entry point by its package name only.
    files: ['projects/core/viewer/**/*.ts', 'projects/core/server/**/*.ts'],
    ignores: ['projects/core/viewer/**/*.spec.ts', 'projects/core/server/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../src', '../src/*', '../src/**'],
              message: "Import from '@ngpdf/core', not from its sources.",
            },
            {
              group: ['@angular/common', '@angular/common/*'],
              message: '@ngpdf/core peers on @angular/core and @angular/platform-browser only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // Scripts the site serves as they are, and the image script's page callbacks, run in a browser.
    files: ['projects/site/public/**/*.js', 'scripts/site-images.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.spec.ts', '**/*.bench.ts'],
    rules: {
      // Specs poke at internals and use non-null assertions on fixtures.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Fixtures load Yoga and pdfkit to build real layouts.
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
);
