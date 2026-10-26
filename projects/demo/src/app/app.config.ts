import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { providePdfFonts } from '@ngpdf/core';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    // OFL subsets kept with the core tests; angular.json copies them to /fonts.
    providePdfFonts([
      { family: 'Noto Sans', src: 'fonts/noto-sans-regular.ttf' },
      { family: 'Noto Sans', src: 'fonts/noto-sans-bold.ttf', weight: 'bold' },
      { family: 'Noto Sans JP', src: 'fonts/noto-sans-jp-subset.ttf' },
    ]),
  ],
};
