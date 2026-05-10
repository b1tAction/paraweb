const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const ASSET_VERSION_QUERY_KEY = 'v';

let currentAssetVersion: string | null = null;

function normalizedBaseUrl(): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function stripQueryAndHash(value: string): string {
  const delimiterIndex = value.search(/[?#]/);
  return delimiterIndex === -1 ? value : value.slice(0, delimiterIndex);
}

function normalizeAssetPath(value: string): { url: string; normalizedPath: string } {
  const baseUrl = normalizedBaseUrl();
  const valueWithoutBase = baseUrl !== '/' && value.startsWith(baseUrl) ? value.slice(baseUrl.length) : value;
  const normalizedPath = valueWithoutBase.replace(/^\.\//, '').replace(/^\/+/, '');

  return {
    normalizedPath,
    url: baseUrl === '/' ? `/${normalizedPath}` : `${baseUrl}${normalizedPath}`,
  };
}

function shouldVersionAssetPath(normalizedPath: string): boolean {
  const pathWithoutQuery = stripQueryAndHash(normalizedPath);
  const filename = pathWithoutQuery.split('/').pop() || '';

  return pathWithoutQuery.startsWith('assets/') && /\.[a-z0-9]+$/i.test(filename);
}

function appendAssetVersion(url: string): string {
  if (!currentAssetVersion) return url;

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${ASSET_VERSION_QUERY_KEY}=${encodeURIComponent(currentAssetVersion)}`;
}

export function setAssetVersion(version: string | null): void {
  const normalizedVersion = version?.trim();
  currentAssetVersion = normalizedVersion || null;
}

export function assetUrl(path: string): string {
  const value = path.trim();
  if (!value || ABSOLUTE_URL_PATTERN.test(value)) return value;

  const { normalizedPath, url } = normalizeAssetPath(value);
  if (!shouldVersionAssetPath(normalizedPath)) return url;

  return appendAssetVersion(url);
}

export function assetCssUrl(path: string): string {
  return `url("${assetUrl(path)}")`;
}
