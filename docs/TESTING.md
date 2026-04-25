# Testing Manual — User Story: Login y Sesión

> **Estado:** P1–P5 resueltos. Tests T1–T8 desbloqueados. T9–T12 requieren ejecución manual.
>
> | Fix | Estado | Descripción |
> |-----|--------|-------------|
> | P1 — RLS profiles INSERT/UPDATE | ✅ Aplicado via MCP | Políticas `authenticated` creadas |
> | P2 — Logout UI + endpoint | ✅ Ya implementado | Botón "Salir" en topbar + `/api/auth/logout` |
> | P3 — displayName desde profiles | ✅ Corregido | `getUserProfile()` lee `profiles.displayName` |
> | P4 — isProduction() helper | ✅ Implementado | Respeta `PRIVATE_IS_PROD` y `X-Forwarded-Proto` |
> | P5 — JWT verification en GraphQL | ✅ Corregido | `createUserClient().auth.getUser()` — firma validada |

> Pasos para verificar manualmente el flujo completo de autenticación
> después de los fixes P1–P5 + M1–M3.

## Prerequisitos

- Backend corriendo en `http://localhost:4000`
- Frontend corriendo en `http://localhost:4321`
- Al menos un usuario con `role = 'player'` en `profiles`
- Al menos un usuario con `role = 'club_admin'` en `profiles`
- Un usuario con cuenta creada pero email **sin confirmar**

---

## T1 — Login con credenciales válidas (player) ✅ Desbloqueable

1. Navegar a `http://localhost:4321/login`
2. Ingresar email y contraseña del usuario con rol `player`
3. Hacer click en INGRESAR

**Resultado esperado:** Redirect automático a `/partidos`. El topbar muestra el nombre del usuario.

**Falla si:** Se muestra error, o redirige a `/panel-club`.

---

## T2 — Login con credenciales válidas (club_admin) ✅ Desbloqueable

1. Navegar a `http://localhost:4321/login`
2. Ingresar email y contraseña del usuario con rol `club_admin`
3. Hacer click en INGRESAR

**Resultado esperado:** Redirect automático a `/panel-club`. El topbar muestra la pill "CLUB".

**Falla si:** Se muestra error, o redirige a `/partidos`.

---

## T3 — Email inexistente ✅ Desbloqueable

1. Navegar a `http://localhost:4321/login`
2. Ingresar un email que no existe + cualquier contraseña
3. Hacer click en INGRESAR

**Resultado esperado:** Banner de error con el texto "Email o contraseña incorrectos."

**Falla si:** Aparece un error técnico, o el backend expone si el email existe o no.

---

## T4 — Contraseña incorrecta ✅ Desbloqueable

1. Navegar a `http://localhost:4321/login`
2. Ingresar un email válido + contraseña incorrecta
3. Hacer click en INGRESAR

**Resultado esperado:** Banner de error con el texto "Email o contraseña incorrectos."

**Falla si:** Aparece un mensaje diferente al de T3 (no debe haber distinción entre email inexistente y contraseña incorrecta, para no revelar información de cuentas).

---

## T5 — Email no confirmado ✅ Desbloqueable

1. Crear una cuenta nueva sin confirmar el email (o usar cuenta de prueba pre-configurada)
2. Navegar a `http://localhost:4321/login`
3. Ingresar las credenciales de esa cuenta
4. Hacer click en INGRESAR

**Resultado esperado:** Banner de error con el texto "Debés confirmar tu email antes de iniciar sesión. Revisá tu casilla de correo."

**Falla si:** Aparece "Email o contraseña incorrectos." — esto indicaría que P1 no funciona.

---

## T6 — Acceso a /partidos sin sesión ✅ Desbloqueable

1. Asegurarse de no tener cookies de sesión (usar ventana de incógnito o borrar cookies de `localhost`)
2. Navegar directamente a `http://localhost:4321/partidos`

**Resultado esperado:** Redirect inmediato a `/login`.

**Falla si:** La página de partidos carga sin autenticación.

---

## T7 — Acceso a /panel-club como player ✅ Desbloqueable

1. Iniciar sesión como usuario con rol `player`
2. Navegar manualmente a `http://localhost:4321/panel-club`

**Resultado esperado:** Redirect a `/partidos` (el middleware redirige al destino por defecto del rol).

