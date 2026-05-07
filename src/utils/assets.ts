const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

function normalizedBaseUrl(): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function assetUrl(path: string): string {
  const value = path.trim();
  if (!value || ABSOLUTE_URL_PATTERN.test(value)) return value;

  const baseUrl = normalizedBaseUrl();
  if (baseUrl !== '/' && value.startsWith(baseUrl)) return value;
  if (baseUrl === './' && value.startsWith('./')) return value;

  const normalizedPath = value.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${baseUrl}${normalizedPath}`;
}

export function assetCssUrl(path: string): string {
  return `url("${assetUrl(path)}")`;
}
