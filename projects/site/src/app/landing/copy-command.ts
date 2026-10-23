import { Component, input, signal } from '@angular/core';

/** A shell command with a copy button. */
@Component({
  selector: 'site-copy-command',
  template: `
    <div class="command">
      <code><span class="prompt" aria-hidden="true">$</span> {{ command() }}</code>
      <button type="button" class="command-copy" (click)="copy()">
        {{ copied() ? 'Copied' : 'Copy' }}
        <span class="visually-hidden"> the install command</span>
      </button>
    </div>
  `,
})
export class CopyCommand {
  readonly command = input.required<string>();
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.command());
      this.copied.set(true);
      setTimeout(() => {
        this.copied.set(false);
      }, 1800);
    } catch {
      // Clipboard access can be refused; the command is still there to select by hand.
    }
  }
}
