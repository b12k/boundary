/* oxlint-disable import/max-dependencies -- The plugin entry point registers each rule directly. */
import { barrelReexportsOnly } from './barrel-reexports-only';
import { noDeepImports } from './no-deep-imports';
import { noEmptyModule } from './no-empty-module';
import { noExplicitIndex } from './no-explicit-index';
import { noExportStar } from './no-export-star';
import { noInternalBarrelImports } from './no-internal-barrel-imports';
import { noParentReexports } from './no-parent-reexports';
import { noShadowedModuleEntry } from './no-shadowed-module-entry';
import { noUselessBarrel } from './no-useless-barrel';
import { requireDotBoundary } from './require-dot-boundary';
import { useDotBoundary } from './use-dot-boundary';

const boundary = {
  meta: { name: 'boundary' },
  rules: {
    'barrel-reexports-only': barrelReexportsOnly,
    'no-deep-imports': noDeepImports,
    'no-empty-module': noEmptyModule,
    'no-explicit-index': noExplicitIndex,
    'no-export-star': noExportStar,
    'no-internal-barrel-imports': noInternalBarrelImports,
    'no-parent-reexports': noParentReexports,
    'no-shadowed-module-entry': noShadowedModuleEntry,
    'no-useless-barrel': noUselessBarrel,
    'require-dot-boundary': requireDotBoundary,
    'use-dot-boundary': useDotBoundary,
  },
};

export type { BoundaryConfig, ImportPolicy } from './dot-boundary';
export { defineBoundary } from './dot-boundary';

// oxlint-disable-next-line import/no-default-export -- Both lint engines load the default plugin export.
export default boundary;
