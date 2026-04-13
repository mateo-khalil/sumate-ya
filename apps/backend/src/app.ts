import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { applyApolloMiddleware } from './graphql/server.js';

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

export default app;
