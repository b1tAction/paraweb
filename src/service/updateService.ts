import { isWailsRuntime } from '../utils/runtime';

export interface DesktopUpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
}

type WailsAppBinding = {
  CheckForUpdate?: () => Promise<unknown> | unknown;
};

type WailsWindow = Window & {
  go?: {
    main?: {
      App?: WailsAppBinding;
    };
  };
  runtime?: {
    BrowserOpenURL?: (url: string) => Promise<void> | void;
  };
};

function getWailsAppBinding(): WailsAppBinding | null {
  if (!isWailsRuntime()) return null;

  return (window as WailsWindow).go?.main?.App ?? null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;

  return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function readBoolean(value: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'boolean') {
      return candidate;
    }
  }

  return false;
}

function normalizeUpdateCheckResult(raw: unknown): DesktopUpdateCheckResult | null {
  const record = toRecord(raw);
  if (!record) return null;

  const currentVersion = readString(record, 'current_version', 'currentVersion', 'CurrentVersion');
  const latestVersion = readString(record, 'latest_version', 'latestVersion', 'LatestVersion');
  const releaseUrl = readString(record, 'release_url', 'releaseUrl', 'ReleaseURL');
  const hasUpdate = readBoolean(record, 'has_update', 'hasUpdate', 'HasUpdate');

  if (!currentVersion) return null;

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseUrl,
  };
}

export async function checkForUpdate(): Promise<DesktopUpdateCheckResult | null> {
  const app = getWailsAppBinding();
  if (!app?.CheckForUpdate) return null;

  const result = await app.CheckForUpdate();
  return normalizeUpdateCheckResult(result);
}

export function openExternalUrl(url: string): void {
  if (!url) return;

  const runtime = (window as WailsWindow).runtime;
  if (runtime?.BrowserOpenURL) {
    void runtime.BrowserOpenURL(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
