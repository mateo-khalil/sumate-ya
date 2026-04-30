/**
 * Express app entry
 *
 * Decision Context:
 * - Why: CORS is restricted to a known allow-list (not open wildcard) because auth
 *   cookies are HttpOnly and the routes must not be callable from arbitrary origins in
 *   production. credentials: true is required so browsers send the session when the
 *   frontend fetches the backend from a cross-origin context (e.g., Astro SSR calling
 *   Express locally).
 * - The allow-list combines the explicit FRONTEND_URL env var (production) with the set
 *   of common local dev ports the frontend/manager apps fall back to: Astro auto-bumps
 *   from 4321 → 4322 → 4323 when a port is taken, and the manager (Vite) defaults to
 *   5173. We accept all of these in dev so a port collision does not surface as a
 *   confusing CORS error. Extra entries can be added via FRONTEND_URLS (comma-separated).
 * - JSON limit set to 4 MB: base64-encoded 2 MB images decode to ~2.7 MB; the extra
 *   headroom avoids 413 errors from express.json()'s default 100 KB ceiling.
 * - Previously fixed bugs:
 *   - cors() was called with no options, allowing all origins. Fixed: restricted to
 *     FRONTEND_URL env var with a development default of http://localhost:4321.
 *   - CORS rejected requests when Astro started on 4322 (port 4321 occupied) because
 *     the allow-list was a single value. Fixed: switched to an array allow-list that
 *     includes the common Astro/Vite dev ports.
 */

import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { applyApolloMiddleware } from './graphql/server.js';
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:4321',
  'http://localhost:4322',
  'http://localhost:4323',
  'http://localhost:4324',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:4321',
  'http://127.0.0.1:4322',
  'http://127.0.0.1:4323',
  'http://127.0.0.1:4324',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

const extraOrigins = (process.env.FRONTEND_URLS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = Array.from(
  new Set([
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ...extraOrigins,
    ...DEFAULT_DEV_ORIGINS,
  ]),
);

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      console.warn(`[cors] Blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '4mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Initialize Apollo Server
applyApolloMiddleware(app).catch((err) => {
  console.error('[Apollo] Failed to initialize:', err);
  process.exit(1);
});

export default app;
