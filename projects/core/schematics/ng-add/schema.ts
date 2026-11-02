/** Options of `ng add @ngpdf/core`, as in schema.json. */
export interface Schema {
  /** The application to add the example document to. */
  project?: string;
  /** The folder for the example files, from the workspace root. */
  path?: string;
  /** Also add a demo page and its route. */
  demoRoute?: boolean;
}
