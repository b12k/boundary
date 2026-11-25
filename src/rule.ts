import type { Rule } from 'eslint';
import type { Expression, Literal, MemberExpression, Node } from 'estree';

interface Reexport {
  isRequire: boolean;
  isWildcard: boolean;
  source: StringLiteral;
}
type RequestKind = 'dynamic-import' | 'import' | 'require';
type StringLiteral = Literal & { value: string };

function checkIsGlobalIdentifier(context: Rule.RuleContext, node: Node, name: string) {
  if (node.type !== 'Identifier' || node.name !== name) return false;

  for (
    let scope: null | ReturnType<typeof context.sourceCode.getScope> = context.sourceCode.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(name);
    if (variable) return variable.defs.length === 0;
  }
  return true;
}

function checkIsStringLiteral(node?: Node | null): node is StringLiteral {
  return node?.type === 'Literal' && typeof node.value === 'string';
}

function getPropertyName(node: MemberExpression) {
  const { computed, property } = node;
  if (computed) return checkIsStringLiteral(property) ? property.value : undefined;
  return property.type === 'Identifier' ? property.name : undefined;
}

function checkIsModuleExports(context: Rule.RuleContext, node: Node) {
  return (
    node.type === 'MemberExpression' &&
    !node.optional &&
    getPropertyName(node) === 'exports' &&
    checkIsGlobalIdentifier(context, node.object, 'module')
  );
}

function createRule(meta: Rule.RuleMetaData, create: Rule.RuleModule['create']): Rule.RuleModule {
  return { create, meta: { schema: [], type: 'problem', ...meta } };
}

function getRequireSource(context: Rule.RuleContext, node: Node) {
  let source: StringLiteral | undefined;
  if (node.type === 'CallExpression' && !node.optional && node.arguments.length === 1) {
    const [argument] = node.arguments;
    if (checkIsStringLiteral(argument) && checkIsGlobalIdentifier(context, node.callee, 'require')) source = argument;
  }
  return source;
}

function getCommonJsReexport(context: Rule.RuleContext, node: Node): Reexport | undefined {
  let reexport: Reexport | undefined;
  if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression') {
    const { left, operator, right } = node.expression;
    if (operator === '=' && left.type === 'MemberExpression' && getPropertyName(left) !== undefined) {
      const isWildcard = checkIsModuleExports(context, left);
      const isNamed =
        checkIsModuleExports(context, left.object) || checkIsGlobalIdentifier(context, left.object, 'exports');
      if (isWildcard || isNamed) {
        const call =
          !isWildcard && right.type === 'MemberExpression' && !right.optional && getPropertyName(right) !== undefined
            ? right.object
            : right;
        const source = getRequireSource(context, call);
        if (source) reexport = { isRequire: true, isWildcard, source };
      }
    }
  }
  return reexport;
}

function getReexport(context: Rule.RuleContext, node: Node): Reexport | undefined {
  if (
    (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
    checkIsStringLiteral(node.source)
  ) {
    return { isRequire: false, isWildcard: node.type === 'ExportAllDeclaration', source: node.source };
  }
  return getCommonJsReexport(context, node);
}

function visitReexports(
  context: Rule.RuleContext,
  handleReexport: (node: Node, reexport: Reexport) => void,
): Rule.RuleListener {
  return {
    Program(program) {
      for (const node of program.body) {
        const reexport = getReexport(context, node);
        if (reexport) handleReexport(node, reexport);
      }
    },
  };
}

function visitSpecifiers(
  context: Rule.RuleContext,
  handleSpecifier: (source: StringLiteral, kind: RequestKind) => void,
): Rule.RuleListener {
  function handleSource(source?: Expression | null, kind: RequestKind = 'import') {
    if (checkIsStringLiteral(source)) handleSpecifier(source, kind);
  }

  return {
    CallExpression: (node) => handleSource(getRequireSource(context, node), 'require'),
    ExportAllDeclaration: (node) => handleSource(node.source),
    ExportNamedDeclaration: (node) => handleSource(node.source),
    ImportDeclaration: (node) => handleSource(node.source),
    ImportExpression: (node) => handleSource(node.source, 'dynamic-import'),
  };
}

export { createRule, getReexport, visitReexports, visitSpecifiers };
