# Prompt Log

- Timestamp: 2026-04-24 13:45:00
- Task ID: m4t7q2rb

## User Prompt

> dime la direcion para ver perfil de usuario
> [screenshot home autenticada]
> no viuaizo "Mi Perfil" ni tampoco una navbar
> [screenshot /partidos logueado mostrando "Iniciar Sesión" en lugar de "Mi Perfil"]
> no no aparece

## Agent Main Actions

- Diagnóstico: en `/partidos` aparecía el botón "Iniciar Sesión" a pesar de tener sesión válida. Causa raíz: `middleware.ts` hacía `return next()` temprano para rutas no incluidas en `PROTECTED_ROUTES` (como `/partidos`), por lo que `Astro.locals.user` quedaba `undefined` y el topbar caía al branch anónimo.
- Fix en `apps/frontend/src/middleware.ts`: separé resolución de sesión (ahora se ejecuta siempre que haya access token, poblando `locals.user` para rutas públicas) de la aplicación de la guardia (redirect a `/login` solo para `PROTECTED_ROUTES`, role gate intacto). Limpieza de cookies inválidas en cualquier ruta. Actualicé el bloque Decision Context con el bug previo.
- Validación: `pnpm run typecheck` (turbo typecheck --force) verde en backend + codegen. Expliqué al usuario que refrescando `/partidos` debería ver ahora el link "Mi Perfil", el badge del usuario y el botón "Salir".
