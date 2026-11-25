import { afterAll, beforeAll, describe, expect, it } from '@rstest/core';
import { Linter } from 'eslint';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import moduleBoundaries from '../src/index';

type RuleName = keyof typeof moduleBoundaries.rules;

const FILES = [
  'src/mixed/index.js',
  'src/mixed/index.ts',
  'src/orders/view.ts',
  'src/shadow.ts',
  'src/shadow/index.ts',
  'src/solo/index.ts',
  'src/solo/solo.ts',
  'src/users/index.ts',
  'src/users/permissions/check.ts',
  'src/users/permissions/index.ts',
  'src/users/profile/index.ts',
  'src/users/profile/view.ts',
  'src/users/service.ts',
  'src/valid/index.js',
  'src/valid/valid.css',
  'src/valid/valid.js',
  'src/valid/valid.test.js',
  'src/native/nested/index.js',
  'src/native/main.js',
  'src/native/main.mjs',
];

let root = '';

async function writeFixture(filename: string, contents: string) {
  const target = path.join(root, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'module-boundaries-'));

  await Promise.all([
    ...FILES.map((filename) => writeFixture(filename, '')),
    writeFixture('tsconfig.json', JSON.stringify({ extends: './tsconfig.base.json', include: ['src'] })),
    writeFixture(
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          moduleResolution: 'bundler',
          paths: { '@/*': ['./src/*'], '@service': ['./src/users/service.ts'], '@users': ['./src/users/index.ts'] },
        },
      }),
    ),
    writeFixture('src/native/package.json', JSON.stringify({ type: 'module' })),
    writeFixture('src/native/tsconfig.json', JSON.stringify({ compilerOptions: { moduleResolution: 'nodenext' } })),
  ]);
});

afterAll(async () => {
  if (root) await rm(root, { force: true, recursive: true });
});

function lint(rule: RuleName, filename: string, source: string) {
  const linter = new Linter({ cwd: root });
  const config: Linter.Config = {
    files: ['**/*.{js,ts,mjs}'],
    plugins: { 'module-boundaries': moduleBoundaries },
    rules: { [`module-boundaries/${rule}`]: 'error' },
  };
  const options = { filename: path.join(root, filename) };
  return linter.verify(source, config, options);
}

describe('module imports', () => {
  it.each([
    ['src/orders/view.ts', "import '../users';", []],
    ['src/orders/view.ts', "import '../users/index';", []],
    ['src/orders/view.ts', "import '@users';", []],
    ['src/orders/view.ts', "import '@service';", ['deepImport']],
    ['src/orders/view.ts', "export * from '@/users/permissions';", ['deepImport']],
    ['src/users/profile/view.ts', "import('../permissions/check');", ['deepImport']],
    ['src/users/profile/view.ts', "import '../permissions';", []],
    ['src/users/profile/view.ts', "import '../service';", []],
    ['src/users/profile/view.ts', "import './missing';", []],
  ])('checks the first boundary from %s for %s', (filename, source, expected) => {
    expect(lint('no-deep-imports', filename, source).map((message) => message.messageId)).toEqual(expected);
  });

  it.each([
    ["import './index';", ['internalBarrel']],
    ["import '@users';", ['internalBarrel']],
    ["export { value } from '..';", ['internalBarrel']],
    ["import '@service';", []],
    ["import '../permissions';", []],
  ])('checks imports to ancestor and local indices for %s', (source, expected) => {
    const messages = lint('no-internal-barrel-imports', 'src/users/profile/view.ts', source);
    expect(messages.map((message) => message.messageId)).toEqual(expected);
  });

  it.each([
    ["import '../users/index';", "'../users'"],
    ['export * from "@/users/index.js";', '"@/users"'],
    ["import('../users/index');", "'../users'"],
  ])('shortens %s without changing the target', (source, expected) => {
    const messages = lint('no-explicit-index', 'src/orders/view.ts', source);
    expect(messages.map((message) => message.fix?.text)).toEqual([expected]);
  });

  it('keeps an explicit index when the short form targets a sibling file', () => {
    expect(lint('no-explicit-index', 'src/orders/view.ts', "import '../shadow/index';")).toEqual([]);
  });

  it('keeps an explicit JavaScript index if the short form resolves to a TypeScript index', () => {
    expect(lint('no-explicit-index', 'src/orders/view.ts', "import '../mixed/index.js';")).toEqual([]);
  });

  it('keeps the explicit index in native ESM', () => {
    expect(lint('no-explicit-index', 'src/native/main.mjs', "import './nested/index.js';")).toEqual([]);
    expect(lint('no-explicit-index', 'src/native/main.js', "import './nested/index.js';")).toEqual([]);
  });

  it('uses aliases and resolution mode from a referenced config', async () => {
    const filename = 'projects/solution/app/src/orders/view.ts';
    await Promise.all([
      writeFixture(filename, ''),
      writeFixture('projects/solution/app/src/users/index.ts', ''),
      writeFixture('projects/solution/app/src/users/service.ts', ''),
      writeFixture('projects/solution/package.json', JSON.stringify({ type: 'module' })),
      writeFixture(
        'projects/solution/tsconfig.json',
        JSON.stringify({ files: [], references: [{ path: './app/tsconfig.build.json' }] }),
      ),
      writeFixture(
        'projects/solution/app/tsconfig.build.json',
        JSON.stringify({
          compilerOptions: { moduleResolution: 'bundler', paths: { '@app/*': ['./src/*'] } },
          include: ['src'],
        }),
      ),
    ]);

    expect(lint('no-deep-imports', filename, "import '@app/users/service';")).toHaveLength(1);
    const messages = lint('no-explicit-index', filename, "import '@app/users/index';");
    expect(messages.map((message) => message.fix?.text)).toEqual(["'@app/users'"]);
  });
});

