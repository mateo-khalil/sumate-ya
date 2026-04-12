import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { applyApolloMiddleware } from './graphql/server.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Initialize Apollo Server
applyApolloMiddleware(app).catch((err) => {
  console.error('[Apollo] Failed to initialize:', err);
  process.exit(1);
});

// Ejemplo: rutas protegidas por JWT
// app.use('/api/partidos', authMiddleware, partidosRouter);
// app.use('/api/club', authMiddleware, clubRouter);

export { authMiddleware };
export default app;
