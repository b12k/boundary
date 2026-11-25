import { afterAll, beforeAll, describe, expect, it } from '@rstest/core';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { defineBoundary } from '../src/index';
import { createFixture } from './fixture';

const FILES = [
  'src/analytics/index.ts',
  'src/shared/index.ts',
  'src/users/index.ts',
  'src/users/controller/index.ts',
  'src/users/controller/actions/index.ts',
  'src/users/controller/actions/data.ts',
  'src/users/controller/actions/load.ts',
  'src/users/events/index.ts',
  'src/users/repository/index.ts',
  'src/users/service/index.ts',
  'src/users/service/api/index.ts',
  'src/users/service/internal/index.ts',
];
const USERS_CONFIG = `export default defineBoundary({
  imports: { allow: ['@/shared'] },
  layers: ['repository', ['service', 'events'], 'controller'],
  hierarchy: { controller: ['service'] },
});`;
const ROOT_CONFIG = "export default defineBoundary({ hierarchy: { analytics: ['shared'] } });";
const { cleanup, getRoot, lint, start, writeFixture } = createFixture();

beforeAll(async () => {
  await start();
  await Promise.all([
    ...FILES.map((filename) => writeFixture(filename, '')),
    writeFixture('src/index.ts', ''),
    writeFixture('src/.boundary.ts', ROOT_CONFIG),
    writeFixture('src/users/.boundary.ts', USERS_CONFIG),
    writeFixture('src/users/service/.boundary.js', "export default defineBoundary({ layers: ['internal', 'api'] });"),
    writeFixture('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } })),
  ]);
});

afterAll(cleanup);

describe('dependency policies', () => {
  it.each([
    ["import '../../service';", ''],
    ["export { findUser } from '../../repository';", 'hierarchy'],
    ["await import('@/users/repository');", 'hierarchy'],
    ["require('../../repository');", 'hierarchy'],
    ["import '../../../analytics';", 'imports.allow'],
    ["import '@/shared';", ''],
    ["import './data';", ''],
    ["import './missing';", ''],
  ])('checks %s from a nested module', (source, policy) => {
    const messages = lint('use-dot-boundary', 'src/users/controller/actions/load.ts', source);
    if (policy) {
      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain(policy);
      expect(messages[0]?.messageId).toBe('blockedDependency');
    } else {
      expect(messages).toEqual([]);
    }
  });

  it('compares sibling modules at their own depth', () => {
    const outer = lint('use-dot-boundary', 'src/users/service/index.ts', "import '../events';");
    expect(outer[0]?.message).toContain('layers forbids');
    const inner = lint('use-dot-boundary', 'src/users/service/internal/index.ts', "import '../api';");
    expect(inner[0]?.message).toContain(path.join('src', 'users', 'service', '.boundary.js'));
    expect(lint('use-dot-boundary', 'src/users/service/api/index.ts', "import '../internal';")).toEqual([]);
  });

  it('checks top-level siblings with a project root config and no root index', async () => {
    await writeFixture('top/index.ts', '');
    await writeFixture('other/index.ts', '');
    const config = "export default defineBoundary({ layers: ['top', 'other'] });";
    await writeFixture('.boundary.mjs', config);
    expect(lint('use-dot-boundary', '.boundary.mjs', config)).toEqual([]);
    const messages = lint('use-dot-boundary', 'top/index.ts', "import '../other';");
    expect(messages[0]?.message).toContain('layers forbids');
  });

  it('accepts the nearest config scope and applies deny only to listed dependencies', async () => {
    await Promise.all([
      writeFixture('src/sandbox/index.ts', ''),
      writeFixture(
        'src/sandbox/.boundary.cjs',
        "module.exports = defineBoundary({ imports: { deny: ['../shared'] } });",
      ),
    ]);
    const messages = lint('use-dot-boundary', 'src/sandbox/index.ts', "import '../shared';");
    expect(messages[0]?.message).toContain('imports.deny');
    expect(lint('use-dot-boundary', 'src/sandbox/index.ts', "import '../analytics';")).toEqual([]);
  });
});

describe('boundary config files', () => {
  it.each(['ts', 'js', 'mjs', 'cjs', 'tsx', 'jsx'])('loads a .boundary.%s config', async (extension) => {
    const module = `src/config-${extension}`;
    const index = `${module}/index.${extension}`;
    const filename = `${module}/.boundary.${extension}`;
    const exportPrefix = extension === 'cjs' ? 'module.exports =' : 'export default';
    const config = `${exportPrefix} defineBoundary({ imports: { allow: [] } });`;
    await Promise.all([writeFixture(index, ''), writeFixture(filename, config)]);
    expect(lint('use-dot-boundary', filename, config)).toEqual([]);
    expect(lint('require-dot-boundary', index, '')).toEqual([]);
    const load = extension === 'cjs' ? "require('../shared/index.ts');" : "import '../shared';";
    const messages = lint('use-dot-boundary', index, load);
    expect(messages[0]?.messageId).toBe('blockedDependency');
    expect(messages[0]?.message).toContain(`.boundary.${extension}`);
  });

  it('reports missing configs on the module index', () => {
    const messages = lint('require-dot-boundary', 'src/users/controller/index.ts', '');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe('missingConfig');
    expect(messages[0]?.line).toBe(1);
    expect(lint('require-dot-boundary', 'src/users/controller/actions/load.ts', '')).toEqual([]);
  });

  it('reports a parent policy conflict on the disallowed allow entry', () => {
    const config = "export default defineBoundary({\n  imports: { allow: ['../repository'] },\n});";
    const messages = lint('use-dot-boundary', 'src/users/controller/.boundary.ts', config);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain('hierarchy does not allow');
    expect(messages[0]?.line).toBe(2);
    expect(messages[0]?.column).toBe(22);
  });

  it('reports non-literal values, nested layer names and conflicting policies', () => {
    const filename = 'src/users/.boundary.ts';
    const config = `export default defineBoundary({
      imports: { allow: ['../shared'], deny: ['../analytics'] },
      layers: ['repository', 'controller/actions', 'service', 'repository'],
      hierarchy: { repository: ['service'], events: modules },
    });`;
    const messages = lint('use-dot-boundary', filename, config).map((message) => message.message);
    expect(messages).toHaveLength(5);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exactly one'),
        expect.stringContaining('controller/actions'),
        expect.stringContaining('one layer'),
        expect.stringContaining('forbidden by layers'),
        expect.stringContaining('array of module paths'),
      ]),
    );
  });

  it('reports duplicate config files and unresolved references', async () => {
    const filename = 'src/duplicates/.boundary.ts';
    const config = "export default defineBoundary({ imports: { allow: ['../missing'] } });";
    await Promise.all([
      writeFixture('src/duplicates/index.ts', ''),
      writeFixture(filename, config),
      writeFixture('src/duplicates/.boundary.js', 'export default defineBoundary({});'),
    ]);
    const messages = lint('use-dot-boundary', filename, config);
    expect(messages.map((message) => message.message)).toEqual([
      expect.stringContaining('Also found .boundary.js'),
      expect.stringContaining('../missing'),
    ]);
    expect(lint('use-dot-boundary', 'src/duplicates/index.ts', "import '../shared';")[0]?.message).toContain(
      'Multiple .boundary files',
    );
  });

  it('reads the config statically and exposes a typed defineBoundary helper', async () => {
    const config = { imports: { allow: [] } };
    expect(defineBoundary(config)).toBe(config);
    await Promise.all([
      writeFixture('src/static/index.ts', ''),
      writeFixture(
        'src/static/.boundary.ts',
        "throw new Error('Executing this config is a bug'); export default defineBoundary({ imports: { allow: [] } });",
      ),
    ]);
    const messages = lint('use-dot-boundary', 'src/static/index.ts', "import '../shared';");
    expect(messages[0]?.message).toContain('imports.allow');
  });
});

