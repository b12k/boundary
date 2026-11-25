import type { ExportAllDeclaration, ExportNamedDeclaration } from 'estree';

import { checkIsIndexFile, checkIsWithin, getModulePaths } from './module-paths';
import { createRule } from './rule';

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
    function handleReexport(node: ExportAllDeclaration | ExportNamedDeclaration) {
      const { source } = node;
      if (typeof source?.value !== 'string') return;

      const target = resolveTarget(source.value);
      if (target && !checkIsWithin(sourceDirectory, target)) {
        context.report({ messageId: 'parentReexport', node: source });
      }
    }

    return { ExportAllDeclaration: handleReexport, ExportNamedDeclaration: handleReexport };
  },
);
