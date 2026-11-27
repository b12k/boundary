import path from 'node:path';

import { checkIsDotBoundaryFile, listModuleDirectories } from './boundary-files';
import { createConfigLoader, findPolicyViolation, readConfigIssues } from './boundary-policies';
import { checkIsWithin, getModulePaths, resolvePhysicalPath } from './module-paths';
import { createRule, visitSpecifiers } from './rule';

export const useDotBoundary = createRule(
  {
    docs: { description: 'Read .boundary configs and enforce their module dependency policies.' },
    messages: {
      blockedDependency: '"{{source}}" cannot depend on "{{target}}". {{config}}: {{reason}}.',
      invalidConfig: '{{reason}}',
    },
  },
  (context) => {
    const paths = getModulePaths(context);
    if (!paths) return {};

    const { filename, projectRoot, sourceDirectory } = paths;
    const loadConfig = createConfigLoader(projectRoot);
    if (checkIsDotBoundaryFile(filename)) {
      return {
        Program() {
          const { sourceCode } = context;
          const { text } = sourceCode;
          for (const issue of readConfigIssues(filename, text, projectRoot, loadConfig)) {
            context.report({
              data: { reason: issue.message },
              loc: {
                end: sourceCode.getLocFromIndex(Math.min(issue.span.end, text.length)),
                start: sourceCode.getLocFromIndex(Math.min(issue.span.start, text.length)),
              },
              messageId: 'invalidConfig',
            });
          }
        },
      };
    }

    const modules = listModuleDirectories(sourceDirectory, projectRoot);
    const [sourceModule] = modules;
    const scopes = [...new Set([...modules, projectRoot])].filter((scope) => loadConfig(scope) !== undefined);
    if (scopes.length === 0) return {};

    const targetModulesByDirectory = new Map<string, string | undefined>();
    return visitSpecifiers(context, (specifier, kind) => {
      const targetFile = paths.resolveTarget(specifier.value, kind === 'require');
      if (!targetFile) return;

      const target = resolvePhysicalPath(targetFile);
      if (!checkIsWithin(projectRoot, target)) return;
      const directory = path.dirname(target);
      if (!targetModulesByDirectory.has(directory)) {
        const [module] = listModuleDirectories(directory, projectRoot);
        targetModulesByDirectory.set(directory, module);
      }
      const targetModule = targetModulesByDirectory.get(directory);
      const dependency = { source: filename, sourceModule, target, targetModule };
      const violation = findPolicyViolation(scopes, dependency, loadConfig);
      if (violation) {
        context.report({
          data: {
            config: path.relative(projectRoot, violation.filename),
            reason: violation.reason,
            source: path.basename(violation.source),
            target: path.basename(violation.target),
          },
          messageId: 'blockedDependency',
          node: specifier,
        });
      }
    });
  },
);
