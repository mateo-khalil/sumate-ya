# Prompt Log

- Timestamp: 2026-05-10 14:15:00
- Task ID: p3n7wq8x

## User Prompt

> revisa el error passe una semana para adelante y diese error
> [screenshot de /panel-club/dashboard mostrando "Invalid request body" al navegar a semana siguiente]

## Agent Main Actions

- Identificó la causa raíz: el middleware de Astro (`src/middleware.ts`) recreaba el objeto Request con `new Request(request, { headers: authHeaders })` para inyectar el header de Authorization en las solicitudes a `/api/graphql`; en Node.js este constructor no transfiere el body ReadableStream, dejando el body vacío. El proxy en `/api/pages/api/graphql.ts` llama `request.json()` que lanza excepción → retorna `{ errors: [{ message: "Invalid request body" }] }`.
- Eliminó la recreación del Request en el middleware: el mecanismo `locals.accessToken` (ya establecido en la misma función cuando el usuario es válido) y el header `Authorization` enviado explícitamente por `useDashboard.ts` son suficientes para forwarding de auth sin corromper el body; el proxy ya usa ambos paths correctamente.
- Verificó con `turbo typecheck --force`: 0 errores, 0 warnings en los archivos modificados.
