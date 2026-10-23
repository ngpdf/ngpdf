import { describe, expect, it, vi } from 'vitest';
import { fontFor, toWinAnsi } from './fonts';

describe('fontFor', () => {
  it.each([
    ['Helvetica', 'normal', 'normal', 'Helvetica'],
    ['Helvetica', 'bold', 'normal', 'Helvetica-Bold'],
    ['Helvetica', 'normal', 'italic', 'Helvetica-Oblique'],
    ['Helvetica', 'bold', 'italic', 'Helvetica-BoldOblique'],
    ['Times', 'normal', 'normal', 'Times-Roman'],
    ['Times', 'bold', 'normal', 'Times-Bold'],
    ['Times', 'normal', 'italic', 'Times-Italic'],
    ['Times', 'bold', 'italic', 'Times-BoldItalic'],
    ['Courier', 'normal', 'normal', 'Courier'],
    ['Courier', 'bold', 'normal', 'Courier-Bold'],
    ['Courier', 'normal', 'italic', 'Courier-Oblique'],
    ['Courier', 'bold', 'italic', 'Courier-BoldOblique'],
  ] as const)('maps %s %s %s to %s', (fontFamily, fontWeight, fontStyle, expected) => {
    expect(fontFor({ fontFamily, fontWeight, fontStyle })).toBe(expected);
  });
});

describe('toWinAnsi', () => {
  it('replaces characters outside WinAnsi with ? and warns once with them', () => {
    const warn = vi.fn();
    expect(toWinAnsi('Olá € 😀 ő', warn)).toBe('Olá € ? ?');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(['😀', 'ő']);
  });

  it('does not warn when everything is supported', () => {
    const warn = vi.fn();
    expect(toWinAnsi('plain “quotes” — ÿ', warn)).toBe('plain “quotes” — ÿ');
    expect(warn).not.toHaveBeenCalled();
  });

  it('lists each unsupported character once and replaces CJK', () => {
    const warn = vi.fn();
    expect(toWinAnsi('漢ő漢', warn)).toBe('???');
    expect(warn).toHaveBeenCalledWith(['漢', 'ő']);
  });

  it('keeps tab and newline out of the replacement', () => {
    const warn = vi.fn();
    expect(toWinAnsi('a\tb\nc', warn)).toBe('a\tb\nc');
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns Unicode space separators into a space, without warning', () => {
    const warn = vi.fn();
    const spaces = '           ';
    expect(toWinAnsi(`a${spaces}b`, warn)).toBe(`a${' '.repeat(spaces.length)}b`);
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns the no-break spaces among them into U+00A0', () => {
    // Angular's en-US `date: 'short'` puts U+202F before AM/PM; fr `number` groups with it.
    const warn = vi.fn();
    expect(toWinAnsi('3:00 PM', warn)).toBe('3:00 PM');
    expect(toWinAnsi('1 234', warn)).toBe('1 234');
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops soft hyphens and zero-width spaces, which are never drawn', () => {
    const warn = vi.fn();
    expect(toWinAnsi('co­operation', warn)).toBe('cooperation');
    expect(toWinAnsi('long​path', warn)).toBe('longpath');
    expect(warn).not.toHaveBeenCalled();
  });
});