it('loads the plugin in Oxlint and checks TypeScript re-exports and aliases across files', async () => {
  const projectRoot = process.cwd();
  const { resolve } = createRequire(path.join(projectRoot, 'package.json'));
  const cli = path.join(path.dirname(resolve('oxlint/package.json')), 'bin/oxlint');
  const plugin = path.join(projectRoot, 'src/index.ts');
  const loader = pathToFileURL(resolve('tsx')).href;
  const rules = Object.fromEntries(
    Object.keys(moduleBoundaries.rules).map((rule) => [`module-boundaries/${rule}`, 'error']),
  );
  await Promise.all([
    writeFixture('src/oxlint/consumer.ts', "import '@/oxlint/a/model';\nimport '@/oxlint/a/index';\n"),
    writeFixture(
      'src/oxlint/a/index.ts',
      "export type * from './model';\nexport * as models from './model';\nexport type * from '@/oxlint/a/types';\n",
    ),
    writeFixture('src/oxlint/a/model.ts', 'export type Model = string;\n'),
    writeFixture('src/oxlint/a/types/detail.ts', 'export type Detail = string;\n'),
    writeFixture('src/oxlint/a/types/index.ts', "export type { Detail } from './detail';\n"),
    writeFixture(
      '.oxlintrc.json',
      JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [{ name: 'module-boundaries', specifier: plugin }],
        rules,
      }),
    ),
  ]);

  const run = promisify(execFile);
  const { stdout } = await run(process.execPath, ['--import', loader, cli, '--format', 'json', 'src/oxlint'], {
    cwd: root,
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

  const diagnostics = Array.from(
    stdout.matchAll(/"code":\s*"module-boundaries\((?<rule>[^)]+)\)"/gu),
    (match) => match.groups?.['rule'],
  );
  expect(diagnostics).toHaveLength(3);
  expect(diagnostics).toEqual(expect.arrayContaining(['no-deep-imports', 'no-explicit-index', 'no-export-star']));
});

describe('barrels', () => {
  it('requires direct re-exports and ignores comments', () => {
    expect(
      lint('barrel-reexports-only', 'src/users/index.ts', "// public API\nexport { getUser } from './service';"),
    ).toEqual([]);

    const messages = lint(
      'barrel-reexports-only',
      'src/users/index.ts',
      "import './service'; export const answer = 42;",
    );
    expect(messages.map((message) => message.messageId)).toEqual(['reexportsOnly', 'reexportsOnly']);
  });

  it('reports a wildcard only in an index', () => {
    const source = "export * from './service'; export * as permissions from './permissions';";
    expect(lint('no-export-star', 'src/users/index.ts', source)).toHaveLength(1);
    expect(lint('no-export-star', 'src/users/service.ts', source)).toEqual([]);
  });

  it.each(['./permissions', './permissions/index.ts', '@/users/permissions'])(
    'allows a wildcard re-export from another module index via %s',
    (specifier) => {
      expect(lint('no-export-star', 'src/users/index.ts', `export * from '${specifier}';`)).toEqual([]);
    },
  );

  it.each(['./index', '@users', '@service', './missing'])(
    'reports a wildcard re-export that does not lead to another module index via %s',
    (specifier) => {
      const messages = lint('no-export-star', 'src/users/index.ts', `export * from '${specifier}';`);
      expect(messages.map((message) => message.messageId)).toEqual(['exportStar']);
    },
  );

  it('keeps relative and aliased re-exports inside the barrel directory', () => {
    const filename = 'src/users/profile/index.ts';
    const source = "export { getUser } from '../service'; export { check } from '@/users/permissions';";
    expect(lint('no-parent-reexports', filename, source)).toHaveLength(2);
    expect(lint('no-parent-reexports', filename, "export { view } from './view';")).toEqual([]);
  });

  it('detects an index shadowed by a sibling even without imports', () => {
    expect(lint('no-shadowed-module-entry', 'src/shadow/index.ts', '')).toHaveLength(1);
    expect(lint('no-shadowed-module-entry', 'src/users/index.ts', '')).toEqual([]);
  });

  it('flags a sole same-name forwarding file and allows supporting files', () => {
    expect(lint('no-useless-barrel', 'src/solo/index.ts', "export { feature } from './solo';")).toHaveLength(1);
    expect(lint('no-useless-barrel', 'src/solo/index.ts', 'export const feature = 42;')).toEqual([]);
    expect(lint('no-useless-barrel', 'src/valid/index.js', "export * from './valid.js';")).toEqual([]);
  });
});
