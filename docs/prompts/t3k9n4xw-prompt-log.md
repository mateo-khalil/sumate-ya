# Prompt Log

- Timestamp: 2026-04-26 08:10:00
- Task ID: t3k9n4xw

## User Prompt

> Implementar User Story "Salirse de un partido": mutation leaveMatch con auto-eliminación, cambio full→open, LeaveMatchButton con modal de advertencia < 1h. Stack: Astro 6 + React island, GraphQL Apollo, Supabase RLS, Redis cache.

## Agent Main Actions

- Verificó DB via Management API: `matchParticipants` ya tiene DELETE RLS (`auth.uid() = playerId`), `matches` no tiene DELETE policy (service-role se usa para auto-delete). Creó `leave-match.graphql` con `LeaveMatchInput`, `LeaveMatchResult` (match nullable + matchDeleted: Boolean!) y `extend Mutation.leaveMatch`. Agregó `removeParticipant`, `countParticipants` y `deleteMatch` al matchRepository; implementó `leaveMatch` en matchService con 10 validaciones (auth, UUID, existencia, no-cancelado, inscripción, DELETE user-scoped, conteo, auto-delete si 0, re-open si era full, invalidación de cache); extendió el resolver `match.ts` con `leaveMatch`; ejecutó codegen (3/3 exitoso).
- Creó `LeaveMatchButton.tsx` (React island, `client:load`) con confirmación inline en 3 stages (idle → confirming → loading), advertencia urgente si falta < 60 min, redirect a `/partidos` en caso de auto-eliminación y `window.location.reload()` en caso normal. Actualizó `[id].astro` para mostrar el botón junto al banner "Ya estás inscripto" cuando `isCurrentUserJoined`. Actualizó operaciones GraphQL con `LEAVE_MATCH`. Typecheck final 3/3 ✅. Documentó 10 tests manuales en TESTING.md incluyendo Casos A–D (organizador, último participante, full→open, advertencia temporal).
