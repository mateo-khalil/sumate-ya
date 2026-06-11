import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { logger } from './logger.js';
import { metricsContentType, observeHttpRequest, renderMetrics } from './metrics.js';

const idLikeSegmentPattern =
  /\/([0-9a-f]{8}-[0-9a-f-]{13,}|[0-9]{4,}|[A-Za-z0-9_-]{20,})(?=\/|$)/gi;

export function requestObservability(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  const requestId = getRequestId(req);

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = getRouteLabel(req);

    observeHttpRequest(req.method, route, res.statusCode, durationMs / 1000);

    logger.info(
      {
        event: 'http_request',
        requestId,
        req: {
          method: req.method,
          path: getRequestPath(req),
          route,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
        res: {
          statusCode: res.statusCode,
        },
        durationMs,
      },
      'HTTP request completed',
    );
  });

  next();
}

export async function metricsHandler(req: Request, res: Response): Promise<void> {
  const expectedToken = process.env.METRICS_BEARER_TOKEN;

  if (expectedToken) {
    const providedToken = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (providedToken !== expectedToken) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
  }

  res.setHeader('Content-Type', metricsContentType);
  res.send(await renderMetrics());
}

export function errorObservability(
  err: unknown,
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  logger.error(
    {
      event: 'http_error',
      err,
      req: {
        method: req.method,
        path: req.path,
        route: getRouteLabel(req),
      },
    },
    'Unhandled request error',
  );

  next(err);
}

function getRequestId(req: Request): string {
  const incoming = req.get('x-request-id');
  return incoming && incoming.length <= 128 ? incoming : randomUUID();
}

function getRouteLabel(req: Request): string {
  const routePath = req.route?.path;

  if (typeof routePath === 'string') {
    return `${req.baseUrl}${routePath}`;
  }

  const path = getRequestPath(req);
  if (path === '/') return '/';

  return path.replace(idLikeSegmentPattern, '/:id');
}

function getRequestPath(req: Request): string {
  const originalUrl = req.originalUrl || req.url || req.path;
  return originalUrl.split('?')[0] || '/';
}
