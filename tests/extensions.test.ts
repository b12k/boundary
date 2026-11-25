import { afterAll, beforeAll, describe, expect, it } from '@rstest/core';

import { createFixture } from './fixture';

const EXTENSIONS = ['ts', 'js', 'mjs', 'cjs', 'tsx', 'jsx'];
const { cleanup, lint, start, writeFixture } = createFixture();

beforeAll(async () => {
  await start();
  await Promise.all([
    writeFixture('tsconfig.json', JSON.stringify({ compilerOptions: { moduleResolution: 'bundler' } })),
    writeFixture('src/native/tsconfig.json', JSON.stringify({ compilerOptions: { moduleResolution: 'nodenext' } })),
    writeFixture('src/native/main.cjs', ''),
    writeFixture('src/native/common/index.cjs', ''),
    writeFixture('src/native/nested/index.js', ''),
  ]);
});

afterAll(cleanup);

describe('supported extensions', () => {
  it.each(EXTENSIONS)('checks module imports and index rules in .%s', async (extension) => {
    const project = `src/extensions/${extension}`;
    const index = `index.${extension}`;
    const implementation = `implementation.${extension}`;
    const caller = `${project}/caller.${extension}`;
    const feature = `${project}/feature/${index}`;
    const shadowed = `${project}/shadow/${index}`;
    const solo = `${project}/solo/${index}`;
    const isCommonJs = extension === 'cjs';
    const files = [
      caller,
      feature,
      shadowed,
      solo,
      `${project}/feature/${implementation}`,
      `${project}/feature/child/${index}`,
      `${project}/shadow.${extension}`,
      `${project}/solo/solo.${extension}`,
    ];
    await Promise.all(files.map((filename) => writeFixture(filename, '')));

    function importFrom(specifier: string) {
      return isCommonJs ? `require('${specifier}');` : `import '${specifier}';`;
    }

    function reexportFrom(specifier: string) {
      return isCommonJs ? `module.exports = require('${specifier}');` : `export * from '${specifier}';`;
    }

    const imports = `${importFrom(`./feature/${implementation}`)} ${extension.endsWith('x') ? '<div />;' : ''}`;
    expect(lint('no-deep-imports', caller, imports).map((message) => message.messageId)).toEqual(['deepImport']);
    expect(lint('no-deep-imports', caller, importFrom(`./feature/${index}`))).toEqual([]);
    expect(lint('no-internal-barrel-imports', feature, importFrom(`./${index}`))).toHaveLength(1);
    const fixes = lint('no-explicit-index', caller, importFrom(`./feature/${index}`)).map(
      (message) => message.fix?.text,
    );
    expect(fixes).toEqual(["'./feature'"]);
    expect(lint('barrel-reexports-only', feature, reexportFrom(`./child/${index}`))).toEqual([]);
    expect(lint('barrel-reexports-only', feature, 'runSetup();')).toHaveLength(1);
    expect(lint('no-export-star', feature, reexportFrom(`./child/${index}`))).toEqual([]);
    expect(lint('no-export-star', feature, reexportFrom(`./${implementation}`))).toHaveLength(1);
    expect(lint('no-parent-reexports', feature, reexportFrom(`../caller.${extension}`))).toHaveLength(1);
    expect(lint('no-shadowed-module-entry', shadowed, '')).toHaveLength(1);
    expect(lint('no-useless-barrel', solo, reexportFrom(`./solo.${extension}`))).toHaveLength(1);
  });

  it('checks the actual Node target before shortening a CommonJS require', () => {
    const caller = 'src/native/main.cjs';
    expect(lint('no-explicit-index', caller, "require('./common/index.cjs');")).toEqual([]);
    expect(lint('no-explicit-index', caller, "import('./nested/index.js');")).toEqual([]);
    const messages = lint('no-explicit-index', caller, "require('./nested/index.js');");
    expect(messages.map((message) => message.fix?.text)).toEqual(["'./nested'"]);
  });

  it('accepts direct named CommonJS re-exports and ignores shadowed require calls', () => {
    const barrel = 'src/extensions/cjs/feature/index.cjs';
    const source = "exports.read = require('./implementation.cjs').read;";
    expect(lint('barrel-reexports-only', barrel, source)).toEqual([]);
    expect(lint('no-export-star', barrel, source)).toEqual([]);

    const shadowed = "function load(require) { return require('./feature/implementation.cjs'); }";
    expect(lint('no-deep-imports', 'src/extensions/cjs/caller.cjs', shadowed)).toEqual([]);
  });
});
