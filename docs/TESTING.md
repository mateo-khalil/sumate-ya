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

---

# Testing Manual — User Story: Salirse de un partido

## Contexto

Rama: `abandonar-partido`  
Mutation: `leaveMatch(input: LeaveMatchInput!): LeaveMatchResult!`  
Página: `/partidos/[id]` (botón "Salirme del partido" visible cuando `isCurrentUserJoined = true`)

Backend: `matchService.leaveMatch()` → `matchRepository.removeParticipant()`  
Ejecutar tras levantar backend y frontend con `pnpm dev`.

---

## Test 1 — Salida exitosa (happy path)

**Pasos:**
1. Iniciar sesión como player inscripto en un partido
2. Navegar a `/partidos/[id]` del partido
3. Verificar que aparece el banner verde "✓ Ya estás inscripto" y el botón "Salirme del partido"
4. Click → diálogo de confirmación → "Sí, salirme"

**Resultado esperado:**
- HTTP 200 con `{ leaveMatch: { matchDeleted: false, match: { ... } } }`
- Página recarga mostrando el lugar liberado
- El usuario ya no aparece en ningún equipo
- `matchParticipants` no tiene fila con ese `playerId` + `matchId`

---

## Test 2 — Player no inscripto intenta salirse

**Pasos:**
1. Iniciar sesión como player que NO está en el partido
2. Llamar directamente: `POST /graphql` → `leaveMatch({ matchId: "<id>" })`

**Resultado esperado:**
- `errors[0].message === "No estás inscripto en este partido"`
- `matchParticipants` sin cambios

---

## Test 3 — Partido cancelado

**Pasos:**
1. Usar un partido con `status = 'cancelled'`
2. Intentar salirse

**Resultado esperado:**
- `errors[0].message === "El partido ya fue cancelado"`

---

## Test 4 — Único jugador se sale → auto-eliminación

**Pasos:**
1. Crear un partido como player_A → player_A queda inscripto en equipo A
2. Player_A se sale del partido

**Resultado esperado:**
- `{ leaveMatch: { matchDeleted: true, match: null } }`
- Redirect a `/partidos` (el botón navega a la lista)
- El partido ya no aparece en la lista
- `matches` no tiene fila con ese id
- `matchParticipants` no tiene filas con ese `matchId`

---

## Test 5 — Partido full → vuelve a open

**Pasos:**
1. Tener un partido con `status = 'full'` (todos los cupos ocupados)
2. Un player inscripto se sale

**Resultado esperado:**
- `{ leaveMatch: { matchDeleted: false, match: { status: 'OPEN', ... } } }`
- `matches.status` cambió de `'full'` a `'open'`
- El partido vuelve a aparecer en el listado de partidos abiertos
- `availableSlots` es 1 (o más, según cuántos quedaron)

---

## Test 6 — Confirmación con menos de 1 hora

**Pasos:**
1. Inscribirse en un partido cuyo `startTime` es menos de 60 minutos en el futuro
2. Click en "Salirme del partido"

**Resultado esperado:**
- Diálogo de confirmación muestra aviso naranja: "⚠ Falta menos de 1 hora para el partido"
- El botón "Sí, salirme" sigue disponible (no bloqueado)
- Al confirmar, la salida procede normalmente

---

## Test 7 — Confirmación normal (más de 1 hora)

**Pasos:**
1. Inscribirse en un partido cuyo `startTime` es más de 60 minutos en el futuro
2. Click en "Salirme del partido"

**Resultado esperado:**
- Diálogo de confirmación sin aviso de urgencia
- Texto: "¿Querés salirte del partido? Tu lugar quedará disponible."

---

## Test 8 — Organizador se sale (Caso A)

**Pasos:**
1. El organizador del partido (el jugador que lo creó) navega al detalle
2. Observa que está en el Equipo A (fue inscripto automáticamente)
3. Click "Salirme" → confirmar

**Resultado esperado:**
- Si quedan otros participantes: partido sigue existiendo, `organizerId` en `matches` sigue apuntando al ex-organizador (el FK no se borra), pero el usuario ya no aparece en `matchParticipants`
- La UI muestra los equipos sin el organizador
- No hay error ni transferencia de rol
- **Nota**: el `organizerId` queda como referencia histórica. Esta decisión está documentada en el Decision Context del service — cambiar el organizador requeriría una migración o un flujo "transferir rol" fuera del scope de esta US.

---

## Test 9 — Cache Redis (solo si REDIS_URL está configurado)

**Pasos:**
1. Con Redis activo, observar logs del backend antes y después de salirse

**Resultado esperado en logs:**
```
[Redis] Deleted key: match:participants:<id>
[Redis] Deleted key: match:<id>
```
Si el partido se volvió open o fue eliminado, también:
```
[Redis] Deleted key: matches:open
```

