/* oxlint-disable node/no-sync -- Linter visitors read module directories synchronously. */
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { checkIsFile, checkIsIndexFile, getModulePaths, SCRIPT_EXTENSIONS } from './module-paths';
import { createRule, getReexport } from './rule';

function findSameNamedFile(directory: string) {
  let entries: Array<string>;
  try {
    entries = readdirSync(directory);
  } catch {
    entries = [];
  }

  const directoryName = path.basename(directory);
  const entry =
    entries.length === 2
      ? entries.find((filename) => {
          const extension = path.extname(filename);
          return SCRIPT_EXTENSIONS.includes(extension) && path.basename(filename, extension) === directoryName;
        })
      : undefined;
  const target = entry && path.join(directory, entry);
  return target && checkIsFile(target) ? target : undefined;
}

export const noUselessBarrel = createRule(
  {
    docs: { description: 'Flag an index that only forwards to its sole same-name sibling file.' },
    messages: { uselessBarrel: 'Collapse this directory into a single "{{file}}" file.' },
  },
  (context) => {
    if (!checkIsIndexFile(context.filename)) return {};

    const paths = getModulePaths(context);
    if (!paths) return {};

    return {
      Program(program) {
        if (program.body.length === 0) return;

        const sibling = findSameNamedFile(paths.sourceDirectory);
        if (!sibling || path.relative(paths.filename, sibling) === '') return;

        const isForwarding = program.body.every((node) => {
          const reexport = getReexport(context, node);
          if (!reexport) return false;

          const target = paths.resolveTarget(reexport.source.value, reexport.isRequire);
          return target !== undefined && path.relative(target, sibling) === '';
        });
        if (isForwarding) {
          context.report({ data: { file: path.basename(sibling) }, messageId: 'uselessBarrel', node: program });
        }
      },
    };
  },
);
