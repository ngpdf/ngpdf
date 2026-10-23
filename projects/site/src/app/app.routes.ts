import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./landing/landing').then((m) => m.Landing) },
  {
    path: 'docs',
    loadComponent: () => import('./docs/docs-overview').then((m) => m.DocsOverview),
  },
  {
    path: 'docs/:slug',
    loadComponent: () => import('./docs/docs-page').then((m) => m.DocsPage),
  },
  {
    path: 'examples',
    loadComponent: () => import('./examples/examples-page').then((m) => m.ExamplesPage),
  },
  {
    path: 'contributors',
    loadComponent: () => import('./contributors/contributors-page').then((m) => m.ContributorsPage),
  },
  {
    path: 'changelog',
    loadComponent: () => import('./changelog/changelog-page').then((m) => m.ChangelogPage),
  },
  {
    path: '404',
    loadComponent: () => import('./not-found/not-found-page').then((m) => m.NotFoundPage),
  },
  { path: '**', redirectTo: '404' },
];
