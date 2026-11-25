import type { Rule } from 'eslint';
import type { ExportAllDeclaration, ExportNamedDeclaration, Expression, Literal } from 'estree';

function checkIsReexport(node: {
  source?: unknown;
  type: string;
}): node is ExportAllDeclaration | (ExportNamedDeclaration & { source: Literal }) {
  return (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && Boolean(node.source);
}

function createRule(meta: Rule.RuleMetaData, create: Rule.RuleModule['create']): Rule.RuleModule {
  return { create, meta: { schema: [], type: 'problem', ...meta } };
}

function visitSpecifiers(handleSpecifier: (source: Literal, specifier: string) => void): Rule.RuleListener {
  function handleSource(source?: Expression | null) {
    if (source?.type === 'Literal' && typeof source.value === 'string') handleSpecifier(source, source.value);
  }

  return {
    ExportAllDeclaration: (node) => handleSource(node.source),
    ExportNamedDeclaration: (node) => handleSource(node.source),
    ImportDeclaration: (node) => handleSource(node.source),
    ImportExpression: (node) => handleSource(node.source),
  };
}

export { checkIsReexport, createRule, visitSpecifiers };
