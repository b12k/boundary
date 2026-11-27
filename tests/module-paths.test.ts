import type { Rule } from 'eslint';

import { afterEach, beforeEach, expect, it } from '@rstest/core';
import path from 'node:path';

import { getModulePaths, resolvePhysicalPath } from '../src/module-paths';
import { createFixture } from './fixture';

const { cleanup, getRoot, start, writeFixture } = createFixture();

beforeEach(start);
afterEach(cleanup);

it('resolves paths per file when the linter reuses its source code object', async () => {
  await Promise.all([writeFixture('first/feature/index.ts', ''), writeFixture('second/feature/index.ts', '')]);
  const cwd = resolvePhysicalPath(getRoot());
  const position = { column: 0, line: 1 };
  let ast: Rule.RuleContext['sourceCode']['ast'] = {
    body: [],
    comments: [],
    loc: { end: position, start: position },
    range: [0, 0],
    sourceType: 'module',
    tokens: [],
    type: 'Program',
  };
  const sourceCode = {
    get ast() {
      return ast;
    },
  };

  function getPaths(directory: string) {
    const filename = path.join(cwd, directory, 'caller.ts');
    return getModulePaths({ cwd, filename, physicalFilename: filename, sourceCode });
  }

  expect(getPaths('first')?.resolveTarget('./feature')).toBe(path.join(cwd, 'first/feature/index.ts'));
  ast = { ...ast };
  const secondPaths = getPaths('second');
  expect(secondPaths?.resolveTarget('./feature')).toBe(path.join(cwd, 'second/feature/index.ts'));
  expect(getPaths('second')).toBe(secondPaths);
});
