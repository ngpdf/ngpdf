// pdfkit 0.20 ships these font metrics without types, and `@types/pdfkit` predates them. The writer
// only hands them to `registerStdFonts`, so their shape stays opaque here.
declare module 'pdfkit/standard-fonts/*' {
  const font: { readonly name: string };
  export default font;
}
