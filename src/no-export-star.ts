import path from 'node:path';

import { checkIsIndexFile, getModulePaths } from './module-paths';
import { createRule } from './rule';

export const noExportStar = createRule(
  {
    docs: { description: 'Allow wildcard re-exports in an index only from another module index.' },
    messages: { exportStar: 'List the public export names explicitly or re-export from another module index.' },
  },
  (context) => {
    if (!checkIsIndexFile(context.filename)) return {};

    return {
      ExportAllDeclaration(node) {
        if (node.exported) return;

        const paths = getModulePaths(context);
        const specifier = node.source.value;
        if (paths && typeof specifier === 'string') {
          const target = paths.resolveTarget(specifier);
          if (target && checkIsIndexFile(target) && path.relative(paths.sourceDirectory, path.dirname(target)) !== '') {
            return;
          }
        }

        context.report({ messageId: 'exportStar', node });
      },
    };
  },
);
