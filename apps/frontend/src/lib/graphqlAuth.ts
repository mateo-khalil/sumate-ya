/**
 * graphqlAuth — shared authenticated GraphQL fetch helper for club panel React islands.
 *
 * Decision Context:
 * - The club admin hooks (useClubSlots and the new useClubCourts / useClubReservations /
 *   useClubStatistics) all need the same tiny "POST to /api/graphql-auth with a Bearer token,
 *   throw on errors" helper. Rather than re-declare it per hook (as useClubSlots does inline),
 *   the new hooks share this one. The token is passed in via SSR prop because the
 *   sumateya-access-token cookie is HttpOnly and unreadable from JS.
 * - /api/graphql-auth is the authenticated proxy that reliably forwards the token to Apollo.
 * - Previously fixed bugs: none relevant (new helper).
 */

const GQL_ENDPOINT = '/api/graphql-auth';

export async function gqlAuth<TData>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<TData> {
  const res = await fetch(GQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: TData; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('Sin respuesta del servidor');
  return json.data;
}
