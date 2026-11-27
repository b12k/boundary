import { readFileSync } from 'node:fs';
import path from 'node:path';

/* oxlint-disable node/no-sync -- Linter visitors read policy files synchronously. */
import type { ConfigIssue, ModulePolicy } from './boundary-config';

import { checkViolatesLayers, readBoundaryConfig } from './boundary-config';
import { listAncestorDirectories, listDotBoundaryFiles } from './boundary-files';
import { checkIsWithin } from './module-paths';

type LoadConfig = (directory: string) => LoadedConfig | undefined;

interface LoadedConfig {
  filename: string;
  issue: string | undefined;
  policy: ModulePolicy | undefined;
}

function createConfigLoader(projectRoot: string): LoadConfig {
  const configsByDirectory = new Map<string, LoadedConfig | undefined>();

  return function loadConfig(directory) {
    if (configsByDirectory.has(directory)) return configsByDirectory.get(directory);

    const files = listDotBoundaryFiles(directory);
    const [filename] = files;
    let loaded: LoadedConfig | undefined;
    if (filename) {
      if (files.length > 1) {
        loaded = { filename, issue: 'Multiple .boundary files in the same directory.', policy: undefined };
      } else {
        try {
          const { issues, policy } = readBoundaryConfig(filename, readFileSync(filename, 'utf8'), projectRoot);
          const [issue] = issues;
          loaded = { filename, issue: issue?.message, policy: issue ? undefined : policy };
        } catch {
          loaded = { filename, issue: 'Could not read the boundary config.', policy: undefined };
        }
      }
    }
    configsByDirectory.set(directory, loaded);
    return loaded;
  };
}

function findChildPolicyViolation(policy: ModulePolicy, source: string, target: string) {
  const targets = policy.hierarchy.get(source);
  let reason: string | undefined;
  if (checkViolatesLayers(policy.layers, source, target)) reason = 'layers forbids this direction';
  else if (targets && !targets.has(target)) reason = 'hierarchy does not allow this dependency';
  return reason;
}

function getChildPath(directory: string, entry: string) {
  const [name] = path.relative(directory, entry).split(path.sep);
  return name ? path.join(directory, name) : undefined;
}

function findPolicyViolation(scopes: Array<string>, sourcePath: string, targetPath: string, loadConfig: LoadConfig) {
  let violation: undefined | { filename: string; reason: string; source: string; target: string };
  for (const scope of scopes) {
    const isOutgoing = !checkIsWithin(scope, targetPath);
    const source = isOutgoing ? scope : getChildPath(scope, sourcePath);
    const target = isOutgoing ? targetPath : getChildPath(scope, targetPath);
    if (source && target && path.relative(source, target) !== '') {
      const loaded = loadConfig(scope);
      let reason = loaded?.issue && `invalid config: ${loaded.issue}`;
      if (loaded?.policy) {
        const { imports } = loaded.policy;
        if (
          isOutgoing &&
          imports &&
          imports.entries.keys().some((entry) => checkIsWithin(entry, target)) !== (imports.kind === 'allow')
        ) {
          reason = `imports.${imports.kind} forbids this dependency`;
        } else if (!isOutgoing) {
          reason = findChildPolicyViolation(loaded.policy, source, target);
        }
      }
      if (loaded && reason) {
        violation = { filename: loaded.filename, reason, source, target };
        break;
      }
    }
  }
  return violation;
}

function readConfigIssues(filename: string, text: string, projectRoot: string, loadConfig: LoadConfig) {
  const directory = path.dirname(filename);
  const fileSpan = { end: 0, start: 0 };
  const otherFiles = listDotBoundaryFiles(directory).filter((file) => path.relative(file, filename) !== '');
  const issues: Array<ConfigIssue> = [];
  if (otherFiles.length > 0) {
    issues.push({
      message: `Keep one .boundary file per directory. Also found ${otherFiles.map((file) => path.basename(file)).join(', ')}.`,
      span: fileSpan,
    });
  }
  const parsed = readBoundaryConfig(filename, text, projectRoot);
  issues.push(...parsed.issues);
  const { imports } = parsed.policy;
  if (issues.length === 0 && imports?.kind === 'allow') {
    const [, ...parents] = listAncestorDirectories(directory, projectRoot);
    for (const [target, span] of imports.entries) {
      const violation = findPolicyViolation(parents, directory, target, loadConfig);
      if (violation) {
        issues.push({
          message: `Cannot allow "${path.basename(target)}". ${path.relative(projectRoot, violation.filename)}: ${violation.reason}.`,
          span,
        });
      }
    }
  }

  return issues;
}

export { createConfigLoader, findPolicyViolation, readConfigIssues };
