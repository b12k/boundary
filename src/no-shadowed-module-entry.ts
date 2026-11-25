import path from 'node:path';

import { checkIsFile, checkIsIndexFile, SCRIPT_EXTENSIONS } from './module-paths';
import { createRule } from './rule';

export const noShadowedModuleEntry = createRule(
  {
    docs: { description: 'Disallow sibling files that shadow a directory entry point.' },
    messages: { shadowedEntry: 'Rename "{{file}}" or "{{directory}}" so the directory entry point can be imported.' },
  },
  (context) => {
    if (context.filename !== context.physicalFilename || !checkIsIndexFile(context.filename)) return {};

    return {
      Program(program) {
        const directory = path.dirname(context.physicalFilename);
        const directoryName = path.basename(directory);
        const parent = path.dirname(directory);
        const extension = SCRIPT_EXTENSIONS.find((candidate) =>
          checkIsFile(path.join(parent, directoryName + candidate)),
        );
        if (extension) {
          context.report({
            data: { directory: directoryName, file: directoryName + extension },
            messageId: 'shadowedEntry',
            node: program,
          });
        }
      },
    };
  },
);
