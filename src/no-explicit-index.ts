import path from 'node:path';

import { checkIsIndexFile, getModulePaths } from './module-paths';
import { createRule, visitSpecifiers } from './rule';

const INDEX_SUFFIX = /\/index(?:\.[jt]s)?$/u;

function shortenSpecifier(specifier: string) {
  return INDEX_SUFFIX.test(specifier) ? specifier.replace(INDEX_SUFFIX, '') || '/' : undefined;
}

export const noExplicitIndex = createRule(
  {
    docs: { description: 'Omit a redundant index segment when the shorter specifier resolves to the same file.' },
    fixable: 'code',
    messages: { explicitIndex: 'Use "{{specifier}}" to import this index.' },
    type: 'suggestion',
  },
  (context) => {
    const paths = getModulePaths(context);
    if (!paths) return {};

    const { checkIsEsm, compilerOptions, filename } = paths;
    let canShorten: boolean | undefined;
    function checkCanShorten() {
      const resolution = compilerOptions?.moduleResolution?.toLowerCase();
      const module = compilerOptions?.module?.toLowerCase();
      if (resolution === 'bundler' || (!resolution && (module === 'preserve' || module === 'esnext'))) return true;
      return !['.mjs', '.mts'].includes(path.extname(filename)) && !checkIsEsm();
    }

    return visitSpecifiers((source, specifier) => {
      const shorter = shortenSpecifier(specifier);
      if (!shorter) return;

      canShorten ??= checkCanShorten();
      if (!canShorten) return;

      const target = paths.resolveTarget(specifier);
      const shorterTarget = paths.resolveTarget(shorter);
      if (!target || !shorterTarget || !checkIsIndexFile(target) || path.relative(target, shorterTarget) !== '') return;

      const text = context.sourceCode.getText(source);
      const quote = text.startsWith("'") ? "'" : '"';
      const replacement = JSON.stringify(shorter).slice(1, -1);
      const escaped = quote === "'" ? replacement.replaceAll("'", String.raw`\'`) : replacement;
      context.report({
        data: { specifier: shorter },
        fix: (fixer) => fixer.replaceText(source, `${quote}${escaped}${quote}`),
        messageId: 'explicitIndex',
        node: source,
      });
    });
  },
);
