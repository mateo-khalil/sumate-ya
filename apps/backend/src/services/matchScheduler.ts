/**
 * Match Scheduler — registers the recurring cron tick that drives auto-cancellation and
 * "faltan jugadores" reminders.
 *
 * Decision Context:
 * - Why node-cron in-process: the backend is a single long-lived Express process with no
 *   existing job infrastructure (no BullMQ, no pg_cron, no edge functions). An in-process
 *   cron is the smallest mechanism that fits and reuses the service-role Supabase client and
 *   the cache/notification helpers already wired into the app.
 * - Cadence: every 5 minutes. The rule windows in matchAutoCancelService carry a ±5min
 *   tolerance so nothing slips between ticks, and the idempotency guards (status-filtered
 *   cancel UPDATE + matchReminders UNIQUE) make overlapping evaluations harmless.
 * - Re-entrancy lock (`isTicking`): a single boolean prevents a slow tick (e.g. a large
 *   cancellation batch) from overlapping the next scheduled fire within this process.
 * - Single-instance assumption: this is designed for one backend instance. If scaled
 *   horizontally, correctness still holds — the cancel UPDATE only transitions open/full
 *   rows once and the reminder UNIQUE constraint elects a single winner — so multiple
 *   instances are redundant (wasted reads) but NOT buggy. Set DISABLE_SCHEDULER=true on the
 *   non-primary instances to avoid the waste.
 * - Test/guarded boot: never starts under NODE_ENV=test (so supertest/vitest don't spin a
 *   timer) or when DISABLE_SCHEDULER=true. A failing tick is caught and logged — it must
 *   never crash the process.
 * - Lives in services/ (not a workers/ folder, which the project structure doesn't define)
 *   and is started from index.ts, NOT app.ts, so importing the Express app in tests does not
 *   register a cron job. See index.ts.
 * - Previously fixed bugs: none relevant (new module).
 */

import cron, { type ScheduledTask } from 'node-cron';
import { runAutoCancelTick, runRemindersTick } from './matchAutoCancelService.js';

const CRON_EXPRESSION = '*/5 * * * *'; // every 5 minutes

let isTicking = false;
let scheduledTask: ScheduledTask | null = null;

/** Runs one full pass (cancellations + reminders), guarded against overlap and crashes. */
export async function runSchedulerTick(now: Date = new Date()): Promise<void> {
  if (isTicking) {
    console.warn('[matchScheduler] previous tick still running — skipping this fire');
    return;
  }
  isTicking = true;
  try {
    await runAutoCancelTick(now);
  } catch (error) {
    console.error('[matchScheduler] auto-cancel tick failed:', error);
  }
  try {
    await runRemindersTick(now);
  } catch (error) {
    console.error('[matchScheduler] reminders tick failed:', error);
  } finally {
    isTicking = false;
  }
}

/**
 * Registers the cron job. No-op (returns false) under NODE_ENV=test or when
 * DISABLE_SCHEDULER=true. Safe to call once at boot.
 */
export function startMatchScheduler(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SCHEDULER === 'true') {
    console.info('[matchScheduler] scheduler disabled (test env or DISABLE_SCHEDULER=true)');
    return false;
  }
  if (scheduledTask) {
    console.warn('[matchScheduler] scheduler already started — ignoring duplicate start');
    return false;
  }

  scheduledTask = cron.schedule(CRON_EXPRESSION, () => {
    void runSchedulerTick();
  });

  console.info(`[matchScheduler] started (cron "${CRON_EXPRESSION}")`);
  return true;
}
