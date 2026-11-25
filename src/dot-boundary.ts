interface BoundaryConfig {
  hierarchy?: Readonly<Record<string, ReadonlyArray<string>>>;
  imports?: ImportPolicy;
  layers?: ReadonlyArray<ReadonlyArray<string> | string>;
}

type ImportPolicy = { allow: ReadonlyArray<string>; deny?: never } | { allow?: never; deny: ReadonlyArray<string> };

function defineBoundary(config: BoundaryConfig): BoundaryConfig {
  return config;
}

export type { BoundaryConfig, ImportPolicy };
export { defineBoundary };
