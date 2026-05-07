/**
 * /api/graphql-auth — authenticated GraphQL proxy for React islands.
 *
 * Decision Context:
 * - Why a separate file from /api/graphql: the original proxy (/api/graphql.ts) suffers
 *   from Astro dev hot-reload caching — the route handler module was served from a stale
 *   compiled version that had no auth forwarding. Creating a new file guarantees a fresh
 *   module is compiled and loaded on first request.
 * - Auth strategy (triple-layer):
 *   1. locals.accessToken — set by middleware (proven to work: page renders with user name)
 *   2. Raw Cookie header parse — fallback in case locals isn't populated
 *   3. Explicit Authorization header from caller — for future direct API calls
 * - Used by useClubSlots hook for ALL client-side GraphQL calls (queries + mutations).
 *   The initial page load uses SSR fetch in horarios.astro; this endpoint handles refetch
 *   after mutations and all write operations.
 * - Previously fixed bugs: /api/graphql hot-reload cache prevented auth forwarding to
 *   backend Apollo, causing all client-side mutations to return "Authentication required".
 */

import type { APIRoute } from 'astro';

function getBackendUrl(): string {
  return (
    import.meta.env.PRIVATE_BACKEND_URL ||
    (typeof process !== 'undefined' ? process.env.PRIVATE_BACKEND_URL : undefined) ||
    'http://localhost:4000'
  );
}

/** Parse sumateya-access-token from raw Cookie header */
function extractTokenFromCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;)\s*sumateya-access-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const backendUrl = getBackendUrl();

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
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Layer 1: explicit caller header (highest priority)
    const explicitAuth = request.headers.get('authorization');

    // Layer 2: locals.accessToken set by middleware (proven reliable)
    const localsToken = (locals as { accessToken?: string }).accessToken;

    // Layer 3: raw cookie parse (fallback for edge cases)
    const cookieToken = extractTokenFromCookie(request.headers.get('cookie') ?? '');

    const token = explicitAuth?.replace('Bearer ', '') || localsToken || cookieToken;
    if (token) {
      forwardHeaders['Authorization'] = `Bearer ${token}`;
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
    console.error('[api/graphql-auth] Proxy error:', err);
    return new Response(
      JSON.stringify({ errors: [{ message: 'Backend unreachable' }] }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
