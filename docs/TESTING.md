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
