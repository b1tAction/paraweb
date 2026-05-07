const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);
const SECURE_PROTOCOLS = new Set(['https:', 'wss:']);
const ENDPOINT_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

export type NakamaEndpoint = {
  endpoint: string;
  host: string;
  port: string;
  path: string;
  useSSL: boolean;
};

export function parseNakamaEndpoint(input: string): NakamaEndpoint {
  const rawInput = input.trim();
  if (!rawInput) {
    throw new Error('服务器地址不能为空');
  }

  const hasExplicitProtocol = ENDPOINT_PROTOCOL_PATTERN.test(rawInput);
  const parsedUrl = parseEndpointUrl(hasExplicitProtocol ? rawInput : `http://${rawInput}`);

  if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error('仅支持 http、https、ws 或 wss 地址');
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('服务器地址不能包含用户名或密码');
  }
  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error('服务器地址不能包含 query 或 hash');
  }

  const host = parsedUrl.hostname.trim();
  if (!host) {
    throw new Error('服务器地址不能为空');
  }

  const explicitPort = parsedUrl.port.trim();
  const useSSL = inferUseSSL({
    host,
    protocol: parsedUrl.protocol,
    hasExplicitProtocol,
    explicitPort,
  });
  const port = inferPort({
    host,
    protocol: parsedUrl.protocol,
    hasExplicitProtocol,
    explicitPort,
    useSSL,
  });
  validatePort(port);

  const path = normalizeEndpointPath(parsedUrl.pathname, parsedUrl.protocol);
  const endpoint: NakamaEndpoint = {
    endpoint: formatNakamaEndpoint({ host, port, path, useSSL }),
    host,
    port,
    path,
    useSSL,
  };

  return endpoint;
}

export function getNakamaSdkPort(endpoint: Pick<NakamaEndpoint, 'port' | 'path'>): string {
  return endpoint.path ? `${endpoint.port}${endpoint.path}` : endpoint.port;
}

export function getNakamaHttpApiBaseUrl(endpoint: NakamaEndpoint): string {
  const scheme = endpoint.useSSL ? 'https' : 'http';
  return `${scheme}://${endpoint.host}:${endpoint.port}${endpoint.path}/v2`;
}

export function getNakamaWebSocketUrl(endpoint: NakamaEndpoint): string {
  const scheme = endpoint.useSSL ? 'wss' : 'ws';
  return `${scheme}://${endpoint.host}:${endpoint.port}${endpoint.path}/ws`;
}

export function buildNakamaEndpointInput(host: string, port: string, useSSL: boolean): string {
  const normalizedHost = host.trim();
  if (!normalizedHost) return '';
  if (ENDPOINT_PROTOCOL_PATTERN.test(normalizedHost)) return normalizedHost;

  const parsedUrl = parseEndpointUrl(`${useSSL ? 'https' : 'http'}://${normalizedHost}`);
  const normalizedPort = port.trim();
  if (normalizedPort && !parsedUrl.port) {
    parsedUrl.port = normalizedPort;
  }

  return `${parsedUrl.protocol}//${parsedUrl.host}${normalizeEndpointPath(parsedUrl.pathname, parsedUrl.protocol)}`;
}

function parseEndpointUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error('服务器地址格式无效');
  }
}

function inferUseSSL(options: {
  host: string;
  protocol: string;
  hasExplicitProtocol: boolean;
  explicitPort: string;
}): boolean {
  if (options.hasExplicitProtocol) {
    return SECURE_PROTOCOLS.has(options.protocol);
  }
  if (options.explicitPort) {
    return options.explicitPort === '443';
  }
  return !isLocalDevelopmentHost(options.host);
}

function inferPort(options: {
  host: string;
  protocol: string;
  hasExplicitProtocol: boolean;
  explicitPort: string;
  useSSL: boolean;
}): string {
  if (options.explicitPort) return options.explicitPort;
  if (isLocalDevelopmentHost(options.host)) return '17350';
  if (options.hasExplicitProtocol) {
    if (SECURE_PROTOCOLS.has(options.protocol)) return '443';
    return '80';
  }
  return options.useSSL ? '443' : '7350';
}

function normalizeEndpointPath(pathname: string, protocol: string): string {
  const normalized = `/${pathname.replace(/^\/+/, '')}`.replace(/\/+$/, '');
  if (normalized === '/') return '';

  if ((protocol === 'ws:' || protocol === 'wss:') && normalized.endsWith('/ws')) {
    return normalized.slice(0, -3) || '';
  }

  if ((protocol === 'http:' || protocol === 'https:') && normalized.endsWith('/v2')) {
    return normalized.slice(0, -3) || '';
  }

  return normalized;
}

function validatePort(port: string): void {
  if (!/^\d+$/.test(port)) {
    throw new Error('端口必须是数字');
  }

  const value = Number(port);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('端口必须在 1 到 65535 之间');
  }
}

function formatNakamaEndpoint(endpoint: Omit<NakamaEndpoint, 'endpoint'>): string {
  const scheme = endpoint.useSSL ? 'https' : 'http';
  const omitPort = (endpoint.useSSL && endpoint.port === '443') || (!endpoint.useSSL && endpoint.port === '80');
  return `${scheme}://${endpoint.host}${omitPort ? '' : `:${endpoint.port}`}${endpoint.path}`;
}

function isLocalDevelopmentHost(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  if (normalizedHost === 'localhost' || normalizedHost === 'wails.localhost') return true;
  if (normalizedHost === '::1' || normalizedHost === '[::1]') return true;

  const match = normalizedHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;

  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
