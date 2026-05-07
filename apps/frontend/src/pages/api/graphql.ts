/**
 * GraphQL proxy — forwards requests to the backend GraphQL endpoint.
 * Used by all React islands for both public queries and authenticated mutations.
 *
 * Decision Context:
 * - Why a proxy: hard-coding the backend URL (localhost:4000) in the React bundle would
 *   break in production. This proxy reads PRIVATE_BACKEND_URL server-side and forwards
 *   the request, keeping the backend address out of client JS.
 * - Auth forwarding: the Authorization header from the incoming request is forwarded
 *   verbatim to the backend so Apollo Server can verify the JWT and populate ctx.user.
 *   Without this, authenticated resolvers (requireAuth) throw "Authentication required"
 *   even when the client sends a valid token.
 * - Previously fixed bugs:
 *   - POST handler did not forward the Authorization header: authenticated queries from
 *     React islands (SlotManager, club admin) always returned "Authentication required"
 *     because the access token lives in an HttpOnly cookie (unreachable from JS/localStorage).
 *     Fix: the proxy reads sumateya-access-token from the request cookies (server-side,
 *     so HttpOnly is accessible) and injects it as Bearer Authorization before forwarding.
 *     A client-supplied Authorization header is still honoured if present (direct API calls).
 */

import type { APIRoute } from 'astro';

export const prerender = false;

function getBackendUrl(): string {
  return (
    import.meta.env.PRIVATE_BACKEND_URL ||
    (typeof process !== 'undefined' ? process.env.PRIVATE_BACKEND_URL : undefined) ||
    'http://localhost:4000'
  );
}

export const GET: APIRoute = async ({ request }) => {
  const backendUrl = getBackendUrl();
  const url = new URL(request.url);

  try {
    const upstream = await fetch(`${backendUrl}/graphql${url.search}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'apollo-require-preflight': 'true',
      },
    });

    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (err) {
    console.error('[api/graphql] Proxy error:', err);
    return new Response(
      JSON.stringify({ errors: [{ message: 'Backend unreachable' }] }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const backendUrl = getBackendUrl();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ errors: [{ message: 'Invalid request body' }] }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Auth injection via Astro locals (set by middleware which reliably reads the HttpOnly cookie).
    // locals.accessToken is populated by middleware before this handler runs for every request
    // where a valid session exists. This sidesteps the mysterious failure of reading the cookie
    // directly in the route handler across different Astro dev/prod execution modes.
    const explicitAuth = request.headers.get('authorization');
    if (explicitAuth) {
      forwardHeaders['Authorization'] = explicitAuth;
    } else if (locals.accessToken) {
      forwardHeaders['Authorization'] = `Bearer ${locals.accessToken}`;
    }

    const upstream = await fetch(`${backendUrl}/graphql`, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/graphql] Proxy error:', err);
    return new Response(
      JSON.stringify({ errors: [{ message: 'Backend unreachable' }] }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
