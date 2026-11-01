import {
  SchematicsException,
  apply,
  applyTemplates,
  chain,
  mergeWith,
  move,
  url,
  type Rule,
} from '@angular-devkit/schematics';
import {
  readWorkspace,
  type ProjectDefinition,
  type WorkspaceDefinition,
} from '@schematics/angular/utility';
import { posix } from 'node:path';
import { addDemoRoute } from './demo-route';
import type { Schema } from './schema';

/**
 * `ng add @ngpdf/core`: the CLI has installed the package; this adds an example document to an
 * application, and with `demoRoute` a page that downloads it. ngpdf needs no providers, so it
 * leaves `main.ts` and the app config alone, and it never overwrites a file.
 */
export function ngAdd(options: Schema): Rule {
  return async (tree) => {
    const project = pickApplication(await readWorkspace(tree), options.project);
    const sourceRoot = project.sourceRoot ?? posix.join(project.root, 'src');
    const folder = normalize(options.path ?? posix.join(sourceRoot, 'app/documents'));
    const prefix = project.prefix ?? 'app';

    const rules = [template('document', folder, 'example-document.ts', prefix)];
    if (options.demoRoute) {
      rules.push(
        template('demo', folder, 'pdf-demo.ts', prefix),
        addDemoRoute(
          posix.join(sourceRoot, 'app/app.routes.ts'),
          posix.join(folder, 'pdf-demo.ts'),
        ),
      );
    }
    return chain(rules);
  };
}

/** The named project, or the workspace's only application. */
function pickApplication(workspace: WorkspaceDefinition, name: string | undefined) {
  if (name !== undefined) {
    const project = workspace.projects.get(name);
    if (!project) throw new SchematicsException(`ngpdf: the workspace has no project "${name}".`);
    if (!isApplication(project)) {
      throw new SchematicsException(
        `ngpdf: "${name}" is a library. ng add @ngpdf/core adds an example to an application: ` +
          'pass --project <application>.',
      );
    }
    return project;
  }
  const applications = [...workspace.projects].filter(([, project]) => isApplication(project));
  const [only, ...others] = applications;
  if (only && others.length === 0) return only[1];
  if (only) {
    throw new SchematicsException(
      `ngpdf: the workspace has several applications (${applications.map(([key]) => key).join(', ')}). ` +
        'Run ng add again with --project <name>.',
    );
  }
  throw new SchematicsException('ngpdf: the workspace has no application to add an example to.');
}

function isApplication(project: ProjectDefinition): boolean {
  return project.extensions['projectType'] === 'application';
}

/** `--path` from the workspace root, without a leading `./` or `/`. */
function normalize(path: string): string {
  return posix.normalize(path.replace(/\\/g, '/')).replace(/^\/+/, '');
}

/** Copies `files/<name>` into `folder`, unless `fileName` is already there. */
function template(name: string, folder: string, fileName: string, prefix: string): Rule {
  return (tree, context) => {
    const target = posix.join(folder, fileName);
    if (tree.exists(target)) {
      context.logger.warn(`ngpdf: ${target} already exists, skipped.`);
      return;
    }
    return mergeWith(apply(url(`./files/${name}`), [applyTemplates({ prefix }), move(folder)]));
  };
}
