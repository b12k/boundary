import { barrelReexportsOnly } from './barrel-reexports-only';
import { noDeepImports } from './no-deep-imports';
import { noExplicitIndex } from './no-explicit-index';
import { noExportStar } from './no-export-star';
import { noInternalBarrelImports } from './no-internal-barrel-imports';
import { noParentReexports } from './no-parent-reexports';
import { noShadowedModuleEntry } from './no-shadowed-module-entry';
import { noUselessBarrel } from './no-useless-barrel';

const boundary = {
  meta: { name: 'boundary' },
  rules: {
    'barrel-reexports-only': barrelReexportsOnly,
    'no-deep-imports': noDeepImports,
    'no-explicit-index': noExplicitIndex,
    'no-export-star': noExportStar,
    'no-internal-barrel-imports': noInternalBarrelImports,
    'no-parent-reexports': noParentReexports,
    'no-shadowed-module-entry': noShadowedModuleEntry,
    'no-useless-barrel': noUselessBarrel,
  },
};

// oxlint-disable-next-line import/no-default-export -- Both lint engines load the default plugin export.
export default boundary;
