type WailsGlobal = typeof globalThis & {
  go?: unknown;
};

export function isWailsRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname === 'wails.localhost') return true;

  return typeof (globalThis as WailsGlobal).go !== 'undefined';
}
