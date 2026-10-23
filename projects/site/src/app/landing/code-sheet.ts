import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { highlight } from '../markdown';

/** A highlighted source snippet with a file name tab, as the landing page shows code. */
@Component({
  selector: 'site-code-sheet',
  template: `
    <figure class="code-sheet">
      @if (fileName()) {
        <figcaption class="code-sheet-tab">{{ fileName() }}</figcaption>
      }
      <pre><code class="hljs" [innerHTML]="html()"></code></pre>
    </figure>
  `,
})
export class CodeSheet {
  private readonly sanitizer = inject(DomSanitizer);

  readonly code = input.required<string>();
  readonly language = input<string>('ts');
  readonly fileName = input<string>();

  // The snippets are constants in this repository, so the highlighted HTML is trusted.
  protected readonly html = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(highlight(this.code(), this.language())),
  );
}
