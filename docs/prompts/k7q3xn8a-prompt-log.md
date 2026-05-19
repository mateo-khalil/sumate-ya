# Prompt Log

- Timestamp: 2026-05-11 18:55:32
- Task ID: k7q3xn8a

## User Prompt

> Implementá la feature "Confirmar resultado y actualizar stats (votación)" en el repo Sumate Ya. Branch ya creada: `feat/confirmar-resultado-votacion` (basada en main actualizado). La regla del proyecto es leer `apps/backend/CLAUDE.md`, `.claude/rules/backend.md` y `.claude/rules/graphql.md` antes de tocar backend — hacelo.
>
> Refactor del flujo de confirmación de resultado de partido para que (a) sea atómico vía RPC Postgres, (b) incremente stats (`profiles.matchesPlayed/matchesWon`) y (c) inserte notificaciones a todos los participantes, todo dentro de la misma transacción que ya hace confirm-submission / reject-others / update-match.
>
> Reemplazar el bloque líneas 297-329 de matchResultVoteService.ts (4 calls separadas) por una sola RPC `confirm_match_result_submission(submissionId)` con FOR UPDATE locks, idempotencia, manejo de empate, notificaciones tipo `match_result_confirmed`, exclusivamente vía cliente user-scoped.
>
> Marcar @deprecated las funciones huérfanas del repo en este PR. Actualizar tests Vitest (caso normal mock RPC, empate winnersCount=0, idempotencia alreadyConfirmed:true, RPC tira "No hay mayoría", voto sin mayoría). Correr typecheck obligatorio. La migración la aplica el usuario por Supabase MCP — NO ejecutar SQL crudo.

## Agent Main Actions

- Creé la migración `20260511020000_confirm_match_result_rpc.sql` con la función `public.confirm_match_result_submission(uuid)` SECURITY DEFINER que toma FOR UPDATE sobre submission y match, re-valida mayoría dentro del lock, confirma + rechaza siblings + actualiza match + incrementa `matchesPlayed` (y `matchesWon` solo si `winningTeam` es 'a'|'b'), inserta una notificación `match_result_confirmed` por participante, y devuelve un JSONB con `alreadyConfirmed`, `participantCount`, `winnersCount`, `matchId` y `participantIds`.
- Agregué `confirmMatchResultAtomic(submissionId, client)` a `matchResultVoteRepository.ts` con su `ConfirmAtomicResult` y marqué `@deprecated` las funciones huérfanas (`confirmSubmission`, `rejectOtherSubmissions`, `updateMatchWithResult`, `getParticipantIds`). Refactoricé el bloque de mayoría en `matchResultVoteService.ts` para llamar al RPC con el cliente user-scoped, manejar `alreadyConfirmed` como no-op de caches, y propagar errores del RPC sin invalidar caches; actualicé el Decision Context del archivo.
- Actualicé `matchResultVoteService.test.ts`: el mock del repo ahora incluye `confirmMatchResultAtomic`, los casos viejos validan que el RPC se llamó con `(submissionId, supabaseStub)` en lugar de las 4 funciones legacy, y agregué 3 casos nuevos (empate con winnersCount=0, idempotencia con alreadyConfirmed=true sin invalidar match-level caches, RPC rechaza con "No hay mayoría" sin invalidar caches). 37 tests pasan, `turbo typecheck --force` pasa en los 3 paquetes.
