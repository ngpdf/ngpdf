// The package README (projects/core/README.md, the one npm shows) carries copies of the usage
// sections of the repository README. Fails when a copy is missing or differs, so they stay in
// sync. Runs in CI's lint job. Usage: node scripts/check-readme.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Root README sections copied into the package README, matched by the start of the heading. */
export const SYNCED_SECTIONS = ['Install', 'Example', 'Limits'];

/** `## ` sections as [heading, trimmed body] pairs, in order. */
function sectionsOf(markdown) {
  const sections = [];
  let current = null;
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('```')) inFence = !inFence;
    if (!inFence && line.startsWith('## ')) {
      current = { heading: line.slice(3).trim(), lines: [] };
      sections.push(current);
    } else if (!inFence && line.startsWith('# ')) {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections.map(({ heading, lines }) => [heading, lines.join('\n').trim()]);
}

export function checkReadme(root, core) {
  const problems = [];
  const rootSections = sectionsOf(root);
  const coreSections = new Map(sectionsOf(core));
  for (const prefix of SYNCED_SECTIONS) {
    const found = rootSections.find(([heading]) => heading.startsWith(prefix));
    if (!found) {
      problems.push(`README.md has no section starting "## ${prefix}"`);
      continue;
    }
    const [heading, body] = found;
    const copy = coreSections.get(heading);
    if (copy === undefined) {
      problems.push(`projects/core/README.md has no "## ${heading}" section`);
    } else if (copy !== body) {
      problems.push(`projects/core/README.md "## ${heading}" differs from README.md`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkReadme(
    readFileSync('README.md', 'utf8'),
    readFileSync('projects/core/README.md', 'utf8'),
  );
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('projects/core/README.md: usage sections match README.md');
}
