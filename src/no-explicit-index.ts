import { createRequire } from 'node:module';
import path from 'node:path';

import { checkIsIndexFile, getModulePaths } from './module-paths';
import { createRule, visitSpecifiers } from './rule';

function checkIsSameNativeRequireTarget(filename: string, specifier: string, shorter: string, target: string) {
  try {
    const { resolve } = createRequire(filename);
    return path.relative(target, resolve(specifier)) === '' && path.relative(target, resolve(shorter)) === '';
  } catch {
    return false;
  }
}

function shortenSpecifier(specifier: string) {
  const separator = specifier.lastIndexOf('/');
  const filename = specifier.slice(separator + 1);
  return separator !== -1 && (filename === 'index' || checkIsIndexFile(filename))
    ? specifier.slice(0, separator) || '/'
    : undefined;
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
    const resolution = compilerOptions?.moduleResolution?.toLowerCase();
    const module = compilerOptions?.module?.toLowerCase();
    const hasBundlerResolution =
      resolution === 'bundler' || (!resolution && (module === 'preserve' || module === 'esnext'));
    let isEsm: boolean | undefined;

    return visitSpecifiers(context, (source, kind) => {
      const { value: specifier } = source;
      const shorter = shortenSpecifier(specifier);
      if (!shorter) return;

      const isRequire = kind === 'require';
      const target = paths.resolveTarget(specifier, isRequire);
      const shorterTarget = paths.resolveTarget(shorter, isRequire);
      if (!target || !shorterTarget || !checkIsIndexFile(target) || path.relative(target, shorterTarget) !== '') return;

      if (!hasBundlerResolution) {
        if (isRequire) {
          if (!checkIsSameNativeRequireTarget(filename, specifier, shorter, target)) return;
        } else {
          isEsm ??= ['.mjs', '.mts'].includes(path.extname(filename)) || checkIsEsm();
          if (
            isEsm ||
            (kind === 'dynamic-import' && module !== 'commonjs') ||
            !['.js', '.ts'].includes(path.extname(target))
          ) {
            return;
          }
        }
      }

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
