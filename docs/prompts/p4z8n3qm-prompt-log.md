# Prompt Log

- Timestamp: 2026-04-18 00:00:00
- Task ID: p4z8n3qm

## User Prompt

> Sos un desarrollador senior fullstack especializado en Astro 6 y Supabase.
> Necesito que implementes la siguiente User Story completa en el proyecto "sumate-ya".
>
> ## User Story
> Como jugador nuevo, quiero registrarme con mi email y contraseña
> para poder acceder a la plataforma y buscar partidos.
>
> ## Stack del proyecto
> - Frontend: Astro 6 con SSR, Tailwind CSS
> - Auth y base de datos: Supabase
> - Validación: Zod
> - Backend: Node.js + Express con endpoints en /api/auth/*
>
> ## Contexto importante del proyecto
> - El registro de club ya está implementado en `/registro-club`
>   y usa el endpoint `POST /api/auth/register` del backend
> - El backend usa `admin.createUser()` con `email_confirm: true`
>   (flujo sin confirmación por email, para desarrollo)
> - Los usuarios se crean con perfil en `public.profiles`
>   con la columna `role` que define el tipo (player / club_admin)
> - El login está en `/login` y redirige según rol:
>   - role `player` → `/partidos`
>   - role `club_admin` → `/panel-club`
> - Existe una política RLS en `profiles` que permite leer el perfil propio
>
> ## Tareas a implementar
>
> ### 1. Backend — nuevo endpoint de registro de jugador
> Crear un endpoint similar al registro de club pero simplificado:
> - Ruta: `POST /api/auth/register-player`
> - Recibe: `{ displayName, email, password }`
> - Crea usuario con `admin.createUser({ email_confirm: true })`
> - Crea perfil en `public.profiles` con:
>   - `id` = auth.users.id
>   - `displayName` = input.displayName
>   - `role` = 'player'
> - NO crea ningún registro en `clubs` (diferencia con el flujo de club_admin)
> - Si falla la creación del perfil, hacer cleanup del usuario en auth
> - Retornar 201 con mensaje "Registro exitoso. Ya podés iniciar sesión."
>
> ### 2. Frontend — pantalla de registro de jugador
> Crear `apps/frontend/src/pages/registro-jugador.astro` con:
> - Formulario POST server-side con campos:
>   - Nombre (displayName)
>   - Email
>   - Contraseña (mínimo 8 caracteres)
>   - Confirmar contraseña
> - Validación con Zod en el servidor
> - Llamada al endpoint `POST /api/auth/register-player` del backend
> - Redirección a `/login?registered=1` tras registro exitoso
> - Mantener el mismo estilo visual que `/registro-club` y `/login`
>
> ### 3. Manejo de errores
> Mostrar mensajes claros en el formulario:
> - Email ya registrado
> - Contraseña menor a 8 caracteres
> - Contraseñas que no coinciden
> - Email con formato inválido
> - Campos obligatorios vacíos
>
> ### 4. Links entre pantallas
> - En `/login` agregar debajo del link "¿Sos un club?" otro link:
>   "¿Sos jugador? Registrate acá" → `/registro-jugador`
> - En `/registro-jugador` agregar link "¿Ya tenés cuenta? Iniciá sesión"
> - En `/registro-club` agregar link "¿Sos jugador? Registrate acá"
>
> ## Restricciones
> - No modificar `middleware.ts`, `lib/supabase.ts` ni el flujo de login
> - Reutilizar el patrón de `/registro-club` pero simplificado
>   (sin datos de club, sin tabla clubs)
> - Usar el mismo estilo visual FIFA que ya está aplicado
> - El endpoint del backend debe seguir el mismo patrón que register de club
>
> Mostrá cada archivo modificado o creado completo.
> Empezá revisando el endpoint de registro de club existente
> para reutilizar el patrón.

## Agent Main Actions

- Added `registerPlayer()` in `authService.ts` (role='player', no clubs row, auth cleanup on profile failure) plus matching `RegisterPlayerSchema` + `registerPlayer` controller and `/register-player` route in the backend.
- Added `registerPlayerWithBackend()` helper in `lib/auth.ts` and created `registro-jugador.astro` SSR page reusing the FIFA card / error-banner style from `registro-club.astro`.
- Wired cross-links in `login.astro` and `registro-club.astro` and ran `turbo typecheck --force` (backend passes; frontend has no typecheck script).
