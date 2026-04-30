/**
 * Authenticated createMatch proxy — POST /api/matches/create
 *
 * Decision Context:
 * - Why: React components running in the browser cannot read the sumateya-access-token
 *   HttpOnly cookie, so they cannot add an Authorization header to direct GraphQL calls.
 *   This server-side route reads the cookie and forwards it as a Bearer token — the same
 *   pattern used by /api/profile/avatar for avatar uploads.
 * - Only the createMatch mutation is forwarded here; public GraphQL queries go through
 *   /api/graphql (no auth needed).
 * - Body passthrough: the full GraphQL request body is forwarded unchanged. Validation
 *   happens in the backend resolver + service.
 * - Previously fixed bugs: none relevant.
 */

import type { APIRoute } from 'astro';
import { ACCESS_TOKEN_COOKIE } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return new Response(
      JSON.stringify({ errors: [{ message: 'No autenticado. Iniciá sesión nuevamente.' }] }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const backendUrl =
    import.meta.env.PRIVATE_BACKEND_URL ||
    (typeof process !== 'undefined' ? process.env.PRIVATE_BACKEND_URL : undefined) ||
    'http://localhost:4000';

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ errors: [{ message: 'Invalid request body' }] }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const upstream = await fetch(`${backendUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/matches/create] Proxy error:', err);
    return new Response(
      JSON.stringify({ errors: [{ message: 'Error de red. Intentá de nuevo.' }] }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
