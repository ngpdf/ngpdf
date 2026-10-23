// Markdown files are bundled as plain text by the `.md` loader in angular.json.
declare module '*.md' {
  const text: string;
  export default text;
}
