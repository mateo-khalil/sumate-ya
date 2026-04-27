/**
 * Public GraphQL proxy — forwards requests to the backend GraphQL endpoint.
 * Used by React islands that need to query public data (clubs, clubSlots, matches)
 * without adding the backend URL to the client-side bundle.
 *
 * Decision Context:
 * - Why a proxy: hard-coding the backend URL (localhost:4000) in the React bundle would
 *   break in production. This proxy reads PRIVATE_BACKEND_URL server-side and forwards
 *   the request, keeping the backend address out of client JS.
 * - No auth: this route is for public queries only. Authenticated mutations (createMatch)
 *   go through /api/matches/create which adds the Authorization header from the HttpOnly cookie.
 * - Previously fixed bugs: none relevant.
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

export const POST: APIRoute = async ({ request }) => {
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
    const upstream = await fetch(`${backendUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
