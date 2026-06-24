/**
 * Astro API route — POST /api/club/image
 *
 * Decision Context:
 * - Why a proxy route: React components running in the browser cannot read HttpOnly
 *   cookies, so they cannot attach the access token to a direct call to the backend.
 *   This server-side endpoint reads `sumateya-access-token` from the cookie jar and
 *   forwards it to the backend as an Authorization header, keeping the token out of
 *   client JavaScript entirely.
 * - Mirrors /api/profile/avatar.ts exactly — same proxy pattern, same passthrough
 *   semantics for body and status codes. The only difference is the backend endpoint.
 * - Previously fixed bugs: none relevant.
 */

import type { APIRoute } from 'astro';
import { ACCESS_TOKEN_COOKIE } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'No autenticado. Iniciá sesión nuevamente.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const backendUrl =
    import.meta.env.PRIVATE_BACKEND_URL ||
    (typeof process !== 'undefined' ? process.env.PRIVATE_BACKEND_URL : undefined) ||
    'http://localhost:4000';

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Cuerpo de la solicitud inválido.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const backendResponse = await fetch(`${backendUrl}/api/club/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await backendResponse
      .json()
      .catch(() => ({ error: 'Respuesta inválida del servidor' }));

    return new Response(JSON.stringify(data), {
      status: backendResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de red al subir la imagen';
    console.error('[api/club/image] Proxy error:', message);
    return new Response(JSON.stringify({ error: 'Error de red. Intentá de nuevo.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
