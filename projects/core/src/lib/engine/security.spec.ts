import { describe, expect, it } from 'vitest';
import { securityOf } from './security';

const ALLOWED = {
  printing: 'high',
  copying: true,
  modifying: true,
  annotating: true,
  fillingForms: true,
  contentAccessibility: true,
  documentAssembly: true,
} as const;

describe('securityOf', () => {
  it.each([
    ['unset', undefined],
    ['empty', {}],
    ['an empty password', { userPassword: '', ownerPassword: '' }],
    ['no permission turned off', { permissions: ALLOWED }],
    ['empty permissions', { permissions: {} }],
  ])('has nothing to do with %s security', (_, value) => {
    expect(securityOf(value)).toBeUndefined();
  });

  it('fills the unset permissions with allowed', () => {
    expect(securityOf({ userPassword: 'open' })).toEqual({
      userPassword: 'open',
      permissions: ALLOWED,
    });
    expect(securityOf({ ownerPassword: 'lift' })).toEqual({
      ownerPassword: 'lift',
      permissions: ALLOWED,
    });
  });

  it.each([
    [{ printing: 'none' }],
    [{ printing: 'low' }],
    [{ copying: false }],
    [{ modifying: false }],
    [{ annotating: false }],
    [{ fillingForms: false }],
    [{ contentAccessibility: false }],
    [{ documentAssembly: false }],
  ])('encrypts when a permission is restricted: %o', (permissions) => {
    expect(securityOf({ permissions })).toEqual({ permissions: { ...ALLOWED, ...permissions } });
  });

  it('drops an empty password next to a real one', () => {
    expect(securityOf({ userPassword: '', ownerPassword: 'lift' })).toEqual({
      ownerPassword: 'lift',
      permissions: ALLOWED,
    });
  });

  it.each([
    [null, 'ngpdf: invalid security'],
    ['secret', 'ngpdf: invalid security'],
    [['secret'], 'ngpdf: invalid security'],
    [{ userPassword: 42 }, 'ngpdf: invalid security userPassword'],
    [{ ownerPassword: null }, 'ngpdf: invalid security ownerPassword'],
    [{ password: 'x' }, 'ngpdf: invalid security password'],
    [{ permissions: null }, 'ngpdf: invalid security permissions'],
    [{ permissions: 'none' }, 'ngpdf: invalid security permissions'],
    [{ permissions: { printing: 'medium' } }, 'ngpdf: invalid security permissions.printing'],
    [{ permissions: { printing: false } }, 'ngpdf: invalid security permissions.printing'],
    [{ permissions: { printing: null } }, 'ngpdf: invalid security permissions.printing'],
    [{ permissions: { copying: 'no' } }, 'ngpdf: invalid security permissions.copying'],
    [{ permissions: { modifying: 0 } }, 'ngpdf: invalid security permissions.modifying'],
    [{ permissions: { annotating: null } }, 'ngpdf: invalid security permissions.annotating'],
    [{ permissions: { fillingForms: 'x' } }, 'ngpdf: invalid security permissions.fillingForms'],
    [
      { permissions: { contentAccessibility: 1 } },
      'ngpdf: invalid security permissions.contentAccessibility',
    ],
    [
      { permissions: { documentAssembly: 'yes' } },
      'ngpdf: invalid security permissions.documentAssembly',
    ],
    [{ permissions: { print: false } }, 'ngpdf: invalid security permissions.print'],
  ])('rejects %o', (value, message) => {
    expect(() => securityOf(value)).toThrow(message);
  });

  it('takes passwords up to 127 bytes in UTF-8', () => {
    expect(securityOf({ userPassword: 'a'.repeat(127) })?.userPassword).toHaveLength(127);
    // 42 × 3 bytes.
    expect(securityOf({ ownerPassword: '€'.repeat(42) })?.ownerPassword).toHaveLength(42);
  });

  it.each([
    ['userPassword', 'a'.repeat(128)],
    ['ownerPassword', '€'.repeat(43)],
    // 12 bytes as typed, 132 once NFKC expands it, which is how the file stores it.
    ['userPassword', 'ﷺ'.repeat(4)],
  ])('rejects a %s longer than 127 bytes, without showing it', (field, password) => {
    let message = '';
    try {
      securityOf({ [field]: password });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(`ngpdf: invalid security ${field} (longer than 127 bytes in UTF-8)`);
  });
});
