import 'dotenv/config';
import app from './app.js';
import { startMatchScheduler } from './services/matchScheduler.js';

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Start the auto-cancel / reminder cron here (NOT in app.ts) so tests that import the
  // Express app via supertest don't register a recurring timer. The scheduler self-guards
  // against NODE_ENV=test and DISABLE_SCHEDULER=true. See services/matchScheduler.ts.
  startMatchScheduler();
});
