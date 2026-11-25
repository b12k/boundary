import path from 'node:path';

import { checkIsIndexFile, checkIsWithin, getModulePaths } from './module-paths';
import { createRule, visitSpecifiers } from './rule';

export const noInternalBarrelImports = createRule(
  {
    docs: { description: 'Require direct imports within a module and into its ancestors.' },
    messages: { internalBarrel: 'Import the internal file directly instead of using your own or an ancestor index.' },
  },
  (context) => {
    const paths = getModulePaths(context);
    if (!paths) return {};

    return visitSpecifiers(context, (source, kind) => {
      const target = paths.resolveTarget(source.value, kind === 'require');
      if (target && checkIsIndexFile(target) && checkIsWithin(path.dirname(target), paths.filename)) {
        context.report({ messageId: 'internalBarrel', node: source });
      }
    });
  },
);
