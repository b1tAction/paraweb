type TiledProperty = { name?: string; value?: unknown };
type TiledObjectWithProperties = { properties?: TiledProperty[] | Record<string, unknown> };

export function getTiledProperty<T = unknown>(
  obj: TiledObjectWithProperties | null | undefined,
  name: string,
  fallback?: T,
): T | undefined {
  const props = obj?.properties;

  if (Array.isArray(props)) {
    const found = props.find((property) => property.name === name);
    return found ? (found.value as T) : fallback;
  }

  if (props && typeof props === 'object' && name in props) {
    return props[name] as T;
  }

  return fallback;
}
