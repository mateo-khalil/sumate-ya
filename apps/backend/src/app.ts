/**
 * Express app entry
 *
 * Decision Context:
 * - Why: CORS is restricted to FRONTEND_URL (not open wildcard) because auth cookies are
 *   HttpOnly and the routes must not be callable from arbitrary origins in production.
 *   credentials: true is required so browsers send the session when the frontend fetches
 *   the backend from a cross-origin context (e.g., Astro SSR calling Express locally).
 * - JSON limit set to 4 MB: base64-encoded 2 MB images decode to ~2.7 MB; the extra
 *   headroom avoids 413 errors from express.json()'s default 100 KB ceiling.
 * - Previously fixed bugs:
 *   - cors() was called with no options, allowing all origins. Fixed: restricted to
 *     FRONTEND_URL env var with a development default of http://localhost:4321.
 */

import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { applyApolloMiddleware } from './graphql/server.js';
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:4321';

const app = express();

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
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
