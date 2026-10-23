import { Component, DOCUMENT, afterNextRender, inject, signal } from '@angular/core';

const STORAGE_KEY = 'ngpdf-theme';

/**
 * Switches between the light and dark grounds. The choice is kept in localStorage; the inline
 * script in index.html applies it before the first paint, and this reads it back once the
 * browser takes over, so the prerendered button never disagrees with the page.
 */
@Component({
  selector: 'site-theme-toggle',
  template: `
    <button
      type="button"
      class="theme-toggle"
      [attr.aria-pressed]="dark()"
      (click)="toggle()"
      [title]="dark() ? 'Use the light theme' : 'Use the dark theme'"
    >
      <span class="visually-hidden">Dark theme</span>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        @if (dark()) {
          <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2" />
          <path
            d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        } @else {
          <path
            d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
        }
      </svg>
    </button>
  `,
})
export class ThemeToggle {
  private readonly document = inject(DOCUMENT);
  protected readonly dark = signal(false);

  constructor() {
    afterNextRender(() => {
      this.dark.set(this.document.documentElement.dataset['theme'] === 'dark');
    });
  }

  protected toggle(): void {
    const dark = !this.dark();
    this.dark.set(dark);
    this.document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Private windows can refuse storage; the theme still applies to this page.
    }
  }
}
