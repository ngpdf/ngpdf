/**
 * Encryption and permissions of the written file, set on `pdf-document`. Every permission defaults
 * to allowed; turn one off with `false`, or printing with `'none'`.
 */
export interface PdfSecurity {
  /** Asked for when the file is opened. Without it the content cannot be decrypted. */
  readonly userPassword?: string;
  /** Lifts the permissions. A random one is used when permissions are restricted without it. */
  readonly ownerPassword?: string;
  readonly permissions?: {
    /** `'high'` (the default), `'low'` for a degraded print only, or `'none'`. */
    readonly printing?: 'none' | 'low' | 'high';
    readonly copying?: boolean;
    readonly modifying?: boolean;
    readonly annotating?: boolean;
    readonly fillingForms?: boolean;
    readonly contentAccessibility?: boolean;
    readonly documentAssembly?: boolean;
  };
}
