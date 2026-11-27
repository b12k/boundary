# Boundary

<img src="./assets/boundary-honeycomb.svg" alt=".boundary logo" width="320" />

A collection of ESLint and Oxlint rules for enforcing architectural decisions in JavaScript and TypeScript projects. Use public `index` entry points to define module APIs and [`.boundary.*` policies](#module-policies) to control dependencies between modules and layers.

Install the plugin with `pnpm add -D @b12k/boundary`.

## ESLint

```js
import boundary from '@b12k/boundary';

export default [{ ...boundary.configs.recommended, files: ['**/*.{ts,js,mjs,cjs,tsx,jsx}'] }];
```

Use the project's parser configuration for TypeScript and JSX files.

## Oxlint

Extend the preset in `oxlint.config.ts`:

```ts
import { oxlintRecommended } from '@b12k/boundary';
import { defineConfig } from 'oxlint';

export default defineConfig({ extends: [oxlintRecommended] });
```

For `.oxlintrc.json`, register `{"name": "boundary", "specifier": "@b12k/boundary"}` in `jsPlugins` and enable individual rules in `rules`.

## Rules

The `recommended` preset enables every rule below at `error` except `boundary/require-dot-boundary`, which you can enable explicitly.

| Rule                         | Behavior                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barrel-reexports-only`      | Allows direct re-exports in an index, including named type re-exports.                                                                                                                      |
| `no-deep-imports`            | Requires imports entering another module to use the first public index they cross. From `orders`, use `../users` to reach exports from `users/permissions`.                                 |
| `no-empty-module`            | Reports a module directory that contains only its index files and optional `.boundary.*` config.                                                                                            |
| `no-explicit-index`          | Fixes `../users/index` to `../users` when directory imports are supported and both specifiers resolve to the same index.                                                                    |
| `no-export-star`             | Allows `export * from` in an index when the target is another module's public index. Named and namespace re-exports are allowed.                                                            |
| `no-internal-barrel-imports` | Forbids importing your own index or an ancestor index. A file in `users/profile` may import `../service` directly and enter a sibling module through its public index.                      |
| `no-parent-reexports`        | Keeps an index's local re-exports inside its directory. Reports re-exports from sibling or parent directories.                                                                              |
| `no-shadowed-module-entry`   | Reports `utils/index.ts` when a sibling such as `utils.ts` can shadow the directory import.                                                                                                 |
| `no-useless-barrel`          | Reports an index that only re-exports the sole same-name implementation file in its directory. Supporting files such as `utils.test.ts` and `utils.css` keep the directory structure valid. |
| `require-dot-boundary`       | Reports a module's index when its directory has no `.boundary.*` file of its own.                                                                                                           |
| `use-dot-boundary`           | Validates `.boundary.*` files and reports forbidden dependencies at the import or re-export.                                                                                                |

💡 It also understands aliases like `@/users` from `tsconfig.json`.

For CommonJS files, Boundary checks literal `require()` calls and direct re-exports such as `module.exports = require('./child/index.cjs')` and `exports.read = require('./reader.cjs').read`.

## Module policies

Place one `.boundary.{ts,js,mjs,cjs,tsx,jsx}` file beside a module's index. A config at the project root can describe top-level files and folders without a root index.

```ts
// users/.boundary.ts
import { defineBoundary } from '@b12k/boundary';

export default defineBoundary({
  imports: { allow: ['../shared'] },
  layers: ['repository', ['service', 'events.ts'], 'controller'],
  hierarchy: { controller: ['service'] },
});
```

For CommonJS, use `const { defineBoundary } = require('@b12k/boundary')` and `module.exports = defineBoundary({ … })`. The linter reads the object literal statically.

- **`imports`** applies to dependencies that leave the module's subtree. `allow` permits only the listed modules, while `deny` blocks only the listed modules. Paths are relative to the config file and can use TypeScript aliases.
- **`layers`** applies to named direct child files and folders. Higher layers can use lower layers. Children on the same layer cannot import each other.
- **`hierarchy`** lists which direct siblings a named child can use. A child with an empty target list cannot import any of its siblings. An omitted source has no additional hierarchy restriction.

Use exact names such as `controller.ts` or `service`. Files are named with their extensions, and a folder covers all descendants even if it has no `index.*`. To refer to `service/internal/load.ts`, list `service`.

Policies apply together. In the example, a file deep inside `controller` can import `service`, but importing `repository` violates `hierarchy` even though `layers` permits that direction. The public-index rules still govern which files those imports can target.

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

### `no-empty-module`

❌ The directory contains only an index and a boundary config.

```text
users/
├── .boundary.ts
└── index.ts
```

✅ The directory contains module code alongside the index.

```text
users/
├── index.ts
└── service.ts
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
export * as service from './service';
```

✅ List the implementation exports by name or forward the public API of `permissions/index.ts`.

```ts
export { getUser, updateUser } from './service';
export * from './permissions';
```

`allowFromBarrels` defaults to `true` for both `export *` and `export * as name`. Set it to `false` to also report these re-exports from other module indices.

```json
{ "rules": { "boundary/no-export-star": ["error", { "allowFromBarrels": false }] } }
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