it('reports config and dependency violations in Oxlint', async () => {
  const project = process.cwd();
  const { resolve } = createRequire(path.join(project, 'package.json'));
  const cli = path.join(path.dirname(resolve('oxlint/package.json')), 'bin/oxlint');
  const loader = pathToFileURL(resolve('tsx')).href;
  const plugin = path.join(project, 'src/index.ts');
  await Promise.all([
    writeFixture('src/oxlint/configured/index.ts', "export { feature } from '../unconfigured';"),
    writeFixture('src/oxlint/configured/.boundary.ts', 'export default defineBoundary({ imports: { allow: [] } });'),
    writeFixture('src/oxlint/invalid/index.ts', ''),
    writeFixture('src/oxlint/invalid/.boundary.ts', 'export default defineBoundary({ imports: { allow: 7 } });'),
    writeFixture('src/oxlint/unconfigured/index.ts', ''),
    writeFixture(
      '.oxlintrc.json',
      JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [plugin],
        rules: { 'boundary/require-dot-boundary': 'error', 'boundary/use-dot-boundary': 'error' },
      }),
    ),
  ]);

  const run = promisify(execFile);
  const { stdout } = await run(process.execPath, ['--import', loader, cli, '--format', 'json', 'src/oxlint'], {
    cwd: getRoot(),
  }).catch((error: unknown) => {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 1 ||
      !('stdout' in error) ||
      typeof error.stdout !== 'string'
    ) {
      throw error;
    }
    return { stdout: error.stdout };
  });

  expect(stdout).toContain('imports.allow forbids this dependency');
  expect(stdout).toContain('Expected an array of module paths');
  expect(stdout).toContain('Add a .boundary config beside this module index');
});