**Falla si:** El panel de club carga para un player.

---

## T8 — Acceso a /panel-club como club_admin ✅ Desbloqueable

1. Iniciar sesión como usuario con rol `club_admin`
2. Navegar a `http://localhost:4321/panel-club`

**Resultado esperado:** El panel carga correctamente con la pill "CLUB" visible.

**Falla si:** Redirect a otro lugar, o error 403/404.

---

## T9 — Sesión persistente al cerrar y abrir el browser 🔍 Test manual requerido

1. Iniciar sesión como cualquier usuario
2. Cerrar completamente el browser (no solo la pestaña)
3. Abrir el browser nuevamente
4. Navegar a `http://localhost:4321/partidos`

**Resultado esperado:** La página carga sin pedirte login nuevamente (la cookie de refresh tiene `maxAge` de 30 días).

**Falla si:** Redirige a `/login` — esto indicaría que P2 no funciona (cookies session-only).

**Verificación adicional en DevTools:**
- Abrir DevTools → Application → Cookies → `localhost`
- Verificar que `sumateya-access-token` tiene fecha de expiración ~1 hora desde el login
- Verificar que `sumateya-refresh-token` tiene fecha de expiración ~30 días desde el login

---

## T10 — Token expirado: refresh silencioso 🔍 Test manual requerido

> Este test requiere manipular el tiempo o expirar el token manualmente.

**Opción A — Borrar solo el access token:**
1. Iniciar sesión como cualquier usuario
2. Abrir DevTools → Application → Cookies → `localhost`
3. Eliminar solo la cookie `sumateya-access-token` (dejar `sumateya-refresh-token`)
4. Navegar a `http://localhost:4321/partidos`

**Resultado esperado:** La página carga correctamente. El middleware detecta que el access token faltó, usa el refresh token para obtener uno nuevo, y sigue la request sin interrupción. En DevTools se ve que `sumateya-access-token` volvió a aparecer.

**Falla si:** Redirige a `/login` — esto indicaría que P3 no funciona.

---

## T11 — Logout: cookie eliminada e invalidación server-side 🔍 Test manual requerido

1. Iniciar sesión como cualquier usuario
2. Hacer click en "Salir"

**Resultado esperado:**
- Redirect a `/login`
- En DevTools → Application → Cookies: ambas cookies eliminadas
- Intentar navegar a `/partidos` redirige a `/login` (sesión eliminada)

**Verificación de invalidación server-side (fix P4):**

Antes de hacer logout, copiar el valor del access token desde DevTools. Después del logout, intentar hacer una request manual:

```bash
curl -H "Authorization: Bearer <token-copiado>" http://localhost:4000/api/auth/session
```

**Resultado esperado:** `401 Unauthorized` — el token fue revocado en Supabase.

**Falla si:** El endpoint devuelve 200 y datos del usuario — el token sigue activo server-side.

---

## T12 — Verificación de seguridad de cookies 🔍 Test manual requerido

1. Iniciar sesión como cualquier usuario
2. Abrir DevTools → Application → Cookies → `localhost`
3. Verificar cada cookie:

| Propiedad | `sumateya-access-token` | `sumateya-refresh-token` |
|-----------|------------------------|--------------------------|
| HttpOnly  | ✓ (no editable en JS) | ✓ |
| SameSite  | Lax                   | Lax |
| Secure    | false (dev HTTP)      | false (dev HTTP) |
| MaxAge    | ~3600 s (1 hora)      | ~2592000 s (30 días) |

4. Abrir la consola del browser y verificar que no se puede leer el token:

```javascript
document.cookie // NO debe mostrar sumateya-access-token ni sumateya-refresh-token
```

---

## Verificación de RLS en `profiles` ✅ Completado via MCP

Migración aplicada el 2026-04-25 via `mcp__supabase__apply_migration`. Las tres políticas están activas:

| Política | Comando | Condición |
|---|---|---|
| Usuario puede leer su propio perfil | SELECT | `USING (auth.uid() = id)` |
| Usuario puede crear su propio perfil | INSERT | `WITH CHECK (auth.uid() = id)` |
| Usuario puede actualizar su propio perfil | UPDATE | `USING + WITH CHECK (auth.uid() = id)` |
