import { readdirSync } from 'node:fs';
import path from 'node:path';

import { checkIsDotBoundaryFile } from './boundary-files';
import { checkIsIndexFile } from './module-paths';
import { createRule } from './rule';

function checkIsEmptyModule(directory: string) {
  try {
    // oxlint-disable-next-line node/no-sync -- Linter visitors inspect module directories synchronously.
    const entries = readdirSync(directory, { withFileTypes: true });
    return (
      entries.some((entry) => !entry.isDirectory() && checkIsIndexFile(entry.name)) &&
      entries.every(
        (entry) => !entry.isDirectory() && (checkIsIndexFile(entry.name) || checkIsDotBoundaryFile(entry.name)),
      )
    );
  } catch {
    return false;
  }
}

export const noEmptyModule = createRule(
  {
    docs: { description: 'Disallow module directories that contain only their index files and boundary config.' },
    messages: { emptyModule: 'Add module content or replace this directory with a standalone file.' },
  },
  (context) => {
    const { filename, physicalFilename } = context;
    if (filename !== physicalFilename || !path.isAbsolute(physicalFilename) || !checkIsIndexFile(filename)) return {};

    return {
      Program(node) {
        if (checkIsEmptyModule(path.dirname(physicalFilename))) {
          context.report({ messageId: 'emptyModule', node });
        }
      },
    };
  },
);
