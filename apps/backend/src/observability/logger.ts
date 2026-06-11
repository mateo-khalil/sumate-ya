import pino from 'pino';

const redactedPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'authorization',
  'cookie',
  'password',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'refreshToken',
  'accessToken',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'sumate-ya-backend',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: redactedPaths,
    censor: '[redacted]',
  },
});

