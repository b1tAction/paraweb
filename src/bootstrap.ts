import { assetUrl, setAssetVersion } from './utils/assets';
import { installGlobalButtonSfx } from './utils/buttonSfx';
import { isWailsRuntime } from './utils/runtime';
import { playStartBgm } from './utils/startBgm';

interface WebVersionManifest {
  release_id: string;
  build_time: string;
  base_path: string;
  public_assets: string[];
  build_assets: string[];
}

interface WebCacheMetadata {
  release_id: string;
  cache_name: string;
  base_path: string;
  resource_urls: string[];
  completed_at: string;
}

const CACHE_PREFIX = 'paradice-assets-';
const META_CACHE_NAME = 'paradice-meta';
const CACHE_READY_MESSAGE = 'PARADICE_CACHE_READY';
const META_RESOURCE_PATH = '__paradice-cache-state__';
const PRELOAD_CONCURRENCY = 6;
const BROWSER_PRELOAD_TIMEOUT_MS = 20_000;
const SERVICE_WORKER_TIMEOUT_MS = 10_000;
const RENDER_PRELOAD_CONCURRENCY = 4;
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;
const WOFF2_EXTENSION_PATTERN = /\.woff2(?:[?#]|$)/i;
const FONT_EXTENSION_PATTERN = /\.(?:ttf|woff2?)(?:[?#]|$)/i;
const BOOT_STYLE_ID = 'paradice-bootstrap-style';
const rootElement = (() => {
  const element = document.getElementById('root');
  if (!element) {
    throw new Error('Missing #root element');
  }

  return element;
})();

installGlobalButtonSfx();

function normalizedBaseUrl(): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function resolveBaseUrl(path: string): string {
  return `${normalizedBaseUrl()}${path.replace(/^\/+/, '')}`;
}

function toAbsoluteUrl(url: string): string {
  return new URL(url, window.location.href).href;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function parseManifest(value: unknown): WebVersionManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('版本文件格式无效');
  }

  const candidate = value as Partial<WebVersionManifest>;
  if (
    typeof candidate.release_id !== 'string' ||
    !candidate.release_id.trim() ||
    typeof candidate.build_time !== 'string' ||
    typeof candidate.base_path !== 'string' ||
    !isStringArray(candidate.public_assets) ||
    !isStringArray(candidate.build_assets)
  ) {
    throw new Error('版本文件缺少必要字段');
  }

  return {
    release_id: candidate.release_id.trim(),
    build_time: candidate.build_time,
    base_path: candidate.base_path,
    public_assets: candidate.public_assets,
    build_assets: candidate.build_assets,
  };
}

function isCacheMetadata(value: unknown): value is WebCacheMetadata {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<WebCacheMetadata>;
  return (
    typeof candidate.release_id === 'string' &&
    candidate.release_id.length > 0 &&
    typeof candidate.cache_name === 'string' &&
    candidate.cache_name.startsWith(CACHE_PREFIX) &&
    typeof candidate.base_path === 'string' &&
    isStringArray(candidate.resource_urls) &&
    typeof candidate.completed_at === 'string'
  );
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function ensureBootstrapStyle(): void {
  if (document.getElementById(BOOT_STYLE_ID)) return;

  const styleElement = document.createElement('style');
  styleElement.id = BOOT_STYLE_ID;
  styleElement.textContent = `
    .paradice-bootstrap {
      position: fixed;
      inset: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #fff7d6;
      background:
        radial-gradient(circle at 50% 34%, rgba(255, 226, 157, 0.16), transparent 32%),
        linear-gradient(180deg, rgba(8, 13, 16, 0.18), rgba(7, 10, 12, 0.74)),
        url("${assetUrl('assets/waiting.webp')}") center / cover no-repeat;
      font-family: "Zpix", "Segoe UI", sans-serif;
      text-align: center;
      overflow: hidden;
    }

    .paradice-bootstrap__panel {
      position: relative;
      z-index: 1;
      width: min(560px, calc(100vw - 40px));
      min-height: 320px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 44px 42px;
      border: 1px solid rgba(255, 233, 172, 0.38);
      border-radius: 18px;
      background:
        linear-gradient(180deg, rgba(25, 34, 31, 0.68), rgba(12, 18, 20, 0.82)),
        rgba(19, 32, 33, 0.9);
      box-shadow: 0 22px 56px rgba(0, 0, 0, 0.38), 0 0 42px rgba(255, 219, 112, 0.28);
      backdrop-filter: blur(2px);
    }

    .paradice-bootstrap__logo {
      width: min(310px, 72vw);
      max-height: 112px;
      object-fit: contain;
      image-rendering: pixelated;
      filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.42));
    }

    .paradice-bootstrap__brand {
      margin: 0;
      color: #f6df9e;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .paradice-bootstrap__title {
      margin: 0;
      color: #fff7d6;
      font-size: clamp(22px, 4vw, 34px);
      line-height: 1.25;
      letter-spacing: 0.04em;
      text-shadow: 0 4px 0 rgba(54, 35, 25, 0.74), 0 14px 24px rgba(0, 0, 0, 0.38);
    }

    .paradice-bootstrap__message {
      min-height: 22px;
      margin: 0;
      color: #ead8a0;
      font-size: 14px;
      line-height: 1.7;
    }

    .paradice-bootstrap__bar {
      width: min(360px, 100%);
      height: 10px;
      overflow: hidden;
      border: 1px solid rgba(255, 247, 214, 0.35);
      border-radius: 8px;
      background: rgba(255, 247, 214, 0.1);
    }

    .paradice-bootstrap__fill {
      width: 0%;
      height: 100%;
      background: linear-gradient(90deg, #d79b42, #f6df9e, #fff7d6);
      box-shadow: 0 0 14px rgba(246, 223, 158, 0.68);
      transition: width 160ms ease;
    }

    .paradice-bootstrap__dice-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-height: 58px;
    }

    .paradice-bootstrap__dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #f6df9e;
      box-shadow: 0 0 14px rgba(246, 223, 158, 0.7);
      animation: paradice-bootstrap-dot 900ms ease-in-out infinite;
    }

    .paradice-bootstrap__dot:nth-child(2) {
      animation-delay: 140ms;
    }

    .paradice-bootstrap__dot:nth-child(3) {
      animation-delay: 280ms;
    }

    .paradice-bootstrap__dice {
      width: 72px;
      height: 58px;
      object-fit: contain;
      image-rendering: pixelated;
      filter: drop-shadow(0 10px 10px rgba(0, 0, 0, 0.38));
    }

    @keyframes paradice-bootstrap-dot {
      0%, 100% {
        opacity: 0.35;
        transform: translateY(0) scale(0.86);
      }

      50% {
        opacity: 1;
        transform: translateY(-5px) scale(1.08);
      }
    }

    .paradice-bootstrap__button {
      align-self: center;
      min-height: 38px;
      padding: 10px 22px;
      color: #fff7d6;
      background: rgba(255, 247, 214, 0.1);
      border: 1px solid rgba(255, 247, 214, 0.35);
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
    }
  `;
  document.head.appendChild(styleElement);
}

function renderBootstrapShell(): void {
  ensureBootstrapStyle();
  playStartBgm();

  rootElement.innerHTML = `
    <main class="paradice-bootstrap" aria-live="polite">
      <section class="paradice-bootstrap__panel">
        <img class="paradice-bootstrap__logo" src="${assetUrl('assets/logo.png')}" alt="ParaDiced" />
        <p class="paradice-bootstrap__brand">ParaDiced</p>
        <h1 class="paradice-bootstrap__title">正在准备游戏资源</h1>
        <p class="paradice-bootstrap__message" data-bootstrap-message>正在初始化资源缓存...</p>
        <div class="paradice-bootstrap__dice-row" aria-hidden="true">
          <span class="paradice-bootstrap__dot"></span>
          <span class="paradice-bootstrap__dot"></span>
          <span class="paradice-bootstrap__dot"></span>
          <img class="paradice-bootstrap__dice" src="${assetUrl('assets/dice/gold_rotate.gif')}" alt="" />
        </div>
        <div class="paradice-bootstrap__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-bootstrap-progress>
          <div class="paradice-bootstrap__fill" data-bootstrap-fill></div>
        </div>
        <button class="paradice-bootstrap__button" type="button" data-bootstrap-retry hidden>重试</button>
      </section>
    </main>
  `;
}

function setBootstrapProgress(loaded: number, total: number, message?: string): void {
  const percent = total <= 0 ? 100 : Math.round((loaded / total) * 100);
  const messageElement = rootElement.querySelector<HTMLElement>('[data-bootstrap-message]');
  const progressElement = rootElement.querySelector<HTMLElement>('[data-bootstrap-progress]');
  const fillElement = rootElement.querySelector<HTMLElement>('[data-bootstrap-fill]');

  if (messageElement) {
    messageElement.textContent = message || `已缓存 ${loaded} / ${total}`;
  }
  if (progressElement) {
    progressElement.setAttribute('aria-valuenow', String(percent));
  }
  if (fillElement) {
    fillElement.style.width = `${percent}%`;
  }
}

function showBootstrapError(message: string): void {
  if (!rootElement.querySelector('[data-bootstrap-retry]')) {
    renderBootstrapShell();
  }

  setBootstrapProgress(0, 1, message);
  const retryButton = rootElement.querySelector<HTMLButtonElement>('[data-bootstrap-retry]');
  if (!retryButton) return;

  retryButton.hidden = false;
  retryButton.focus();
}

function clearBootstrapShell(): void {
  rootElement.replaceChildren();
  document.getElementById(BOOT_STYLE_ID)?.remove();
}

async function mountApp(): Promise<void> {
  clearBootstrapShell();
  await import('./main');
}

async function fetchManifest(): Promise<WebVersionManifest> {
  const response = await fetch(resolveBaseUrl('version.json'), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`版本文件读取失败：HTTP ${response.status}`);
  }

  return parseManifest(await response.json());
}

function getCacheName(releaseId: string): string {
  return `${CACHE_PREFIX}${releaseId}`;
}

function getMetaRequestUrl(): string {
  return toAbsoluteUrl(resolveBaseUrl(META_RESOURCE_PATH));
}

async function readCacheMetadata(): Promise<WebCacheMetadata | null> {
  const metaCache = await caches.open(META_CACHE_NAME);
  const response = await metaCache.match(getMetaRequestUrl());
  if (!response?.ok) return null;

  try {
    const metadata = await response.json();
    return isCacheMetadata(metadata) ? metadata : null;
  } catch {
    return null;
  }
}

async function writeCacheMetadata(metadata: WebCacheMetadata): Promise<void> {
  const metaCache = await caches.open(META_CACHE_NAME);
  const response = new Response(JSON.stringify(metadata), {
    headers: { 'Content-Type': 'application/json' },
  });
  await metaCache.put(getMetaRequestUrl(), response);
}

function resolveManifestResourceUrls(manifest: WebVersionManifest): string[] {
  const publicAssetUrls = manifest.public_assets.map((path) => toAbsoluteUrl(assetUrl(path)));
  const buildAssetUrls = manifest.build_assets.map((path) => toAbsoluteUrl(resolveBaseUrl(path)));

  return [...new Set([...publicAssetUrls, ...buildAssetUrls])];
}

async function getCachedResourceUrls(cacheName: string, resourceUrls: string[]): Promise<Set<string>> {
  const resourceCache = await caches.open(cacheName);
  const cachedUrls = new Set<string>();

  await Promise.all(
    resourceUrls.map(async (url) => {
      const response = await resourceCache.match(url);
      if (response?.ok) {
        cachedUrls.add(url);
      }
    }),
  );

  return cachedUrls;
}

async function isCacheComplete(cacheName: string, resourceUrls: string[]): Promise<boolean> {
  const cachedUrls = await getCachedResourceUrls(cacheName, resourceUrls);
  return cachedUrls.size === resourceUrls.length;
}

function isMetadataCurrent(
  metadata: WebCacheMetadata | null,
  manifest: WebVersionManifest,
  cacheName: string,
  resourceUrls: string[],
): metadata is WebCacheMetadata {
  return (
    !!metadata &&
    metadata.release_id === manifest.release_id &&
    metadata.cache_name === cacheName &&
    metadata.base_path === manifest.base_path &&
    sameStringArray(metadata.resource_urls, resourceUrls)
  );
}

async function cacheMissingResources(cacheName: string, resourceUrls: string[]): Promise<void> {
  const resourceCache = await caches.open(cacheName);
  const cachedUrls = await getCachedResourceUrls(cacheName, resourceUrls);
  const missingUrls = resourceUrls.filter((url) => !cachedUrls.has(url));
  let loaded = cachedUrls.size;
  let nextIndex = 0;

  setBootstrapProgress(loaded, resourceUrls.length, `正在写入资源缓存... ${loaded} / ${resourceUrls.length}`);

  async function worker(): Promise<void> {
    while (nextIndex < missingUrls.length) {
      const resourceIndex = nextIndex;
      nextIndex += 1;
      const resourceUrl = missingUrls[resourceIndex];
      const response = await fetch(new Request(resourceUrl, { cache: 'reload' }));
      if (!response.ok) {
        throw new Error(`${resourceUrl} 返回 HTTP ${response.status}`);
      }

      await resourceCache.put(resourceUrl, response);
      loaded += 1;
      setBootstrapProgress(loaded, resourceUrls.length, `正在写入资源缓存... ${loaded} / ${resourceUrls.length}`);
    }
  }

  const workerCount = Math.min(PRELOAD_CONCURRENCY, missingUrls.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
}

async function deleteOldParadiceCaches(currentCacheName: string): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(async (cacheName) => {
      if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== currentCacheName) {
        await caches.delete(cacheName);
      }
    }),
  );
}

function notifyServiceWorkerCacheReady(metadata: WebCacheMetadata): void {
  navigator.serviceWorker.controller?.postMessage({
    type: CACHE_READY_MESSAGE,
    metadata,
  });
}

function waitForControllerChange(): Promise<void> {
  if (navigator.serviceWorker.controller) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      reject(new Error('资源缓存服务启动超时，请刷新后重试'));
    }, SERVICE_WORKER_TIMEOUT_MS);

    const onControllerChange = () => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  });
}