---

## Test 10 — Race condition: dos players se salen cuando queda uno solo

**Pasos:**
1. Partido con 2 jugadores: A y B
2. Usando dos sesiones simultáneas, ambos A y B hacen `leaveMatch` al mismo tiempo

**Resultado esperado:**
- Uno de los dos ve `matchDeleted: true` (el que leyó count=0 después de su DELETE)
- El otro puede ver `matchDeleted: false` con 1 participante restante, o también `matchDeleted: true` si el match ya fue eliminado
- No hay error ni duplicado — `deleteMatch` con `DELETE WHERE id=x` sobre fila ya eliminada devuelve 0 filas sin error (idempotente en PostgreSQL)
- El partido queda eliminado o con 1 participante, nunca inconsistente

---

# Testing Manual — User Story: Detalle completo de un partido

## Contexto

Rama: `detalle-de-partido`  
Página: `/partidos/[id]` (SSR)  
Componentes nuevos: `PlayerCard.astro`, `MatchInfoCard.astro`, `ClubLocationCard.astro`  
Campos nuevos en GraphQL: `organizerId`, `currentUserTeam`, `TeamMember.preferredPosition`, `Club.phone`

Ejecutar tras levantar backend y frontend con `pnpm dev`.

---

## Test 1 — Partido abierto con cupos en ambos equipos (usuario no autenticado)

**Pasos:**
1. Abrir ventana de incógnito (sin sesión)
2. Navegar a `/partidos/[id]` de un partido con `status = 'OPEN'` y cupos disponibles

**Resultado esperado:**
- La página carga con la topbar, `MatchInfoCard`, `ClubLocationCard` (si el club existe), y la grilla de equipos
- Se muestra la fecha formateada en español (ej: "sábado 5 de abril · 18:00")
- El formato aparece como badge (ej: "7v7")
- El badge de estado es verde "Abierto"
- El banner inferior muestra: "🔑 Iniciá sesión para sumarte a este partido"
- Los botones "Sumarme al Equipo A/B" no aparecen (solo el link de login en el CTA de cada equipo)

---

## Test 2 — Partido completo (`status = 'FULL'`)

**Pasos:**
1. Navegar a `/partidos/[id]` de un partido con todos los cupos ocupados

**Resultado esperado:**
- Badge "Completo" en naranja
- Badge extra "PARTIDO COMPLETO" visible
- Banner "🔒 Este partido está completo"
- Botones "Sumarme" reemplazados por texto "Completo" en cada equipo

---

## Test 3 — Partido cancelado (`status = 'CANCELLED'`)

**Pasos:**
1. Navegar a `/partidos/[id]` de un partido con `status = 'CANCELLED'`

**Resultado esperado:**
- Badge "Cancelado" en rojo
- Banner rojo: "❌ Este partido fue cancelado"
- Botones de join muestran "Cancelado" en cada equipo

---

## Test 4 — Usuario inscripto ve su estado correcto

**Pasos:**
1. Iniciar sesión como jugador inscripto en un partido
2. Navegar al detalle de ese partido

**Resultado esperado:**
- Banner verde "✓ Ya estás anotado en Equipo A" (o B según corresponda)
- El botón "Salirme del partido" aparece dentro del banner
- En el equipo correspondiente aparece "✓ Estás en este equipo"
- En el otro equipo aparece "Ya estás en el Equipo A" (o B)
- NO aparecen botones "Sumarme" en ningún equipo

---

## Test 5 — Usuario player no inscripto ve botones de "Sumarme"

**Pasos:**
1. Iniciar sesión como jugador sin inscripción en el partido
2. Navegar al detalle de un partido abierto con cupos

**Resultado esperado:**
- Banner azul: "⚽ Hay X cupos disponibles. Elegí tu equipo abajo."
- Botones "Sumarme al Equipo A" y "Sumarme al Equipo B" visibles y activos
- Al hacer click en "Sumarme al Equipo A" → el botón muestra spinner → si exitoso, la página recarga mostrando el jugador en el Equipo A

---

## Test 6 — Badge "Organizador" en la tarjeta del organizador

**Pasos:**
1. Navegar al detalle de un partido como cualquier usuario
2. Observar la lista de jugadores en el equipo donde está el organizador

**Resultado esperado:**
- El jugador que creó el partido tiene el badge naranja "Org." junto a su nombre
- Los demás jugadores NO tienen ese badge

---

## Test 7 — Botón "Ver en mapa" abre Google Maps

**Pasos:**
1. Navegar al detalle de un partido cuyo club tiene `lat` y `lng` configurados
2. Click en el botón "🗺️ Ver en mapa" en la card de ubicación

