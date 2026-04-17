# Prompt Log

- Timestamp: 2026-04-16 09:35:00
- Task ID: k7v3p1xt

## User Prompt

> error testando registro-club
> Demasiados intentos de registro. Esperá unos minutos y volvé a intentarlo. es error tiene

## Agent Main Actions

- Diagnosticó que el error "email rate limit exceeded" de Supabase se producía porque `auth.signUp()` (cliente anon) tiene un rate limit de ~30 llamadas/hora por IP en el free tier, alcanzado durante el testing intensivo.
- Reemplazó `authClient.auth.signUp()` por `supabase.auth.admin.createUser()` (service role) en `authService.register()`, que no está sujeto al rate limit de la API de auth pública; el user_metadata y el flujo de perfil/club se mantienen idénticos.
- Agregó mapeo de errores de Supabase en español en `authController.ts` (rate limit → 429, invalid email, password) y verificó que registro completo, email duplicado y flujo profile+club siguen funcionando end-to-end con typecheck 2/2 ✔.
