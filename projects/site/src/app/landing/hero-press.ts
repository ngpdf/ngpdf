import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';

interface Line {
  readonly item: string;
  readonly qty: number;
  readonly amount: string;
}

const PAGE_ONE: readonly Line[] = [
  { item: 'Annual report layout', qty: 1, amount: '$1,200.00' },
  { item: 'Brand guidelines review', qty: 2, amount: '$340.00' },
  { item: 'Quarterly statements', qty: 3, amount: '$510.00' },
  { item: 'Data table typesetting', qty: 4, amount: '$604.00' },
  { item: 'Accessibility audit', qty: 1, amount: '$188.00' },
  { item: 'Logo vector cleanup', qty: 2, amount: '$450.00' },
  { item: 'Cover illustration', qty: 1, amount: '$786.00' },
  { item: 'Translation proofreading', qty: 4, amount: '$1,196.00' },
];

const PAGE_TWO: readonly Line[] = [
  { item: 'Print-ready export', qty: 1, amount: '$76.00' },
  { item: 'Support retainer', qty: 2, amount: '$226.00' },
  { item: 'Index and contents', qty: 1, amount: '$150.00' },
  { item: 'Proof corrections', qty: 3, amount: '$270.00' },
];

/**
 * The story the hero plays, one step at a time: the first page arrives and is set line by line,
 * it fills up, the next page takes its place with the table header repeated, and the total lands.
 * Each entry is how long to hold that step, in milliseconds.
 */
const STEPS = [
  700, // 0: the first page drops into place
  450, // 1: letterhead
  350, // 2: billing box
  350, // 3: table header
  ...PAGE_ONE.map(() => 210), // 4..11: page one rows
  700, // 12: "Page 1 of 2"
  1100, // 13: page one moves back, page two comes forward, its header already there
  ...PAGE_TWO.map(() => 230), // 14..17: page two rows
  450, // 18: total
  2600, // 19: "Page 2 of 2", and a pause to look at it
  700, // 20: both pages fade before the next run
];
const LAST = STEPS.length - 1;
const ROWS_ONE_AT = 4;
const TURN_AT = 13;
const ROWS_TWO_AT = 14;
const TOTAL_AT = ROWS_TWO_AT + PAGE_TWO.length;
const FINISHED_AT = TOTAL_AT + 1;

/**
 * The hero's document, drawn in HTML and moved in 3D with CSS. The prerendered page shows the
 * finished state (page two in front), so there is something to see before scripts run; in the
 * browser it replays the story while the hero is on screen. Under reduced motion it stays still.
 */
@Component({
  selector: 'site-hero-press',
  templateUrl: './hero-press.html',
  styleUrl: './hero-press.css',
  host: {
    'aria-hidden': 'true',
    '[class.turned]': 'step() >= turnAt',
    '[class.fading]': 'step() === last',
    '[style.--tilt-x.deg]': 'tiltX()',
    '[style.--tilt-y.deg]': 'tiltY()',
    '(pointermove)': 'tilt($event)',
    '(pointerleave)': 'resetTilt()',
  },
})
export class HeroPress {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageOne = PAGE_ONE;
  protected readonly pageTwo = PAGE_TWO;
  protected readonly turnAt = TURN_AT;
  protected readonly last = LAST;
  protected readonly rowsOneAt = ROWS_ONE_AT;
  protected readonly rowsTwoAt = ROWS_TWO_AT;
  protected readonly totalAt = TOTAL_AT;
  protected readonly finishedAt = FINISHED_AT;

  /** The finished state until the browser takes over. */
  protected readonly step = signal(FINISHED_AT);
  protected readonly tiltX = signal(0);
  protected readonly tiltY = signal(0);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private inView = false;
  private canTilt = false;

  constructor() {
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (!view || view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.canTilt = view.matchMedia('(pointer: fine)').matches;
      // Plays only while the hero is on screen and the tab is visible; costs nothing otherwise.
      const observer = new IntersectionObserver(([entry]) => {
        this.inView = entry?.isIntersecting ?? false;
        this.update();
      });
      observer.observe(this.host.nativeElement);
      const onVisibility = (): void => {
        this.update();
      };
      this.document.addEventListener('visibilitychange', onVisibility);
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        this.document.removeEventListener('visibilitychange', onVisibility);
        this.pause();
      });
    });
  }

  protected shown(at: number): boolean {
    return this.step() >= at;
  }

  protected tilt(event: PointerEvent): void {
    if (!this.canTilt) return;
    const box = this.host.nativeElement.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    this.tiltY.set(Math.round(x * 12));
    this.tiltX.set(Math.round(-y * 8));
  }

  protected resetTilt(): void {
    this.tiltX.set(0);
    this.tiltY.set(0);
  }

  private update(): void {
    if (this.inView && !this.document.hidden) this.play();
    else this.pause();
  }

  private play(): void {
    if (this.running) return;
    this.running = true;
    this.step.set(0);
    this.schedule();
  }

  private pause(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.step.set(FINISHED_AT);
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.step.update((step) => (step >= LAST ? 0 : step + 1));
      this.schedule();
    }, STEPS[this.step()] ?? 500);
  }
}