**Resultado esperado:**
- Se abre una nueva pestaña apuntando a `https://www.google.com/maps?q=<lat>,<lng>`
- Las coordenadas son las del club (verificar que coincidan con las de la DB)

---

## Test 8 — Club sin coordenadas: ocultar botón de mapa

**Pasos:**
1. Navegar al detalle de un partido cuyo club tiene `lat = null` o `lng = null`

**Resultado esperado:**
- La `ClubLocationCard` muestra nombre, dirección y zona del club
- El botón "Ver en mapa" NO aparece
- No hay errores ni elementos vacíos

---

## Test 9 — ID inválido (no UUID) redirige a /partidos

**Pasos:**
1. Navegar a `/partidos/abc-no-es-uuid`
2. Navegar a `/partidos/undefined`
3. Navegar a `/partidos/12345`

**Resultado esperado:**
- En todos los casos: redirect inmediato a `/partidos` (sin un 404 o página en blanco)

---

## Test 10 — Fecha y hora en español

**Pasos:**
1. Navegar al detalle de un partido con fecha conocida (ej: 2026-05-16T18:00:00)

**Resultado esperado:**
- En la `MatchInfoCard` se muestra la fecha capitalizada y en español: "sábado 16 de mayo de 2026 · 18:00"
- No aparece el mes o día en inglés
- La hora usa formato de 24 horas con 2 dígitos (ej: "08:00", no "8:00 AM")

---

## Test 11 — Posición preferida de los jugadores

**Pasos:**
1. Navegar al detalle de un partido donde algún jugador tiene `preferredPosition` configurado

**Resultado esperado:**
- Bajo el nombre del jugador se muestra su posición en español con ícono:
  - `goalkeeper` → "🧤 Arquero"
  - `defender` → "🛡️ Defensor"
  - `midfielder` → "⚡ Mediocampista"
  - `forward` → "⚽ Delantero"
- Jugadores sin posición configurada no muestran esa línea

---

## Test 12 — Responsive mobile (equipos en una columna)

**Pasos:**
1. Abrir el detalle de un partido en un viewport de 375px de ancho (DevTools → Device Toolbar)

**Resultado esperado:**
- Los dos equipos aparecen uno abajo del otro (una sola columna)
- Todos los elementos son legibles y no se cortan
- Los botones de join son de ancho completo

---

## Test 13 — club_admin ve el detalle sin botones de join

**Pasos:**
1. Iniciar sesión como usuario con `role = 'club_admin'`
2. Navegar al detalle de cualquier partido abierto

**Resultado esperado:**
- La página carga correctamente con todos los datos del partido
- En el CTA de cada equipo aparece "Solo jugadores pueden sumarse"
- No aparece el banner de "Hay X cupos disponibles"
- No aparece el botón "Salirme del partido"

---

## Notas de implementación

- **Organizer FK sin participante**: Si el organizador se salió del partido, `match.organizerId` apunta a un usuario que ya no está en `matchParticipants`. El badge "Org." no aparecerá en ningún jugador en ese caso. Esto es correcto e intencional (ver Decision Context de `matchService.leaveMatch`).
- **preferredPosition raw**: El backend retorna el valor literal de la DB (ej: `'goalkeeper'`). El componente `PlayerCard.astro` mapea tanto mayúsculas como minúsculas para mayor robustez.
- **phone en clubs legacy**: Clubs sin teléfono configurado simplemente no muestran esa fila en `ClubLocationCard`.

---

# Testing Manual — User Story: Historial de partidos jugados

## Contexto

Rama: `historial-de-partidos`  
Query: `myMatches(page: Int, pageSize: Int): MatchHistoryConnection!`  
Página: `/perfil` — sección "Historial de partidos" (debajo del ProfileCard)  
Componentes: `MatchHistoryCard.tsx`, `MatchHistoryList.tsx`

**Nota:** `userResult` siempre es `PENDING` hasta que se implemente la US "registrar resultado" (campos `scoreA/scoreB/winnerTeam` no existen aún en la DB).  
Ejecutar tras levantar backend y frontend con `pnpm dev`.

---

## Test 1 — Usuario sin partidos completados (empty state)

**Pasos:**
1. Iniciar sesión como un jugador nuevo que no participó en ningún partido completado
2. Navegar a `/perfil`

**Resultado esperado:**
- La sección "Historial de partidos" muestra "sin partidos aún" en el subtítulo
- El componente muestra el empty state: ícono 🏟️, texto "Aún no tenés partidos jugados"
- No hay tarjetas de partido ni botón "Cargar más"

---

## Test 2 — Usuario con 1 partido completado

**Pasos:**
1. Usar un jugador que tenga exactamente 1 partido con `status = 'completed'` en `matchParticipants`
2. Navegar a `/perfil`

