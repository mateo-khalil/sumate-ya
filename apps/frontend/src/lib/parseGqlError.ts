/**
 * parseGqlError — converts a raw GraphQL error message into a human-readable string.
 *
 * Decision Context:
 * - Why this helper exists: Zod v4 serialises ZodError.message as a JSON array
 *   (e.g., '[{"message":"ID inválido",...}]'). Apollo/GraphQL propagates that raw string
 *   verbatim, so without this helper the UI would show JSON to the user.
 * - The function parses the JSON array and joins the .message fields of each issue.
 *   Plain (non-JSON) error strings fall through unchanged.
 * - Shared by ProposeResultForm and MatchResultsSection to avoid drift between components.
 * - Previously fixed bugs: Zod v4 JSON error array shown raw in UI.
 */

export function parseGqlError(message: string): string {
  try {
    const parsed: unknown = JSON.parse(message);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      typeof (parsed[0] as Record<string, unknown>).message === 'string'
    ) {
      return parsed
        .map((issue: Record<string, unknown>) => String(issue.message))
        .join('. ');
    }
  } catch {
    // not JSON — fall through
  }
  return message;
}
