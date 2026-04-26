# Testing Manual — User Story: Registro de Club

## Contexto

Rama: `registro_de_club`  
Endpoint de registro: `POST /api/auth/register-club`  
Página: `/registro-club`

Ejecutar estos tests después de levantar el backend (`pnpm dev` desde la raíz) y el frontend.

---

## Test 1 — Flujo completo exitoso

**Objetivo:** crear usuario + perfil + club con datos válidos.

**Pasos:**
1. Ir a `/registro-club`
2. Completar todos los campos:
   - Nombre completo: `Test Admin`
   - Email: dirección nueva que no exista en la DB
   - Contraseña: `test1234` (8+ chars)
   - Confirmar contraseña: `test1234`
   - Nombre del club: `Club Test Manual`
   - Dirección: `Av. Test 1234, CABA`
   - Zona: `Norte`
   - Teléfono: `+54 11 4000-0000`
   - Latitud: `-34.6037`
   - Longitud: `-58.3816`
3. Click en **REGISTRAR CLUB**

**Resultado esperado:**
- Redirección a `/login?registered=1`
- Banner verde "Registro exitoso. Ya podés iniciar sesión."
- En Supabase: el usuario existe en `auth.users`, hay fila en `profiles` con `role = club_admin`, hay fila en `clubs` con `ownerId = user.id` y `lat/lng` correctos.

---

## Test 2 — Email duplicado → mensaje neutro

**Objetivo:** verificar que el 409 no expone la existencia del email.

**Pasos:**
1. Intentar registrar con un email que ya existe en la DB
2. Click en **REGISTRAR CLUB**

**Resultado esperado:**
- Error global (no inline): *"No se pudo completar el registro. Si el email ya está registrado, intentá iniciar sesión."*
- HTTP 409 en el backend (verificar en red/logs)
- El mensaje NO dice "El email X ya está registrado"

---

## Test 3 — Contraseña menor a 8 caracteres

**Pasos:**
1. Ingresar contraseña `abc123` (6 chars)
2. Confirmar contraseña `abc123`
3. Submit

**Resultado esperado:**
- Error inline en el campo contraseña: *"La contraseña debe tener al menos 8 caracteres"*
- No se realiza ningún registro

---

## Test 4 — Contraseñas que no coinciden

**Pasos:**
1. Contraseña: `test1234`
2. Confirmar: `test5678`
3. Submit

**Resultado esperado:**
- Error inline en confirmPassword: *"Las contraseñas no coinciden"*

---

## Test 5 — Latitud y longitud vacías

**Objetivo:** verificar la pre-validación server-side de coordenadas obligatorias.

**Pasos:**
1. Completar todos los campos excepto lat y lng
2. Click en **REGISTRAR CLUB**

**Resultado esperado:**
- Error inline en lat: *"La latitud es obligatoria para mostrar el club en el mapa"*
- Error inline en lng: *"La longitud es obligatoria para mostrar el club en el mapa"*
- No se realiza ninguna llamada al backend (pre-validación en Astro SSR)

---

## Test 6 — Coordenadas fuera de rango

**Pasos:**
1. Latitud: `999`
2. Longitud: `-9999`
3. Submit

**Resultado esperado:**
- Error inline en lat: *"Latitud inválida (debe estar entre -90 y 90)"*
- Error inline en lng: *"Longitud inválida (debe estar entre -180 y 180)"*

---

## Test 7 — Teléfono con formato inválido

**Pasos:**
1. Teléfono: `hola` (texto sin dígitos)
2. Submit

**Resultado esperado:**
- Error inline en teléfono: *"Formato de teléfono inválido (ej: +54 11 4222-1111)"*

---

## Test 8 — Login post-registro → redirección a /panel-club

**Objetivo:** verificar que el rol `club_admin` redirige correctamente.

**Pasos:**
1. Completar Test 1 para crear el usuario
2. Ir a `/login`
3. Ingresar con las credenciales del Test 1
4. Submit

**Resultado esperado:**
- Redirección a `/panel-club`
- El middleware resuelve el rol `club_admin` y lo redirige

---

## Test 9 — Intento de segundo club para el mismo admin (UNIQUE constraint)

**Objetivo:** verificar que el constraint `clubs_ownerid_unique` bloquea el segundo registro.

**Pasos:**
1. Usar un club_admin ya registrado (con JWT válido)
2. Llamar directamente a `POST /api/auth/register-club` con el mismo email o con un JWT del mismo usuario intentando crear otro club
3. (Alternativa: intentar registrar con el mismo email ya existente)

**Resultado esperado:**
- HTTP 409 o 400 con error que no permite el segundo club
- La tabla `clubs` no debe tener dos filas con el mismo `ownerId`

---

## Test 10 — Botón "Usar mi ubicación"

**Objetivo:** verificar que el botón de geolocalización auto-completa lat/lng.

**Pasos:**
1. Ir a `/registro-club` en un browser que permita geolocalización
2. Click en **📍 Usar mi ubicación**
3. Aprobar el permiso del browser

**Resultado esperado:**
- Los campos lat y lng se auto-completan con las coordenadas del dispositivo
- El botón vuelve a texto normal después de obtener la ubicación
- Si el browser deniega la ubicación, el botón vuelve a su estado normal sin error

---

## Test 11 — Verificar datos en la base

**Objetivo:** confirmar que todos los campos se persisten correctamente.

**Pasos:**
1. Después del Test 1 exitoso, verificar en Supabase (vía Management API o dashboard):

```
SELECT id, "ownerId", name, address, zone, lat, lng, phone 
FROM clubs 
WHERE "ownerId" = '<userId del test>'
```

**Resultado esperado:**
- Exactamente 1 fila
- `lat` y `lng` son los valores ingresados
- `phone` no es NULL
- `ownerId` coincide con el `id` del usuario en `auth.users`

---

## Notas de arquitectura

- **DELETE en profiles**: No existe política DELETE en `public.profiles`. Los perfiles se preservan aunque el usuario "elimine" su cuenta (integridad referencial con matches y clubs). Los borrados de cuenta son operaciones de administrador vía `service_role`. Si en el futuro se necesita auto-eliminación, usar un flag `isDeleted` (soft delete).
- **Cleanup en rollback**: Si falla el insert de clubs durante el registro, se loguea un error con `[authService.register]` prefix y se intenta eliminar el perfil y el usuario de auth. Verificar los logs del servidor si un registro falla parcialmente.


---

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
