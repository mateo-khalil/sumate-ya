# Prompt Log

- Timestamp: 2026-06-22 00:00:00
- Task ID: h4n8v2qd

## User Prompt

> agregá que cuando aprteo en el leadboard me lleve al parfil deljugador deonde peuda ver estaditsticas etc [imagen del ranking "Mejores Jugadores"]
>
> agregá un botón para ver la contraseña escrita [imagen del login]

## Agent Main Actions

- Hice clickeables las filas del leaderboard (`LeaderboardTable.tsx`) envolviéndolas en un `<a href="/perfil/{id}">` que abre el perfil público del jugador (con stats), ajustando CSS de separadores/foco y el bloque Decision Context; el perfil `/perfil/[id].astro` ya existía.
- Agregué un botón de mostrar/ocultar contraseña en `/login` (iconos Eye/EyeOff de lucide, type="button", aria-pressed/aria-label, progressive enhancement) con su script y estilos.
- Actualicé Page Objects y specs e2e (login + leaderboard) con cobertura de navegación al perfil y del toggle de contraseña; `turbo typecheck --force` pasa con 0 errores.
