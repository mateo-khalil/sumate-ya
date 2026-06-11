import client from 'prom-client';

export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({
  register: metricsRegistry,
});

const durationBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled by the backend.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: durationBuckets,
  registers: [metricsRegistry],
});

const graphqlRequestsTotal = new client.Counter({
  name: 'graphql_requests_total',
  help: 'Total GraphQL operations handled by Apollo.',
  labelNames: ['operation_name', 'operation_type', 'status'] as const,
  registers: [metricsRegistry],
});

const graphqlRequestDurationSeconds = new client.Histogram({
  name: 'graphql_request_duration_seconds',
  help: 'GraphQL operation duration in seconds.',
  labelNames: ['operation_name', 'operation_type', 'status'] as const,
  buckets: durationBuckets,
  registers: [metricsRegistry],
});

const redisCacheRequestsTotal = new client.Counter({
  name: 'redis_cache_requests_total',
  help: 'Redis cache read results.',
  labelNames: ['result', 'cache_prefix'] as const,
  registers: [metricsRegistry],
});

const redisCacheOperationsTotal = new client.Counter({
  name: 'redis_cache_operations_total',
  help: 'Redis cache operations by status.',
  labelNames: ['operation', 'status', 'cache_prefix'] as const,
  registers: [metricsRegistry],
});

const redisAvailable = new client.Gauge({
  name: 'redis_available',
  help: 'Whether the backend currently considers Redis available (1) or unavailable (0).',
  registers: [metricsRegistry],
});

const supabaseRequestsTotal = new client.Counter({
  name: 'supabase_requests_total',
  help: 'Total Supabase HTTP requests made by the backend.',
  labelNames: ['client_scope', 'service', 'method', 'status_code', 'status'] as const,
  registers: [metricsRegistry],
});

const supabaseRequestDurationSeconds = new client.Histogram({
  name: 'supabase_request_duration_seconds',
  help: 'Supabase HTTP request duration in seconds.',
  labelNames: ['client_scope', 'service', 'method', 'status_code', 'status'] as const,
  buckets: durationBuckets,
  registers: [metricsRegistry],
});

redisAvailable.set(0);

export function observeHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number,
): void {
  const labels = {
    method,
    route,
    status_code: String(statusCode),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

export function observeGraphqlRequest(input: {
  operationName: string;
  operationType: string;
  status: 'ok' | 'error';
  durationSeconds: number;
}): void {
  const labels = {
    operation_name: input.operationName,
    operation_type: input.operationType,
    status: input.status,
  };

  graphqlRequestsTotal.inc(labels);
  graphqlRequestDurationSeconds.observe(labels, input.durationSeconds);
}

export function recordRedisCacheRequest(result: 'hit' | 'miss', cachePrefix: string): void {
  redisCacheRequestsTotal.inc({ result, cache_prefix: cachePrefix });
}

export function recordRedisCacheOperation(
  operation: 'get' | 'set' | 'delete' | 'delete_pattern',
  status: 'ok' | 'disabled' | 'error',
  cachePrefix: string,
): void {
  redisCacheOperationsTotal.inc({ operation, status, cache_prefix: cachePrefix });
}

export function setRedisAvailability(available: boolean): void {
  redisAvailable.set(available ? 1 : 0);
}

export function createInstrumentedSupabaseFetch(clientScope: 'server' | 'anon' | 'user'): typeof fetch {
  return async (input, init) => {
    const startedAt = process.hrtime.bigint();
    const method = normalizeFetchMethod(input, init);
    const service = classifySupabaseService(input);

    try {
      const response = await fetch(input, init);
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const statusCode = String(response.status);
      const status = response.ok ? 'ok' : 'error';

      supabaseRequestsTotal.inc({
        client_scope: clientScope,
        service,
        method,
        status_code: statusCode,
        status,
      });
      supabaseRequestDurationSeconds.observe(
        {
          client_scope: clientScope,
          service,
          method,
          status_code: statusCode,
          status,
        },
        durationSeconds,
      );

      return response;
    } catch (error) {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

      supabaseRequestsTotal.inc({
        client_scope: clientScope,
        service,
        method,
        status_code: 'network_error',
        status: 'error',
      });
      supabaseRequestDurationSeconds.observe(
        {
          client_scope: clientScope,
          service,
          method,
          status_code: 'network_error',
          status: 'error',
        },
        durationSeconds,
      );

      throw error;
    }
  };
}

export async function renderMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

export const metricsContentType = metricsRegistry.contentType;

function normalizeFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function classifySupabaseService(input: RequestInfo | URL): string {
  const url = getUrl(input);
  if (!url) return 'unknown';

  if (url.pathname.includes('/auth/v1/')) return 'auth';
  if (url.pathname.includes('/storage/v1/')) return 'storage';
  if (url.pathname.includes('/rest/v1/rpc/')) return 'rpc';
  if (url.pathname.includes('/rest/v1/')) return 'rest';
  if (url.pathname.includes('/realtime/v1/')) return 'realtime';

  return 'other';
}

function getUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return input;
    if (typeof input === 'string') return new URL(input);
    return new URL(input.url);
  } catch {
    return null;
  }
}

