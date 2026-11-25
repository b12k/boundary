# Module Boundaries

ESLint and Oxlint rules for modules whose public entry point is `index.ts` or `index.js`.

Install the plugin with `pnpm add -D @b12k/module-boundaries-plugin`.

## ESLint

```js
import moduleBoundaries from '@b12k/module-boundaries-plugin';

export default [
  {
    plugins: { 'module-boundaries': moduleBoundaries },
    rules: {
      'module-boundaries/barrel-reexports-only': 'error',
      'module-boundaries/no-deep-imports': 'error',
      'module-boundaries/no-explicit-index': 'error',
      'module-boundaries/no-export-star': 'error',
      'module-boundaries/no-internal-barrel-imports': 'error',
      'module-boundaries/no-parent-reexports': 'error',
      'module-boundaries/no-shadowed-module-entry': 'error',
      'module-boundaries/no-useless-barrel': 'error',
    },
  },
];
```

Use the project's TypeScript parser configuration to lint TypeScript files with ESLint.

## Oxlint

Add the plugin and rules to `.oxlintrc.json` or `oxlint.config.ts`.

```json
{
  "jsPlugins": [{ "name": "module-boundaries", "specifier": "@b12k/module-boundaries-plugin" }],
  "rules": {
    "module-boundaries/barrel-reexports-only": "error",
    "module-boundaries/no-deep-imports": "error",
    "module-boundaries/no-explicit-index": "error",
    "module-boundaries/no-export-star": "error",
    "module-boundaries/no-internal-barrel-imports": "error",
    "module-boundaries/no-parent-reexports": "error",
    "module-boundaries/no-shadowed-module-entry": "error",
    "module-boundaries/no-useless-barrel": "error"
  }
}
```

## Rules

| Rule                         | Behavior                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barrel-reexports-only`      | Allows direct re-exports in an index, including named type re-exports.                                                                                                                      |
| `no-deep-imports`            | Requires imports entering another module to use the first public index they cross. From `orders`, use `../users` to reach exports from `users/permissions`.                                 |
| `no-explicit-index`          | Fixes `../users/index` to `../users` when directory imports are supported and both specifiers resolve to the same index.                                                                    |
| `no-export-star`             | Allows `export * from` in an index when the target is another module's public index. Named and namespace re-exports are allowed.                                                            |
| `no-internal-barrel-imports` | Forbids importing your own index or an ancestor index. A file in `users/profile` may import `../service` directly and enter a sibling module through its public index.                      |
| `no-parent-reexports`        | Keeps an index's local re-exports inside its directory. Reports re-exports from sibling or parent directories.                                                                              |
| `no-shadowed-module-entry`   | Reports `utils/index.ts` when a sibling such as `utils.ts` can shadow the directory import.                                                                                                 |
| `no-useless-barrel`          | Reports an index that only re-exports the sole same-name implementation file in its directory. Supporting files such as `utils.test.ts` and `utils.css` keep the directory structure valid. |

💡 It also understands aliases like `@/users` from `tsconfig.json`.

## Examples

### `barrel-reexports-only`

❌ Define a function in `users/index.ts`.

```ts
export function isActive(status: string) {
  return status === 'active';
}
```

✅ Define it in `status.ts` and re-export it from the index.

```ts
export { isActive } from './status';
export type { UserStatus } from './types';
```

### `no-deep-imports`

From `orders/view.ts`, the first boundary on the way to `users/permissions` is `users`.

❌ Bypass the `users` index.

```ts
import { checkPermission } from '../users/permissions';
```

✅ Import through `users/index.ts`, which re-exports `checkPermission`.

```ts
import { checkPermission } from '../users';
```

### `no-explicit-index`

With a resolver that supports directory imports, both specifiers below point to `users/index.ts`.

❌ Write the redundant `/index` segment.

```ts
import { getUser } from '../users/index';
```

✅ Use the directory path.

```ts
import { getUser } from '../users';
```

### `no-export-star`

❌ Forward every export from `service.ts` through `users/index.ts`.

```ts
export * from './service';
```

✅ List the implementation exports by name or forward the public API of `permissions/index.ts`.

```ts
export { getUser, updateUser } from './service';
export * from './permissions';
```

### `no-internal-barrel-imports`

❌ Import through the parent index from `users/profile/view.ts`.

```ts
import { getUser } from '..';
```

✅ Import the parent's implementation file directly.

```ts
import { getUser } from '../service';
```

### `no-parent-reexports`

❌ Re-export a parent file from `users/profile/index.ts`.

```ts
export { getUser } from '../service';
```

✅ Re-export a file inside `users/profile`.

```ts
export { getProfile } from './get-profile';
```

### `no-shadowed-module-entry`

❌ Both `utils.ts` and `utils/index.ts` are candidates for `./utils`.

```text
src/
├── utils.ts
└── utils/
    └── index.ts
```

✅ Give the sibling file a distinct name so `./utils` leads to the index.

```text
src/
├── legacy-utils.ts
└── utils/
    └── index.ts
```

### `no-useless-barrel`

❌ The index only forwards to the sole file, which has the same name as the directory.

```text
utils/
├── index.ts  # export { format } from './utils'
└── utils.ts
```

✅ The directory groups the implementation and a supporting test file.

```text
utils/
├── index.ts  # export { format } from './utils'
├── utils.ts
└── utils.test.ts
```
