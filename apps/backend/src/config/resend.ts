/**
 * Resend client configuration
 *
 * Decision Context:
 * - Why: Email delivery was previously delegated to Supabase Auth (SMTP + built-in templates).
 *   We now own outgoing email directly so we can (a) bypass Supabase per-IP SMTP rate limits,
 *   (b) customize templates in Spanish without Supabase dashboard edits, and (c) decouple
 *   email delivery from the auth provider (easier to swap auth later).
 * - Pattern: Single Resend client instantiated from env (`RESEND_API_KEY`). `RESEND_FROM_EMAIL`
 *   is the verified sender domain address. When either is missing we export `null` and log a
 *   warning instead of throwing — `emailService.send()` checks for `null` and no-ops the call.
 *   Email is intentionally non-blocking for the auth flow (see authService.register comments),
 *   so missing creds in dev/CI must NOT crash the whole backend at module-import time.
 * - Operational caveats: Resend requires the sender domain to be verified before delivery;
 *   unverified senders return 403 at runtime, not at boot. In production, both vars MUST be
 *   set — the warning at boot is the operator's signal that mail is silently disabled.
 * - Previously fixed bugs:
 *   - Throwing at import killed `pnpm dev` (and Playwright's webServer) on any machine without
 *     Resend creds, which broke matches-list E2E tests because login (SSR → Express) returned a
 *     generic error from a dead backend. Switched to warn + null client.
 */

import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;

const isConfigured = Boolean(resendApiKey && resendFromEmail);

if (!isConfigured) {
  console.warn(
    '[config/resend] RESEND_API_KEY and/or RESEND_FROM_EMAIL not set — outgoing email is disabled. ' +
      'Set both env vars in apps/backend/.env to enable transactional email (welcome, password reset).',
  );
}

export const resend: Resend | null = isConfigured ? new Resend(resendApiKey) : null;

export const RESEND_FROM: string = resendFromEmail ?? '';
