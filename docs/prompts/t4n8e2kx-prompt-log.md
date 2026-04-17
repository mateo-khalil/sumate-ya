# Prompt Log

- Timestamp: 2026-04-16 10:45:00
- Task ID: t4n8e2kx

## User Prompt

> Revertir el flujo de registro al estado anterior donde el usuario queda confirmado automáticamente sin necesitar confirmar email.

## Agent Main Actions

- Revirtió `authService.register()` de `signUp()` de vuelta a `admin.createUser({ email_confirm: true })` con creación inmediata de profile + club en el mismo request, incluyendo cleanup de orphaned auth user si algún insert falla.
- Restauró el mensaje de éxito en `authController.ts` a "Registro exitoso. Ya podés iniciar sesión." y revirtió `login.astro` al banner único `?registered=1` eliminando el banner `?confirmed=1` agregado en el intento anterior.
- Eliminó `FRONTEND_URL` de `backend/.env` y `.env.example` ya que solo era necesario para el `emailRedirectTo` del flujo de confirmación. Typecheck 2/2 ✔.
