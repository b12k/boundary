import { checkIsIndexFile } from './module-paths';
import { createRule, getReexport } from './rule';

export const barrelReexportsOnly = createRule(
  {
    docs: { description: 'Allow only direct re-exports in index files.' },
    messages: { reexportsOnly: 'Move this statement to another file and use a direct re-export from the index.' },
  },
  (context) => {
    if (!checkIsIndexFile(context.filename)) return {};

    return {
      Program(program) {
        for (const node of program.body) {
          if (!getReexport(context, node)) context.report({ messageId: 'reexportsOnly', node });
        }
      },
    };
  },
);
