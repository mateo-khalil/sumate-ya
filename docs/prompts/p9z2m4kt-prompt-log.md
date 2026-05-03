# Prompt Log

- Timestamp: 2026-05-03 20:35:00
- Task ID: p9z2m4kt

## User Prompt

> asegurate de mostrar la foto de perfil de los clubes en los partidos, como dentro de un circulo en estas cards y en la pagina de detalle de partido tmb [imágenes de listado de partidos y detalle]. Follow-up: el texto se ve horrible cuando tiene la tag de completo.

## Agent Main Actions

- Backend: añadí `imageUrl` a `CLUB_COLUMNS` / `CLUB_DETAIL_COLUMNS` en `matchRepository.ts` (con `ClubRow.imageUrl`), y propagué el campo en `toMatch` y `toMatchDetail` del `matchService` para que el resolver `Match.club` exponga el avatar tanto en listas como en detalle.
- Frontend: extendí `GET_MATCHES`, `GET_MATCHES_WITH_COORDS` y `GET_MATCH_DETAIL` (y los tipos `Match` / `MatchDetailData.club`) para traer `imageUrl`; añadí `ClubAvatar` circular (con fallback a inicial) en `MatchCard.tsx` y un avatar circular en `ClubLocationCard.astro` para la página de detalle.
- Follow-up de UX: moví los badges (`Completo`, `5v5`) a una fila propia encima del título y avatar — antes competían por el ancho con el título, dejando "Partido E1 (seed E2E) — usado por tests..." quebrado en columnas verticales.
