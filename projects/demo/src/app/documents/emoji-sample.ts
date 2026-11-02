import { Component } from '@angular/core';
import { PDF_ELEMENTS, type PdfEmojiSource } from '@ngpdf/core';

/**
 * A stand-in for an emoji image set such as Twemoji, so the demo needs no network: each emoji is a
 * small PNG drawn on a canvas, a disc in a colour picked from its code points.
 */
export const demoEmoji: PdfEmojiSource = (_emoji, codepoints) => {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  let hue = 0;
  for (const char of codepoints) hue = (hue * 31 + (char.codePointAt(0) ?? 0)) % 360;
  context.fillStyle = `hsl(${String(hue)} 70% 50%)`;
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
  context.fill();
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(size / 2, size / 2, size / 5, 0, 2 * Math.PI);
  context.fill();
  return canvas.toDataURL('image/png');
};

/** Emoji drawn as inline images: a ZWJ sequence, a skin tone, a flag, a keycap, and © as text. */
@Component({
  selector: 'app-emoji-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Emoji sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 12; line-height: 1.5">
        <pdf-text style="font-size: 20; font-weight: bold; margin-bottom: 12">
          Team news 🎉
        </pdf-text>
        <pdf-text>The Example family 👨‍👩‍👧‍👦 joined the club.</pdf-text>
        <pdf-text>
          Their entry was
          <pdf-span style="text-decoration: underline">approved 👍🏽 today</pdf-span>.
        </pdf-text>
        <pdf-text>The next match is in 🇧🇷 Brazil.</pdf-text>
        <pdf-text>Press #️⃣ on the phone menu to hear the results again.</pdf-text>
        <pdf-text style="margin-bottom: 12">© 2026 Example Club stays text.</pdf-text>
        <pdf-text style="font-size: 9; text-align: justify; max-lines: 2">
          Small print 👍🏽 in 9pt, justified: the emoji keep to the size of the text around them and
          move with the word gaps, and the second line is cut 🎉 with an ellipsis after the last
          word that fits 🇧🇷 here.
        </pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
export class EmojiSample {}