async function ensureServiceWorkerControl(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    throw new Error('当前浏览器不支持资源缓存，请升级浏览器或使用桌面版');
  }

  const scriptUrl = toAbsoluteUrl(resolveBaseUrl('paradice-sw.js'));
  const scopeUrl = toAbsoluteUrl(normalizedBaseUrl());
  const registration = await navigator.serviceWorker.register(scriptUrl, {
    scope: scopeUrl,
    updateViaCache: 'none',
  });

  await registration.update();
  await navigator.serviceWorker.ready;
  await waitForControllerChange();
}

function preloadLink(
  url: string,
  options: { rel: string; as?: string; type?: string; crossOrigin?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    let settled = false;
    const timeout = window.setTimeout(() => settle(new Error(`${url} 预加载超时`)), BROWSER_PRELOAD_TIMEOUT_MS);

    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    link.rel = options.rel;
    link.href = url;
    if (options.as) link.as = options.as;
    if (options.type) link.type = options.type;
    if (options.crossOrigin) link.crossOrigin = options.crossOrigin;
    link.onload = () => settle();
    link.onerror = () => settle(new Error(`${url} 浏览器预加载失败`));
    document.head.appendChild(link);
  });
}

async function preloadImageForRender(url: string): Promise<void> {
  await preloadLink(url, { rel: 'preload', as: 'image' });

  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
}

