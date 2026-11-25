import path from 'node:path';

import { checkIsIndexFile, getModulePaths } from './module-paths';
import { createRule, visitReexports } from './rule';

export const noExportStar = createRule(
  {
    docs: { description: 'Control wildcard re-exports from module indices.' },
    messages: {
      exportStar: 'List the public export names explicitly or re-export from another module index.',
      strictExportStar: 'List the public export names explicitly.',
    },
    schema: [{ additionalProperties: false, properties: { allowFromBarrels: { type: 'boolean' } }, type: 'object' }],
  },
  (context) => {
    if (!checkIsIndexFile(context.filename)) return {};

    const options: Array<unknown> = context.options;
    const [option] = options;
    const allowFromBarrels = !(
      option &&
      typeof option === 'object' &&
      'allowFromBarrels' in option &&
      option.allowFromBarrels === false
    );

    return visitReexports(context, (node, { isRequire, isWildcard, source }) => {
      if (!isWildcard) return;

      const paths = allowFromBarrels ? getModulePaths(context) : undefined;
      if (paths) {
        const target = paths.resolveTarget(source.value, isRequire);
        if (target && checkIsIndexFile(target) && path.relative(paths.sourceDirectory, path.dirname(target)) !== '') {
          return;
        }
      }

      context.report({ messageId: allowFromBarrels ? 'exportStar' : 'strictExportStar', node });
    });
  },
);
