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

// WebP support detection (cached after first check)
let webpSupported: boolean | null = null;

function checkWebpSupport(): boolean {
  if (webpSupported !== null) return webpSupported;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

/**
 * Resolve the optimal image URL for a given path.
 * If the browser supports WebP and a .png path is given, returns the .webp variant.
 */
export function assetImageUrl(path: string): string {
  if (checkWebpSupport() && path.endsWith('.png')) {
    const webpPath = path.replace(/\.png$/, '.webp');
    return assetUrl(webpPath);
  }
  return assetUrl(path);
}

export function assetImageCssUrl(path: string): string {
  return `url("${assetImageUrl(path)}")`;
}
