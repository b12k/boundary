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

function findChildModule(directory: string, name: string) {
  const isChildName = name && name !== '.' && name !== '..' && !/[/\\]/u.test(name) && !path.isAbsolute(name);
  const child = isChildName && resolvePhysicalPath(path.join(directory, name));
  return child &&
    path.relative(directory, path.dirname(child)) === '' &&
    !checkIsDependency(child) &&
    checkHasIndex(child)
    ? child
    : undefined;
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

export { checkIsDotBoundaryFile, findChildModule, listDotBoundaryFiles, listModuleDirectories };
