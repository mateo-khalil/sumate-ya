# n6t4q8kp - Home y sesión en torneos

## Prompt

Agregar acceso a torneos desde el home de forma similar a "Ver partidos" y hacer que la pantalla `/torneos` detecte si el usuario esta logueado.

## Cambios

- Agregue una seccion "Torneos Disponibles" en el home con `TournamentList` y boton "Ver todos".
- Pase `isAuthenticated` desde el home al listado de torneos para ajustar el CTA de inscripcion.
- Actualice `TournamentCard` para redirigir a `/login` antes de abrir el formulario si no hay sesion.
- Converti `/torneos` en shell SSR publico para leer `Astro.locals.user`.
- Actualice la topbar de `/torneos` para mostrar acciones de usuario, perfil/panel y logout cuando corresponde.

## Verificacion

- `pnpm.cmd --filter @sumate-ya/frontend typecheck`
- `GET http://localhost:4321/` devolvio 200.
- `GET http://localhost:4321/torneos` devolvio 200.
