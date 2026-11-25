import { checkIsIndexFile, checkIsWithin, getModulePaths } from './module-paths';
import { createRule, visitReexports } from './rule';

export const noParentReexports = createRule(
  {
    docs: { description: 'Keep local re-exports inside the index directory.' },
    messages: { parentReexport: 'Re-export from a file inside this index directory.' },
  },
  (context) => {
    if (!checkIsIndexFile(context.filename)) return {};

    const paths = getModulePaths(context);
    if (!paths) return {};

    const { resolveTarget, sourceDirectory } = paths;
    return visitReexports(context, (_, { isRequire, source }) => {
      const target = resolveTarget(source.value, isRequire);
      if (target && !checkIsWithin(sourceDirectory, target)) {
        context.report({ messageId: 'parentReexport', node: source });
      }
    });
  },
);
