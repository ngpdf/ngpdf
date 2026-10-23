// Renders the site's raster images from their HTML sources in projects/site/brand, with the
// host's Chrome (as scripts/e2e.mjs does): the 1200 x 630 social card, the home screen icon and
// the organisations' avatar.
// The PNGs are committed; run this again after changing a source.
// Usage: node scripts/site-images.mjs
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const IMAGES = [
  {
    source: 'projects/site/brand/og.html',
    output: 'projects/site/public/og.png',
    width: 1200,
    height: 630,
  },
  {
    source: 'projects/site/brand/icon.html',
    output: 'projects/site/public/apple-touch-icon.png',
    width: 180,
    height: 180,
  },
  {
    source: 'projects/site/brand/avatar.html',
    output: 'projects/site/brand/avatar.png',
    width: 512,
    height: 512,
  },
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--allow-file-access-from-files'],
});
try {
  for (const image of IMAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: image.width, height: image.height, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(resolve(image.source)).href, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: image.output, type: 'png' });
    console.log(`${image.output}: ${String(image.width)} x ${String(image.height)}`);
  }
} finally {
  await browser.close();
}
