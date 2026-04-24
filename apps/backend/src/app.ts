import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { applyApolloMiddleware } from './graphql/server.js';
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';

const app = express();

app.use(cors());
// 4 MB limit: base64-encoded 2 MB images decode to ~2.7 MB; the extra headroom avoids
// 413 errors from express.json()'s default 100 KB ceiling.
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