**Resultado esperado:**
- Sección muestra "1 en total" en el subtítulo
- Aparece 1 tarjeta con fecha en español, nombre del club, formato (5v5/7v7/etc.), equipo (A o B)
- Badge de resultado: gris "Sin resultado" (PENDING)
- No aparece el botón "Cargar más"
- "Mostrando todos tus partidos (1)" al final

---

## Test 3 — Paginación con más de 10 partidos

**Pasos:**
1. Usar un jugador con 15+ partidos completados
2. Navegar a `/perfil`

**Resultado esperado:**
- Se muestran 10 tarjetas iniciales (primer page SSR)
- Aparece botón "Cargar más" al final
- Click en "Cargar más" → muestra un spinner/texto "Cargando…" → aparecen los siguientes partidos
- Si quedan menos de 10, el botón desaparece y aparece "Mostrando todos tus partidos (X)"
- El total en el subtítulo muestra el número correcto

---

## Test 4 — Partido WON (futuro, cuando se implemente resultado)

> **Pendiente:** requiere la US "registrar resultado"

**Resultado esperado cuando esté implementado:**
- Badge verde "Ganado"
- Score visible (ej: "3 — 2")
- `userResult = WON` cuando `winnerTeam === userTeam.toLowerCase()`

---

## Test 5 — Partido LOST (futuro)

> **Pendiente:** requiere la US "registrar resultado"

**Resultado esperado cuando esté implementado:**
- Badge rojo "Perdido"
- Score visible

---

## Test 6 — Partido DRAW (futuro)

> **Pendiente:** requiere la US "registrar resultado"

**Resultado esperado cuando esté implementado:**
- Badge ámbar "Empate"
- Score visible (ej: "2 — 2")

---

## Test 7 — Badge "Sin resultado" (estado actual)

**Pasos:**
1. Ver cualquier partido completado en el historial

**Resultado esperado:**
- Badge gris "Sin resultado" visible en la fila de resultado
- Sin score visible (scoreA/scoreB son null)

---

## Test 8 — Badge "Organizador" en partido creado por el usuario

**Pasos:**
1. Usar un jugador que creó al menos un partido que quedó completado
2. Navegar a `/perfil`

**Resultado esperado:**
- En la tarjeta de ese partido aparece el badge naranja "Organizador"
- En partidos donde no fue organizador, el badge no aparece

---

## Test 9 — Partidos cancelled NO aparecen en el historial

**Pasos:**
1. Usar un jugador inscripto en un partido que fue cancelado (`status = 'cancelled'`)
2. Navegar a `/perfil`

**Resultado esperado:**
- Ese partido NO aparece en el historial
- Solo aparecen partidos con `status = 'completed'`

---

## Test 10 — Cache Redis se usa en segunda request

> Requiere `REDIS_URL` configurado en el backend

**Pasos:**
1. Navegar a `/perfil` con el historial → primera carga (cache MISS)
2. Navegar a `/perfil` nuevamente dentro de los 5 minutos

**Resultado esperado en logs del backend:**
```
[Redis] Cache MISS: user:matches:<userId>:page:1:size:10
# (primer acceso)

[Redis] Cache HIT: user:matches:<userId>:page:1:size:10
# (segundo acceso, dentro de 5 minutos)
```

---

## Test 11 — Cargar más y volver: datos consistentes

**Pasos:**
1. Cargar más de una página de historial
2. Navegar a otra página y volver a `/perfil`

**Resultado esperado:**
- Al volver, se muestra solo la primera página (page 1) — el estado SSR reinicia
- La segunda carga usa cache (si Redis está activo) y es rápida
- No hay duplicados ni datos inconsistentes

---

## Test 12 — hasMore = false con 0 items restantes

**Pasos:**
1. Llegar al final del historial (cargar todas las páginas disponibles)

**Resultado esperado:**
- El botón "Cargar más" desaparece
- Aparece el texto "Mostrando todos tus partidos (X)"
- No hay llamadas a la API al no haber botón

---

## Notas de implementación

- **Option B (sin resultado):** Los campos `scoreA/scoreB/winnerTeam` no existen en la DB. `userResult` siempre es `PENDING`. La arquitectura está preparada: cuando "registrar resultado" se implemente, solo hay que agregar las columnas vía MCP, actualizar `MATCH_HISTORY_COLUMNS` en el repository y reemplazar la lógica en `toMatchHistoryItem`.
- **Ordering:** Los partidos se ordenan por `scheduledAt DESC` (fecha del partido, no de inscripción).
- **TTL de cache:** 5 minutos (`USER_DATA`). Si se registra un resultado en esos 5 minutos, el historial no se actualiza hasta que expira el cache. Esto es aceptable para la frecuencia de uso prevista.
- **client:visible:** La isla React se hidrata cuando el usuario hace scroll hasta la sección del historial, no al cargar la página.
