import { restricts, type DocumentSecurity } from './writer';

type Permissions = DocumentSecurity['permissions'];

const PRINTING = ['none', 'low', 'high'] as const satisfies readonly Permissions['printing'][];
const FLAGS = [
  'copying',
  'modifying',
  'annotating',
  'fillingForms',
  'contentAccessibility',
  'documentAssembly',
] as const satisfies readonly Exclude<keyof Permissions, 'printing'>[];

// AES-256 PDF passwords stop at 127 bytes; a longer one would be cut without a word.
const MAX_PASSWORD_BYTES = 127;

const invalid = (field?: string, why?: string): Error =>
  new Error(
    `ngpdf: invalid security${field === undefined ? '' : ` ${field}`}${why === undefined ? '' : ` (${why})`}`,
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/** A non-empty password, or undefined. The message never shows the password. */
function passwordOf(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid(field);
  // The file stores the NFKC form, which can be longer than what was typed.
  if (Math.max(utf8Length(value), utf8Length(value.normalize('NFKC'))) > MAX_PASSWORD_BYTES) {
    throw invalid(field, `longer than ${String(MAX_PASSWORD_BYTES)} bytes in UTF-8`);
  }
  return value === '' ? undefined : value;
}

function permissionsOf(value: unknown): Permissions {
  if (value === undefined) value = {};
  if (!isRecord(value)) throw invalid('permissions');
  for (const key of Object.keys(value)) {
    if (key !== 'printing' && !(FLAGS as readonly string[]).includes(key)) {
      throw invalid(`permissions.${key}`);
    }
  }
  const printing = value['printing'] === undefined ? 'high' : value['printing'];
  if (!(PRINTING as readonly unknown[]).includes(printing)) throw invalid('permissions.printing');
  const flags: Partial<Record<(typeof FLAGS)[number], boolean>> = {};
  for (const flag of FLAGS) {
    const allowed = value[flag] === undefined ? true : value[flag];
    if (typeof allowed !== 'boolean') throw invalid(`permissions.${flag}`);
    flags[flag] = allowed;
  }
  return { printing, ...flags } as Permissions;
}

/**
 * Checks the `security` of `pdf-document` and fills in the permissions it leaves unset. Returns
 * undefined when it sets no password and restricts nothing, so the file is written unencrypted.
 */
export function securityOf(value: unknown): DocumentSecurity | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalid();
  for (const key of Object.keys(value)) {
    if (key !== 'userPassword' && key !== 'ownerPassword' && key !== 'permissions') {
      throw invalid(key);
    }
  }
  const userPassword = passwordOf(value['userPassword'], 'userPassword');
  const ownerPassword = passwordOf(value['ownerPassword'], 'ownerPassword');
  const permissions = permissionsOf(value['permissions']);
  if (userPassword === undefined && ownerPassword === undefined && !restricts(permissions)) {
    return undefined;
  }
  return {
    ...(userPassword !== undefined && { userPassword }),
    ...(ownerPassword !== undefined && { ownerPassword }),
    permissions,
  };
}
