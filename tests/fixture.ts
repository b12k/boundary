import { Linter } from 'eslint';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import boundary from '../src/index';

type RuleName = keyof typeof boundary.rules;

export function createFixture() {
  let root = '';

  async function start() {
    root = await mkdtemp(path.join(tmpdir(), 'boundary-'));
  }

  async function cleanup() {
    if (root) await rm(root, { force: true, recursive: true });
  }

  async function writeFixture(filename: string, contents: string) {
    const target = path.join(root, filename);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  function lint(rule: RuleName, filename: string, source: string): Array<Linter.LintMessage> {
    const linter = new Linter({ cwd: root });
    const config: Linter.Config = {
      files: ['**/*.{ts,js,mjs,cjs,tsx,jsx}'],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { boundary },
      rules: { [`boundary/${rule}`]: 'error' },
    };
    const options = { filename: path.join(root, filename) };
    return linter.verify(source, config, options);
  }

  function getRoot() {
    return root;
  }

  return { cleanup, getRoot, lint, start, writeFixture };
}
