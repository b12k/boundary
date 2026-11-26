import type { ArrayExpressionElement, Expression, ObjectExpression, ObjectProperty, Program, Span } from 'oxc-parser';

import path from 'node:path';
import { parseSync } from 'oxc-parser';

import { findChildEntry } from './boundary-files';
import {
  checkHasIndex,
  checkIsDependency,
  checkIsIndexFile,
  checkIsWithin,
  createModulePaths,
  resolvePhysicalPath,
} from './module-paths';

interface ConfigIssue {
  message: string;
  span: Span;
}

interface ImportsPolicy {
  kind: 'allow' | 'deny';
  modules: References;
}
interface ModulePolicy {
  hierarchy: Map<string, References>;
  imports: ImportsPolicy | undefined;
  layers: Map<string, number>;
}

type References = Map<string, Span>;

interface ReferenceScope {
  expected: string;
  kind: 'child' | 'module';
  resolve: (specifier: string) => string | undefined;
}

function checkViolatesLayers(layers: ModulePolicy['layers'], source: string, target: string) {
  const sourceLayer = layers.get(source);
  const targetLayer = layers.get(target);
  return sourceLayer !== undefined && targetLayer !== undefined && sourceLayer <= targetLayer;
}

function getExportValue(statement: Program['body'][number]) {
  if (statement.type === 'ExportDefaultDeclaration') return statement.declaration;

  let exported: Expression | undefined;
  const expression = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
  if (expression?.type === 'AssignmentExpression' && expression.operator === '=') {
    const { left, right } = expression;
    if (
      left.type === 'MemberExpression' &&
      !left.computed &&
      left.object.type === 'Identifier' &&
      left.object.name === 'module' &&
      left.property.type === 'Identifier' &&
      left.property.name === 'exports'
    ) {
      exported = right;
    }
  }
  return exported;
}

function getConfigObject(program: Program, issues: Array<ConfigIssue>) {
  const exports = program.body.map((statement) => getExportValue(statement)).filter((value) => value !== undefined);
  const [exported] = exports;
  const [argument] = exported?.type === 'CallExpression' ? exported.arguments : [];
  let config: ObjectExpression | undefined;
  if (
    exports.length === 1 &&
    exported?.type === 'CallExpression' &&
    !exported.optional &&
    exported.callee.type === 'Identifier' &&
    exported.callee.name === 'defineBoundary' &&
    exported.arguments.length === 1 &&
    argument?.type === 'ObjectExpression'
  ) {
    config = argument;
  } else {
    issues.push({
      message: 'Export a single defineBoundary({ ... }) call with an object literal.',
      span: exported ?? program,
    });
  }
  return config;
}

function readFields(node: Expression, issues: Array<ConfigIssue>) {
  const fields = new Map<string, ObjectProperty>();
  if (node.type !== 'ObjectExpression') {
    issues.push({ message: 'Expected an object literal.', span: node });
    return fields;
  }

  for (const property of node.properties) {
    if (
      property.type !== 'Property' ||
      property.computed ||
      property.shorthand ||
      property.method ||
      property.kind !== 'init'
    ) {
      issues.push({ message: 'Use named literal properties in a boundary config.', span: property });
    } else {
      const { key } = property;
      let name: string | undefined;
      if (key.type === 'Identifier') {
        ({ name } = key);
      } else if (key.type === 'Literal' && typeof key.value === 'string') {
        ({ value: name } = key);
      }
      if (name === undefined) {
        issues.push({ message: 'Use a string property name.', span: key });
      } else if (fields.has(name)) {
        issues.push({ message: `Duplicate property "${name}".`, span: key });
      } else {
        fields.set(name, property);
      }
    }
  }
  return fields;
}

function readReferences(
  elements: Array<ArrayExpressionElement>,
  span: Span,
  scope: ReferenceScope,
  issues: Array<ConfigIssue>,
) {
  const references: References = new Map();
  for (const element of elements) {
    if (element?.type !== 'Literal' || typeof element.value !== 'string') {
      issues.push({ message: `Expected a ${scope.kind} path as a string literal.`, span: element ?? span });
    } else {
      const { value } = element;
      const entry = scope.resolve(value);
      if (!entry) {
        issues.push({ message: `Cannot use "${value}" here. Expected ${scope.expected}.`, span: element });
      } else if (references.has(entry)) {
        issues.push({ message: `Duplicate ${scope.kind} "${value}".`, span: element });
      } else {
        references.set(entry, element);
      }
    }
  }
  return references;
}

function readReferenceArray(node: Expression, scope: ReferenceScope, issues: Array<ConfigIssue>) {
  if (node.type === 'ArrayExpression') return readReferences(node.elements, node, scope, issues);
  issues.push({ message: `Expected an array of ${scope.kind} paths.`, span: node });
  return new Map<string, Span>();
}

