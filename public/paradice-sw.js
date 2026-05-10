const CACHE_PREFIX = 'paradice-assets-';
const META_CACHE_NAME = 'paradice-meta';
const CACHE_READY_MESSAGE = 'PARADICE_CACHE_READY';
const META_RESOURCE_PATH = '__paradice-cache-state__';

let activeMetadata = null;
let activeResourceUrls = new Set();

function getScopeUrl() {
  return new URL(self.registration.scope);
}

function getScopedPath(path) {
  const scopeUrl = getScopeUrl();
  const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
  return `${scopePath}${path}`;
}

function getMetaUrl() {
  return new URL(META_RESOURCE_PATH, self.registration.scope).href;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function isCacheMetadata(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.release_id === 'string' &&
    value.release_id.length > 0 &&
    typeof value.cache_name === 'string' &&
    value.cache_name.startsWith(CACHE_PREFIX) &&
    typeof value.base_path === 'string' &&
    isStringArray(value.resource_urls) &&
    typeof value.completed_at === 'string'
  );
}

function applyMetadata(metadata) {
  activeMetadata = metadata;
  activeResourceUrls = new Set(metadata.resource_urls);
}

async function readActiveMetadata() {
  const metaCache = await caches.open(META_CACHE_NAME);
  const response = await metaCache.match(getMetaUrl());
  if (!response?.ok) return null;

  try {
    const metadata = await response.json();
    return isCacheMetadata(metadata) ? metadata : null;
  } catch {
    return null;
  }
}

async function refreshActiveMetadata() {
  const metadata = await readActiveMetadata();
  if (metadata) {
    applyMetadata(metadata);
  }
  return activeMetadata;
}

async function getActiveMetadata() {
  if (activeMetadata) return activeMetadata;

  return refreshActiveMetadata();
}

function shouldHandleRequest(request) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false;

  const requestUrl = new URL(request.url);
  const scopeUrl = getScopeUrl();
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.href.startsWith(scopeUrl.href)) return false;

  if (requestUrl.pathname === getScopedPath('version.json')) return false;
  if (requestUrl.pathname === getScopedPath('paradice-sw.js')) return false;
  if (requestUrl.pathname === getScopedPath(META_RESOURCE_PATH)) return false;
  if (requestUrl.pathname === getScopedPath('api') || requestUrl.pathname.startsWith(getScopedPath('api/'))) return false;

  return true;
}

async function handleResourceRequest(request) {
  let metadata = await getActiveMetadata();
  if (!metadata || !activeResourceUrls.has(request.url)) {
    metadata = await refreshActiveMetadata();
  }

  if (!metadata || !activeResourceUrls.has(request.url)) {
    return fetch(request);
  }

  const resourceCache = await caches.open(metadata.cache_name);
  const cachedResponse = await resourceCache.match(request.url);
  if (cachedResponse) return cachedResponse;

  return fetch(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await refreshActiveMetadata();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== CACHE_READY_MESSAGE || !isCacheMetadata(data.metadata)) return;

  applyMetadata(data.metadata);
});

self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) return;

  event.respondWith(handleResourceRequest(event.request));
});
