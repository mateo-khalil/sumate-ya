# Prompt Log

- Timestamp: 2026-04-16 10:05:00
- Task ID: m9r2w5aq

## User Prompt

> ✓ Registro exitoso. Revisá tu email para confirmar tu cuenta antes de iniciar sesión. ⚠ Email o contraseña incorrectos. chequea jp_club@sumateya.com 123456

## Agent Main Actions

- Fijó `authService.login()` para preservar el error original de Supabase: "Email not confirmed" ahora se re-lanza como error distinto en lugar de ser enmascarado como "Invalid login credentials", y `authController` lo mapea a 403 con código `email_not_confirmed` y mensaje en español.
- Actualizó `loginWithBackend()` en `auth.ts` para propagar el código máquina-legible `email_not_confirmed` como mensaje del Error lanzado, de modo que el catch en `login.astro` muestra "Debés confirmar tu email antes de iniciar sesión. Revisá tu casilla de correo." en lugar del error genérico.
- Agregó llamada a `supabase.auth.admin.generateLink({ type: 'signup', email })` en `authService.register()` para enviar el email de confirmación después de `admin.createUser()`, que no lo envía automáticamente (bug silencioso previo). Typecheck 2/2 ✔.