function readHierarchy(node: Expression, scope: ReferenceScope, issues: Array<ConfigIssue>) {
  const hierarchy = new Map<string, References>();
  for (const [name, field] of readFields(node, issues)) {
    const child = scope.resolve(name);
    if (!child) {
      issues.push({ message: `"${name}" is not a direct child file or directory.`, span: field.key });
    } else if (hierarchy.has(child)) {
      issues.push({ message: `Duplicate child "${name}".`, span: field.key });
    } else {
      const targets = readReferenceArray(field.value, scope, issues);
      const self = targets.get(child);
      if (self) issues.push({ message: 'A child cannot reference itself in hierarchy.', span: self });
      hierarchy.set(child, targets);
    }
  }
  return hierarchy;
}

function readImports(node: Expression, scope: ReferenceScope, issues: Array<ConfigIssue>) {
  const fields = readFields(node, issues);
  let imports: ImportsPolicy | undefined;
  const [kind] = fields.keys();
  if (fields.size === 1 && (kind === 'allow' || kind === 'deny')) {
    const field = fields.get(kind);
    if (field) imports = { kind, modules: readReferenceArray(field.value, scope, issues) };
  } else if (node.type === 'ObjectExpression') {
    issues.push({ message: 'Set exactly one of imports.allow or imports.deny.', span: node });
  }
  return imports;
}

function readLayers(node: Expression, scope: ReferenceScope, issues: Array<ConfigIssue>) {
  const layers = new Map<string, number>();
  if (node.type !== 'ArrayExpression') {
    issues.push({ message: 'Expected an ordered array of layers.', span: node });
    return layers;
  }

  for (const [position, layer] of node.elements.entries()) {
    const elements = layer?.type === 'ArrayExpression' ? layer.elements : [layer];
    for (const [child, span] of readReferences(elements, layer ?? node, scope, issues)) {
      if (layers.has(child)) {
        issues.push({ message: 'A child can only appear in one layer.', span });
      } else {
        layers.set(child, position);
      }
    }
  }
  return layers;
}

function readBoundaryConfig(filename: string, text: string, projectRoot: string) {
  // oxlint-disable-next-line node/no-sync -- Linter visitors enforce boundary configs synchronously.
  const result = parseSync(filename, text, { astType: 'ts', preserveParens: false, sourceType: 'unambiguous' });
  const issues: Array<ConfigIssue> = [];
  const policy: ModulePolicy = { hierarchy: new Map(), imports: undefined, layers: new Map() };
  for (const error of result.errors) {
    issues.push({ message: error.message, span: error.labels[0] ?? { end: 0, start: 0 } });
  }
  if (issues.length > 0) return { issues, policy };

  const directory = path.dirname(filename);
  const object = getConfigObject(result.program, issues);
  if (!object) return { issues, policy };

  let paths: ReturnType<typeof createModulePaths> | undefined;
  function resolveEntryPoint(specifier: string) {
    paths ??= createModulePaths(filename, projectRoot);
    const target = paths.resolveTarget(specifier);
    return target && checkIsIndexFile(target) ? path.dirname(resolvePhysicalPath(target)) : undefined;
  }

  function resolveImport(specifier: string) {
    const isRelative =
      specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
    const relativeDirectory = isRelative ? resolvePhysicalPath(path.resolve(directory, specifier)) : undefined;
    const target =
      relativeDirectory && checkHasIndex(relativeDirectory) ? relativeDirectory : resolveEntryPoint(specifier);
    return target &&
      !checkIsDependency(target) &&
      checkIsWithin(projectRoot, target) &&
      !checkIsWithin(directory, target)
      ? target
      : undefined;
  }

  const importScope: ReferenceScope = {
    expected: "an existing module with an index in this policy's scope",
    kind: 'module',
    resolve: resolveImport,
  };
  const childScope: ReferenceScope = {
    expected: 'an existing direct child file or directory',
    kind: 'child',
    resolve: (name) => findChildEntry(directory, name),
  };

  for (const [name, field] of readFields(object, issues)) {
    if (name === 'imports') policy.imports = readImports(field.value, importScope, issues);
    else if (name === 'layers') policy.layers = readLayers(field.value, childScope, issues);
    else if (name === 'hierarchy') policy.hierarchy = readHierarchy(field.value, childScope, issues);
    else issues.push({ message: `Unknown boundary property "${name}".`, span: field.key });
  }

  for (const [source, targets] of policy.hierarchy) {
    for (const [target, span] of targets) {
      if (source !== target && checkViolatesLayers(policy.layers, source, target)) {
        issues.push({ message: 'This hierarchy entry is forbidden by layers.', span });
      }
    }
  }

  return { issues, policy };
}

export type { ConfigIssue, ModulePolicy };
export { checkViolatesLayers, readBoundaryConfig };
