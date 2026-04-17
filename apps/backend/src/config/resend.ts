/**
 * Resend client configuration
 *
 * Decision Context:
 * - Why: Email delivery was previously delegated to Supabase Auth (SMTP + built-in templates).
 *   We now own outgoing email directly so we can (a) bypass Supabase per-IP SMTP rate limits,
 *   (b) customize templates in Spanish without Supabase dashboard edits, and (c) decouple
 *   email delivery from the auth provider (easier to swap auth later).
 * - Pattern: Single Resend client instantiated from env (`RESEND_API_KEY`). `RESEND_FROM_EMAIL`
 *   is the verified sender domain address. Both are required at boot — failing fast is better
 *   than silently losing welcome/password emails.
 * - Operational caveats: Resend requires the sender domain to be verified before delivery;
 *   unverified senders return 403 at runtime, not at boot.
 * - Previously fixed bugs: none relevant.
 */

import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;

if (!resendApiKey) {
  throw new Error('Missing RESEND_API_KEY environment variable');
}

if (!resendFromEmail) {
  throw new Error('Missing RESEND_FROM_EMAIL environment variable');
}

export const resend = new Resend(resendApiKey);

export const RESEND_FROM: string = resendFromEmail;
