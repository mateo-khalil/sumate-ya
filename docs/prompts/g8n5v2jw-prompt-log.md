# Prompt Log

- Timestamp: 2026-05-30 23:30:00
- Task ID: g8n5v2jw

## User Prompt

> [Screenshot equipo MIC en equipos/id] Siendo capitán del equipo MIC no me deja sumarme a un torneo aunque sea 5 vs 5 y mi cuadro cuente con la cantidad solicitada. Además si soy yo quien creo el torneo no me auto anota.

## Agent Main Actions

- Identificó bug raíz del error "Uno o más jugadores no existen o no tienen rol de jugador": tournamentRepository.getPlayerProfilesByIds filtraba por .eq('role','player'), bloqueando a usuarios con role='club_admin' de ser miembros de equipos de torneo aunque el spec (issue #137) dice explícitamente que club_admins pueden ser capitanes de equipos. Fix: eliminó el filtro de rol, actualizó mensaje de error a 'no se encontraron en el sistema'.
- Implementó auto-inscripción en tournamentService.createTournament: después de crear el torneo, verifica si el creador es capitán de un equipo permanente (teamRepository.getTeamsByCaptainId) y si lo es, lo inscribe automáticamente via enrollPermanentTeamInTournament; falla silenciosamente (console.warn) para no bloquear la creación del torneo.
- Typecheck backend 0 errores; ambos fixes en un commit.
