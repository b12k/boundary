import { statSync } from 'node:fs';
import path from 'node:path';

import {
  checkHasIndex,
  checkIsDependency,
  checkIsFile,
  checkIsWithin,
  MODULE_EXTENSIONS,
  resolvePhysicalPath,
} from './module-paths';

const CONFIG_FILES = MODULE_EXTENSIONS.map((extension) => `.boundary${extension}`);

function checkIsDotBoundaryFile(filename: string) {
  return CONFIG_FILES.includes(path.basename(filename));
}

function findChildEntry(directory: string, name: string): string | undefined {
  const isChildName = name && name !== '.' && name !== '..' && !/[/\\]/u.test(name) && !path.isAbsolute(name);
  if (!isChildName) return undefined;

  const child = resolvePhysicalPath(path.join(directory, name));
  if (path.relative(directory, path.dirname(child)) !== '' || checkIsDependency(child)) return undefined;

  try {
    // oxlint-disable-next-line node/no-sync -- Boundary configs are read by synchronous rule visitors.
    const entry = statSync(child, { throwIfNoEntry: false });
    return entry?.isFile() || entry?.isDirectory() ? child : undefined;
  } catch {
    return undefined;
  }
}

function listDotBoundaryFiles(directory: string) {
  return CONFIG_FILES.map((filename) => path.join(directory, filename)).filter((filename) => checkIsFile(filename));
}

function listModuleDirectories(directory: string, projectRoot: string) {
  const modules: Array<string> = [];

  for (let current = directory; checkIsWithin(projectRoot, current); current = path.dirname(current)) {
    if (checkHasIndex(current)) modules.push(current);
    if (path.relative(projectRoot, current) === '') break;
  }

  return modules;
}

export { checkIsDotBoundaryFile, findChildEntry, listDotBoundaryFiles, listModuleDirectories };
