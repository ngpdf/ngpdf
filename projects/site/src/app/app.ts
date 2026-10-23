import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { GITHUB_URL, NPM_URL, VERSION } from './site';
import { ThemeToggle } from './layout/theme-toggle';

@Component({
  selector: 'site-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './app.html',
  host: {
    '(document:keydown.escape)': 'closeMenuOnEscape()',
    '(document:click)': 'closeMenuOnOutsideClick($event)',
  },
})
export class App {
  protected readonly githubUrl = GITHUB_URL;
  protected readonly npmUrl = NPM_URL;
  protected readonly version = VERSION;
  protected readonly menuOpen = signal(false);
  protected readonly year = 2026;

  private readonly header = viewChild.required<ElementRef<HTMLElement>>('header');
  private readonly menuButton = viewChild.required<ElementRef<HTMLButtonElement>>('menuButton');

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.closeMenu();
      });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected closeMenuOnEscape(): void {
    if (!this.menuOpen()) return;
    this.closeMenu();
    this.menuButton().nativeElement.focus();
  }

  protected closeMenuOnOutsideClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    if (event.target instanceof Node && this.header().nativeElement.contains(event.target)) return;
    this.closeMenu();
  }

  /** Tabbing out of the open menu closes it; moving focus to the menu button leaves that to it. */
  protected closeMenuOnFocusLeave(event: FocusEvent, nav: HTMLElement): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node)) return;
    if (nav.contains(next) || next === this.menuButton().nativeElement) return;
    this.closeMenu();
  }
}
