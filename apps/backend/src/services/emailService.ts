/**
 * Email service — Resend-based outgoing mail
 *
 * Decision Context:
 * - Why: Supabase's built-in SMTP is per-IP rate-limited (~2 emails/hr on the local default,
 *   low tiers on hosted) and the backend is a single IP origin. Moving send to Resend lets us
 *   scale delivery and own templates/localization. Supabase remains the auth provider, but
 *   transactional email responsibility now lives in this service.
 * - Pattern: Pure data in, Resend SDK call out. No DB writes here — resolvers/controllers
 *   trigger emails as a side effect *after* their own persistence step succeeds. Failures are
 *   logged and swallowed so email outages do not block user-facing flows (registration,
 *   password reset). Callers that require strict delivery guarantees should await the returned
 *   `EmailResult` and branch on `success`.
 * - Constraints: `RESEND_FROM_EMAIL` must be on a domain verified in the Resend dashboard.
 *   Bodies are plain HTML strings (no templating engine) — keep them short and tested manually
 *   until a template library is introduced.
 * - Previously fixed bugs: none relevant.
 */

import { resend, RESEND_FROM } from '../config/resend.js';

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

async function send({ to, subject, html }: SendArgs): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(
        `[emailService.send] Resend error for to=${to} subject="${subject}":`,
        error.message,
      );
      return { success: false, error: error.message };
    }

    console.info(
      `[emailService.send] Delivered to=${to} subject="${subject}" id=${data?.id ?? 'unknown'}`,
    );
    return { success: true, id: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    console.error(
      `[emailService.send] Unexpected failure for to=${to} subject="${subject}":`,
      message,
    );
    return { success: false, error: message };
  }
}

export const emailService = {
  /**
   * Sends a welcome email after a successful club-admin registration.
   * Non-blocking: callers typically fire-and-log, so registration is not rolled back if mail fails.
   */
  async sendWelcomeEmail(to: string, displayName: string, clubName: string): Promise<EmailResult> {
    const subject = '¡Bienvenido a Sumate Ya!';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h1 style="color: #0f766e; margin-bottom: 0.5rem;">¡Hola ${escapeHtml(displayName)}!</h1>
        <p>Gracias por registrar <strong>${escapeHtml(clubName)}</strong> en Sumate Ya.</p>
        <p>Ya podés iniciar sesión y empezar a organizar partidos, gestionar tu club y conectar con jugadores.</p>
        <p style="margin-top: 2rem; color: #555;">Equipo Sumate Ya</p>
      </div>
    `;

    return send({ to, subject, html });
  },

  /**
   * Sends a password reset email containing the recovery link.
   * Reset token generation happens upstream — this service only delivers the message.
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<EmailResult> {
    const subject = 'Recuperá tu contraseña — Sumate Ya';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h1 style="color: #0f766e;">Recuperación de contraseña</h1>
        <p>Recibimos una solicitud para restablecer tu contraseña. Si no fuiste vos, ignorá este correo.</p>
        <p>
          <a href="${escapeAttribute(resetUrl)}" style="display: inline-block; padding: 10px 18px; background: #0f766e; color: #fff; text-decoration: none; border-radius: 6px;">
            Restablecer contraseña
          </a>
        </p>
        <p style="color: #555; font-size: 0.9rem;">Este enlace expira en 1 hora.</p>
      </div>
    `;

    return send({ to, subject, html });
  },
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(input: string): string {
  return escapeHtml(input);
}
