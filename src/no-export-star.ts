import { checkIsIndexFile } from './module-paths';
import { createRule } from './rule';

export const noExportStar = createRule(
  {
    docs: { description: 'Require explicit public export names in index files.' },
    messages: { exportStar: 'List the public export names explicitly instead of re-exporting everything.' },
  },
  (context) => {
    if (!checkIsIndexFile(context.filename)) return {};

    return {
      ExportAllDeclaration(node) {
        if (!node.exported) context.report({ messageId: 'exportStar', node });
      },
    };
  },
);
