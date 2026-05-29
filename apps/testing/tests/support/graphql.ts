import { expect, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { BACKEND_GRAPHQL_URL } from './constants';

/**
 * GraphQL helpers shared by every spec.
 *
 * Decision Context:
 * - `gqlPost` centralizes the backend GraphQL call. Each spec used to roll its
 *   own with subtly different error handling — some asserted ok(), some didn't,
 *   some checked `errors`, some swallowed them. One helper avoids the drift.
 * - `mockGraphQLOperation` lets a spec mock ONLY one operation (matched by a
 *   substring in `query`) and let everything else go through. This is the
 *   pattern used for joinMatch / leaveMatch / myMatches / createMatch — most
 *   pages issue several GraphQL calls and overriding all of them masks bugs.
 * - `mockGraphQLAll` overrides every request hitting the matched route. Use
 *   for pages that issue a single matches() query (matches-list, match-filters,
 *   matches-map, menu-overview).
 * - `mockGraphQLError` is a thin wrapper for the common `{ errors: [...] }`
 *   shape, kept as a method to make spec intent obvious at the call site.
 * - The mocks return a `payloads` array (live-updated via push) so the test
 *   can `expect.poll(() => payloads.length).toBe(1)` to verify the mutation
 *   actually fired. We also expose `requests` for the all-traffic mocks so
 *   tests can introspect things like `variables.filters.status`.
 * - `NETWORK_ERROR` sentinel: pass instead of a body to abort the request
 *   (matches join-match.spec.ts behavior: simulates dropped connection so the
 *   client-side catch block runs).
 * - Previously fixed bugs: none relevant.
 */

type GraphQLRequest = { query?: string; variables?: unknown; operationName?: string | null };
type MockBody = Record<string, unknown> | 'NETWORK_ERROR';
type MockOptions = { delayMs?: number };

export const NETWORK_ERROR = 'NETWORK_ERROR' as const;

export async function gqlPost<T>(
  request: APIRequestContext,
  query: string,
  variables: Record<string, unknown> | undefined,
  accessToken?: string,
): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
  const response = await request.post(BACKEND_GRAPHQL_URL, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    data: { query, variables },
  });
  return (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
}

/** Variant that asserts the response is healthy and returns `data`. */
export async function gqlPostOrThrow<T>(
  request: APIRequestContext,
  query: string,
  variables?: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  const payload = await gqlPost<T>(request, query, variables, accessToken);
  expect(payload.errors ?? [], 'GraphQL response should have no errors').toHaveLength(0);
  expect(payload.data, 'GraphQL response should have data').toBeTruthy();
  return payload.data as T;
}

function readGraphQLRequest(route: Route): GraphQLRequest {
  const request = route.request();
  const postData = request.postData();

  if (postData) {
    try {
      return JSON.parse(postData) as GraphQLRequest;
    } catch {
      return { query: postData };
    }
  }

  const url = new URL(request.url());
  const variablesParam = url.searchParams.get('variables');

  return {
    operationName: url.searchParams.get('operationName'),
    query: url.searchParams.get('query') ?? undefined,
    variables: variablesParam ? (JSON.parse(variablesParam) as Record<string, unknown>) : undefined,
  };
}

async function fulfillBody(route: Route, body: MockBody, options: MockOptions): Promise<void> {
  if (options.delayMs) {
    await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }
  if (body === NETWORK_ERROR) {
    await route.abort('failed');
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/**
 * Mock ALL traffic hitting `route`. Captures every request body so tests can
 * inspect `variables.filters` / etc.
 */
export async function mockGraphQLAll(
  page: Page,
  route: string | RegExp,
  body: MockBody,
  options: MockOptions = {},
): Promise<{ requests: GraphQLRequest[] }> {
  const requests: GraphQLRequest[] = [];

  await page.unroute(route).catch(() => undefined);
  await page.route(route, async (incoming: Route) => {
    requests.push(readGraphQLRequest(incoming));
    await fulfillBody(incoming, body, options);
  });

  return { requests };
}

/**
 * Mock ONLY the GraphQL operation whose query body contains `operationMarker`.
 * Other GraphQL traffic is allowed through to the real backend. Returns the
 * captured request payloads for assertion.
 */
export async function mockGraphQLOperation(
  page: Page,
  route: string | RegExp,
  operationMarker: string,
  body: MockBody,
  options: MockOptions = {},
): Promise<{ payloads: GraphQLRequest[] }> {
  const payloads: GraphQLRequest[] = [];

  await page.route(route, async (incoming: Route) => {
    const parsed = readGraphQLRequest(incoming);
    if (!parsed.query?.includes(operationMarker)) {
      await incoming.continue();
      return;
    }

    payloads.push(parsed);
    await fulfillBody(incoming, body, options);
  });

  return { payloads };
}

/**
 * Mock SEVERAL operations on the SAME route with one handler. Each entry maps a
 * substring marker (matched against the request `query`) to a response body.
 * Requests that match no marker are passed through to the real backend.
 *
 * Why a single handler instead of stacking `mockGraphQLOperation` twice:
 * Playwright runs route handlers most-recent-first and `route.continue()`
 * TERMINATES routing (it does not cascade to earlier handlers). So two separate
 * `mockGraphQLOperation` registrations on the same route can't both win — the
 * later one's `continue()` for a non-match sends the request to the network
 * instead of falling through to the earlier mock. One handler with internal
 * branching is the only correct way to mock two co-located operations.
 */
export async function mockGraphQLOperations(
  page: Page,
  route: string | RegExp,
  handlers: Array<{ marker: string; body: MockBody }>,
  options: MockOptions = {},
): Promise<{ payloads: GraphQLRequest[] }> {
  const payloads: GraphQLRequest[] = [];

  await page.unroute(route).catch(() => undefined);
  await page.route(route, async (incoming: Route) => {
    const parsed = readGraphQLRequest(incoming);
    const match = handlers.find((h) => parsed.query?.includes(h.marker));
    if (!match) {
      await incoming.continue();
      return;
    }
    payloads.push(parsed);
    await fulfillBody(incoming, match.body, options);
  });

  return { payloads };
}

export type { GraphQLRequest, MockBody, MockOptions };
