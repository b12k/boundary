import path from 'node:path';

import { checkIsIndexFile, getModulePaths } from './module-paths';
import { createRule, visitReexports } from './rule';

export const noExportStar = createRule(
  {
    docs: { description: 'Allow wildcard re-exports in an index only from another module index.' },
    messages: { exportStar: 'List the public export names explicitly or re-export from another module index.' },
  },
  (context) => {
    if (!checkIsIndexFile(context.filename)) return {};

    return visitReexports(context, (node, { isRequire, isWildcard, source }) => {
      if (!isWildcard) return;

      const paths = getModulePaths(context);
      if (paths) {
        const target = paths.resolveTarget(source.value, isRequire);
        if (target && checkIsIndexFile(target) && path.relative(paths.sourceDirectory, path.dirname(target)) !== '') {
          return;
        }
      }

      context.report({ messageId: 'exportStar', node });
    });
  },
);
