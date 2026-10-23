import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GITHUB_URL, NPM_URL, VERSION } from './site';
import { ThemeToggle } from './layout/theme-toggle';

@Component({
  selector: 'site-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './app.html',
})
export class App {
  protected readonly githubUrl = GITHUB_URL;
  protected readonly npmUrl = NPM_URL;
  protected readonly version = VERSION;
  protected readonly menuOpen = signal(false);
  protected readonly year = 2026;

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
