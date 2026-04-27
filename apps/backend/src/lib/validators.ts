/**
 * Shared Zod validators for the backend.
 *
 * Decision Context:
 * - Why permissive UUID regex instead of z.string().uuid():
 *   Zod v4 tightened uuid() to enforce RFC 9562 version bits (the 3rd group must start
 *   with 1–8; the 4th group must start with 8/9/a/b). Seeded test UUIDs in this project
 *   (e.g., e1000000-0000-0000-0000-000000000001) have 0 in those positions, which Zod v4
 *   rejects with invalid_format. Postgres only validates hex format + hyphen positions,
 *   so the strict Zod check created a backend-only rejection for valid DB keys.
 * - The regex below matches exactly what Postgres accepts: 32 hex digits split by hyphens
 *   in the 8-4-4-4-12 pattern, case-insensitive.
 * - Previously fixed bugs: Zod v4 uuid() rejected seeded UUIDs, breaking proposeMatchResult
 *   and voteMatchResult for all seeded test data.
 */

import { z } from 'zod';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const uuidSchema = z.string().regex(UUID_RE, 'ID inválido');