async function preloadFontForRender(url: string): Promise<void> {
  const isWoff2 = WOFF2_EXTENSION_PATTERN.test(url);
  await preloadLink(url, {
    rel: 'preload',
    as: 'font',
    type: isWoff2 ? 'font/woff2' : undefined,
    crossOrigin: 'anonymous',
  });

  if (typeof FontFace === 'undefined') return;

  const fontFace = new FontFace('Zpix', `url("${url}")`, {
    display: 'swap',
    style: 'normal',
    weight: '400',
  });
  const loadedFont = await fontFace.load();
  document.fonts.add(loadedFont);
}

async function preloadBuildAssetForRender(url: string): Promise<void> {
  if (/\.js(?:[?#]|$)/i.test(url)) {
    await preloadLink(url, { rel: 'modulepreload' });
    return;
  }

  if (/\.css(?:[?#]|$)/i.test(url)) {
    await preloadLink(url, { rel: 'preload', as: 'style' });
  }
}

async function preloadPublicAssetForRender(url: string): Promise<void> {
  if (IMAGE_EXTENSION_PATTERN.test(url)) {
    await preloadImageForRender(url);
    return;
  }

  if (FONT_EXTENSION_PATTERN.test(url)) {
    await preloadFontForRender(url);
  }
}

async function runWithConcurrency(
  items: string[],
  limit: number,
  worker: (item: string) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
}

async function preloadRenderableResources(manifest: WebVersionManifest): Promise<void> {
  const buildAssetUrls = manifest.build_assets.map((path) => resolveBaseUrl(path));
  const publicAssetUrls = manifest.public_assets.map((path) => assetUrl(path));

  setBootstrapProgress(1, 1, '资源缓存完成，正在准备渲染...');
  await Promise.all([
    ...buildAssetUrls.map((url) => preloadBuildAssetForRender(url)),
    runWithConcurrency(publicAssetUrls, RENDER_PRELOAD_CONCURRENCY, preloadPublicAssetForRender),
  ]);
}

async function runWebBootstrap(): Promise<void> {
  renderBootstrapShell();
  setBootstrapProgress(0, 1, '正在初始化资源缓存...');
  await ensureServiceWorkerControl();

  setBootstrapProgress(0, 1, '正在读取资源版本...');
  const manifest = await fetchManifest();
  setAssetVersion(manifest.release_id);
  const cacheName = getCacheName(manifest.release_id);
  const resourceUrls = resolveManifestResourceUrls(manifest);

  setBootstrapProgress(0, resourceUrls.length, '正在检查本地资源缓存...');
  const metadata = await readCacheMetadata();
  if (
    isMetadataCurrent(metadata, manifest, cacheName, resourceUrls) &&
    (await isCacheComplete(cacheName, resourceUrls))
  ) {
    setBootstrapProgress(1, 1, '资源缓存已就绪，正在进入游戏...');
    notifyServiceWorkerCacheReady(metadata);
    await mountApp();
    return;
  }

  await cacheMissingResources(cacheName, resourceUrls);
  if (!(await isCacheComplete(cacheName, resourceUrls))) {
    throw new Error('资源缓存完整性检查失败，请重试');
  }

  const nextMetadata: WebCacheMetadata = {
    release_id: manifest.release_id,
    cache_name: cacheName,
    base_path: manifest.base_path,
    resource_urls: resourceUrls,
    completed_at: new Date().toISOString(),
  };
  await writeCacheMetadata(nextMetadata);
  notifyServiceWorkerCacheReady(nextMetadata);
  await deleteOldParadiceCaches(cacheName);
  await preloadRenderableResources(manifest);
  await mountApp();
}

async function start(): Promise<void> {
  if (import.meta.env.DEV || isWailsRuntime()) {
    setAssetVersion(null);
    await mountApp();
    return;
  }

  const run = async () => {
    try {
      await runWebBootstrap();
    } catch (error) {
      const message = error instanceof Error ? error.message : '资源加载失败，请检查网络后重试';
      showBootstrapError(message);
      const retryButton = rootElement.querySelector<HTMLButtonElement>('[data-bootstrap-retry]');
      if (retryButton) {
        retryButton.onclick = () => {
          void run();
        };
      }
    }
  };

  await run();
}

void start();
