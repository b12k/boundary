import path from 'node:path';

import { listDotBoundaryFiles } from './boundary-files';
import { checkIsIndexFile } from './module-paths';
import { createRule } from './rule';

export const requireDotBoundary = createRule(
  {
    docs: { description: 'Require a .boundary config beside each module index.' },
    messages: { missingConfig: 'Add a .boundary config beside this module index.' },
  },
  (context) => {
    const { filename, physicalFilename } = context;
    if (filename !== physicalFilename || !path.isAbsolute(physicalFilename) || !checkIsIndexFile(filename)) return {};

    return {
      Program(node) {
        if (listDotBoundaryFiles(path.dirname(physicalFilename)).length === 0) {
          context.report({ messageId: 'missingConfig', node });
        }
      },
    };
  },
);
