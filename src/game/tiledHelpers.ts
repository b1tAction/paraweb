export function getTiledProperty<T = unknown>(
  obj: any,
  name: string,
  fallback?: T
): T | undefined {
  const props = obj?.properties;

  if (Array.isArray(props)) {
    const found = props.find((p: any) => p.name === name);
    return found ? (found.value as T) : fallback;
  }

  if (props && typeof props === 'object' && name in props) {
    return props[name] as T;
  }

  return fallback;
}