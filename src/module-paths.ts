/* oxlint-disable node/no-sync -- Linter visitors resolve files synchronously. */
import type { Rule } from 'eslint';
import type { TsConfigResult } from 'get-tsconfig';
import type { NapiResolveOptions } from 'oxc-resolver';

import { createFilesMatcher, getTsconfig } from 'get-tsconfig';
import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { ResolverFactory } from 'oxc-resolver';

const SCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const MODULE_EXTENSIONS = SCRIPT_EXTENSIONS.filter((extension) => extension !== '.mts' && extension !== '.cts');
const INDEX_FILES = MODULE_EXTENSIONS.map((extension) => `index${extension}`);

function checkIsDependency(filename: string) {
  return filename.split(path.sep).includes('node_modules');
}

function checkIsFile(filename: string) {
  try {
    return statSync(filename, { throwIfNoEntry: false })?.isFile() ?? false;
  } catch {
    return false;
  }
}

function checkHasIndex(directory: string) {
  return INDEX_FILES.some((indexFile) => checkIsFile(path.join(directory, indexFile)));
}

function checkIsIndexFile(filename: string) {
  return INDEX_FILES.includes(path.basename(filename));
}

function checkIsWithin(directory: string, filename: string) {
  const relativePath = path.relative(directory, filename);
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

function findTsconfig(directory: string, name?: string) {
  let tsconfig: ReturnType<typeof getTsconfig> | undefined;
  try {
    tsconfig = getTsconfig(directory, name);
  } catch {
    // Keep checking relative paths when the TSConfig cannot be read.
  }
  return tsconfig;
}

function findReferencedTsconfig(
  tsconfig: TsConfigResult,
  filename: string,
  visited: Set<string>,
): TsConfigResult | undefined {
  const configDirectory = path.dirname(tsconfig.path);
  let match: TsConfigResult | undefined;

  for (const reference of tsconfig.config.references ?? []) {
    const target = path.resolve(configDirectory, reference.path);
    const configFile = checkIsFile(target) ? target : path.join(target, 'tsconfig.json');
    if (!visited.has(configFile) && checkIsFile(configFile)) {
      visited.add(configFile);
      const referenced = findTsconfig(path.dirname(configFile), path.basename(configFile));
      if (referenced) {
        const nested = findReferencedTsconfig(referenced, filename, visited);
        match = nested ?? (createFilesMatcher(referenced)(filename) ? referenced : undefined);
        if (match) break;
      }
    }
  }
  return match;
}

function createModulePaths(filename: string, projectRoot: string) {
  const sourceDirectory = path.dirname(filename);
  const nearest = findTsconfig(sourceDirectory);
  const tsconfig =
    nearest && (findReferencedTsconfig(nearest, filename, new Set([path.normalize(nearest.path)])) ?? nearest);
  const resolverOptions: NapiResolveOptions = {
    builtinModules: true,
    conditionNames: ['import', 'node', 'default'],
    extensionAlias: {
      '.cjs': ['.cjs', '.cts'],
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
      '.mjs': ['.mjs', '.mts'],
    },
    extensions: [...SCRIPT_EXTENSIONS, '.json', '.node'],
    moduleType: true,
    tsconfig: tsconfig ? { configFile: tsconfig.path, references: 'auto' } : 'auto',
  };
  const resolver = new ResolverFactory(resolverOptions);
  let requireResolver: ResolverFactory | undefined;
  const targetsBySpecifier = new Map<string, string | undefined>();
  const moduleStatusByDirectory = new Map<string, boolean>();

  function resolveTarget(specifier: string, isRequire = false) {
    const request = isRequire ? `require:${specifier}` : `import:${specifier}`;
    if (targetsBySpecifier.has(request)) return targetsBySpecifier.get(request);

    const moduleResolver = isRequire
      ? (requireResolver ??= resolver.cloneWithOptions({
          ...resolverOptions,
          conditionNames: ['require', 'node', 'default'],
        }))
      : resolver;
    const result = moduleResolver.resolveFileSync(filename, specifier);
    const target =
      result.path && path.isAbsolute(result.path) && !checkIsDependency(result.path) ? result.path : undefined;
    targetsBySpecifier.set(request, target);
    return target;
  }

  function findEntryBoundary(target: string) {
    let directory = path.dirname(target);
    let boundary: string | undefined;
    while (checkIsWithin(projectRoot, directory) && !checkIsWithin(directory, sourceDirectory)) {
      const isModule = moduleStatusByDirectory.get(directory) ?? checkHasIndex(directory);
      moduleStatusByDirectory.set(directory, isModule);
      if (isModule) boundary = directory;
      directory = path.dirname(directory);
    }
    return boundary;
  }

  function checkIsEsm() {
    const selfSpecifier = `./${path.basename(filename)}`;
    return String(resolver.resolveFileSync(filename, selfSpecifier).moduleType) === 'module';
  }

  return {
    checkIsEsm,
    compilerOptions: tsconfig?.config.compilerOptions,
    filename,
    findEntryBoundary,
    projectRoot,
    resolveTarget,
    sourceDirectory,
  };
}

function resolvePhysicalPath(filename: string) {
  try {
    return realpathSync.native(filename);
  } catch {
    return filename;
  }
}

const pathsBySource = new WeakMap<Rule.RuleContext['sourceCode'], ReturnType<typeof createModulePaths>>();

function getModulePaths(context: Rule.RuleContext) {
  const cachedPaths = pathsBySource.get(context.sourceCode);
  if (cachedPaths) return cachedPaths;

  const { cwd, filename: lintFilename, physicalFilename, sourceCode } = context;
  if (lintFilename !== physicalFilename || !path.isAbsolute(physicalFilename)) return cachedPaths;

  const filename = resolvePhysicalPath(physicalFilename);
  const projectRoot = resolvePhysicalPath(cwd);
  if (checkIsDependency(filename) || !checkIsWithin(projectRoot, filename)) return cachedPaths;

  const modulePaths = createModulePaths(filename, projectRoot);
  pathsBySource.set(sourceCode, modulePaths);
  return modulePaths;
}

export {
  checkHasIndex,
  checkIsDependency,
  checkIsFile,
  checkIsIndexFile,
  checkIsWithin,
  createModulePaths,
  getModulePaths,
  MODULE_EXTENSIONS,
  resolvePhysicalPath,
  SCRIPT_EXTENSIONS,
};
