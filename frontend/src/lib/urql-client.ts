/**
 * urql GraphQL client configuration
 *
 * Decision Context:
 * - Why: urql is lightweight and tree-shakeable, good fit for Astro hybrid rendering.
 * - Pattern: Single client instance; use in React islands with Provider or direct execute.
 * - Previously fixed bugs: Added Content-Type header to fix Apollo CSRF protection error.
 */

import { Client, cacheExchange, fetchExchange } from '@urql/core';

const GRAPHQL_ENDPOINT =
  import.meta.env.PUBLIC_GRAPHQL_URL || 'http://localhost:4000/graphql';

/**
 * urql client for GraphQL operations
 */
export const urqlClient = new Client({
  url: GRAPHQL_ENDPOINT,
  exchanges: [cacheExchange, fetchExchange],
  fetchOptions: () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Get token from localStorage if available (client-side only)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return { headers };
  },
});

/**
 * Execute a GraphQL query
 */
export async function executeQuery<TData, TVariables extends object = object>(
  query: string,
  variables?: TVariables
): Promise<TData> {
  const result = await urqlClient.query(query, variables || {}).toPromise();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data as TData;
}
