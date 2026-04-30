# Prompt Log

- Timestamp: 2026-04-24 00:00:00
- Task ID: r3p9n7bk

## User Prompt

> Sos un desarrollador senior fullstack especializado en Astro 6, Supabase y GraphQL. Necesito que implementes la siguiente User Story completa en el proyecto "sumate-ya".
>
> ## User Story
> Como jugador, quiero ver mi perfil con mi nombre, división, partidos jugados y foto para tener un resumen de mi actividad.
>
> ## Stack del proyecto
> - Frontend: Astro 6 con SSR, Tailwind CSS
> - Auth y base de datos: Supabase
> - GraphQL en el backend (existe estructura en `apps/backend/src/graphql/`)
> - UI: shadcn/ui (Avatar + Card)
>
> ## Contexto importante del proyecto
> - El login ya está implementado, autentica via cookies con `getUser()`
> - Los perfiles viven en `public.profiles` con campos: id, displayName, avatarUrl, role, preferredPosition, division, matchesPlayed (y posiblemente matchesWon)
> - El middleware protege rutas, redirige a `/login` si no hay sesión
> - Ya existe la ruta `/partidos` como ejemplo de página protegida
> - Usar SSR (no client-side), ya que requiere datos del usuario autenticado
>
> ## Tareas a implementar
> (revisar schema; Query GraphQL myProfile; página /perfil SSR; componente ProfileCard; middleware; navegación)
>
> ## Restricciones
> - No modificar `lib/supabase.ts`
> - Mantener consistencia visual con el estilo FIFA ya aplicado
> - Usar GraphQL para la obtención de datos, no consulta directa a Supabase desde el frontend
> - Respetar RLS: el resolver debe crear client user-scoped
> - No romper las rutas existentes

## Agent Main Actions

- Inspeccionó la tabla `public.profiles` vía Supabase MCP (confirmó `matchesWon`, enums de role/preferredPosition, y RLS), agregó el schema `profile.graphql` con enums `UserRole` y `PlayerPosition` y la query `myProfile`, y creó `profileRepository` + `profileService` (con cache Redis scopeado por usuario) y el resolver `myProfile` que usa `createUserClient(accessToken)` para respetar RLS. Corrió el codegen del backend.
- En el frontend creó las operations `profile.graphql` y `profile.ts`, el componente `ProfileCard.astro` con estética FIFA (avatar con anillo degradado, pill de división por tier, posición con ícono, winrate con progress bar y null handling) y la página SSR `/perfil.astro` que hace fetch GraphQL directo al backend con el JWT de la cookie y maneja estado de error inline.
- Agregó `/perfil` a `PROTECTED_ROUTES` en `middleware.ts`, insertó link de navegación recíproco entre `/partidos` y `/perfil`, y validó la implementación con `pnpm run typecheck` (turbo typecheck --force) exitoso (backend + codegen).
