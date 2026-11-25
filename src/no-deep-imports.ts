import path from 'node:path';

import { checkIsIndexFile, getModulePaths } from './module-paths';
import { createRule, visitSpecifiers } from './rule';

export const noDeepImports = createRule(
  {
    docs: { description: 'Require imports into a module to use the first public entry point they cross.' },
    messages: { deepImport: 'Import from the public entry point of "{{module}}" instead.' },
  },
  (context) => {
    const paths = getModulePaths(context);
    if (!paths) return {};

    return visitSpecifiers((source, specifier) => {
      const target = paths.resolveTarget(specifier);
      if (!target) return;

      const boundary = paths.findEntryBoundary(target);
      if (!boundary || (path.relative(boundary, path.dirname(target)) === '' && checkIsIndexFile(target))) return;

      context.report({ data: { module: path.basename(boundary) }, messageId: 'deepImport', node: source });
    });
  },
);
