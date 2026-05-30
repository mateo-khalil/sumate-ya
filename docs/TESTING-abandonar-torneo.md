# TESTING — Abandonar Torneo (US #47)

> Rama: `abandonar-torneo`
> Última actualización: 2026-05-30

## Pre-condición

- **La migración DB debe estar aplicada** (ver sección al final).
- Se necesitan al menos dos cuentas de jugador (ej. `playerMateo`, `playerRicardo`).
- Se necesita al menos un torneo en estado `REGISTRATION` con equipos inscritos.

---

## Casos de Validación (backend)

### 1 — Retiro exitoso (caso base)
**Setup**: Torneo en REGISTRATION con 3+ equipos. Usuario autenticado es capitán de un equipo.
**Acción**: `leaveTournament({ tournamentId, teamId })`
**Resultado esperado**: `{ success: true, message: "Tu equipo fue retirado del torneo exitosamente", tournamentStatus: "REGISTRATION", remainingTeams: N-1 }`
**Verificar DB**: `tournamentTeams.status = 'withdrawn'`, `withdrawnAt` con timestamp, miembros eliminados de `tournamentTeamMembers`.

### 2 — Miembro no-capitán intenta retirar
**Setup**: Usuario autenticado es miembro del equipo pero NO capitán.
**Acción**: `leaveTournament({ tournamentId, teamId })`
**Resultado esperado**: Error → `"Solo el capitán (administrador) del equipo puede retirarlo del torneo"`

### 3 — Usuario sin equipo en el torneo
**Setup**: Usuario autenticado no tiene ningún equipo inscripto en el torneo.
**Acción**: `leaveTournament({ tournamentId, teamId: uuidDeOtroEquipo })`
**Resultado esperado**: Error → `"Solo el capitán (administrador) del equipo puede retirarlo del torneo"`

### 4 — Torneo en estado `in_progress`
**Setup**: Torneo en estado `IN_PROGRESS`.
**Acción**: `leaveTournament({ tournamentId, teamId })`
**Resultado esperado**: Error → `"No se puede abandonar un torneo en curso. El torneo ya comenzó y los partidos están programados"`

### 5 — Torneo `completed`
**Setup**: Torneo en estado `COMPLETED`.
**Acción**: `leaveTournament({ tournamentId, teamId })`
**Resultado esperado**: Error → `"El torneo ya finalizó"`

### 6 — Torneo `cancelled`
**Setup**: Torneo en estado `CANCELLED`.
**Acción**: `leaveTournament({ tournamentId, teamId })`
**Resultado esperado**: Error → `"El torneo fue cancelado"`

### 7 — Equipo ya fue retirado
**Setup**: Equipo con `status = 'withdrawn'` (ya retirado previamente).
**Acción**: `leaveTournament({ tournamentId, teamId })`
**Resultado esperado**: Error → `"Este equipo ya fue retirado del torneo"`

### 8 — `tournamentId` inexistente
**Setup**: UUID válido que no corresponde a ningún torneo.
**Acción**: `leaveTournament({ tournamentId: "uuid-inexistente", teamId })`
**Resultado esperado**: Error → `"El torneo no existe"`

### 9 — `teamId` inexistente
**Setup**: UUID válido que no corresponde a ningún equipo.
**Acción**: `leaveTournament({ tournamentId, teamId: "uuid-inexistente" })`
**Resultado esperado**: Error → `"El equipo no existe"`

### 10 — `teamId` de otro torneo
**Setup**: `teamId` válido pero pertenece a un torneo diferente al `tournamentId`.
**Acción**: `leaveTournament({ tournamentId: torneo1.id, teamId: equipoTorneo2.id })`
**Resultado esperado**: Error → `"Este equipo no pertenece a este torneo"`

---

## Casos de Consecuencias (post-retiro)

### 11 — Retiro con 4 equipos → torneo sigue normal
**Setup**: Torneo con 4 equipos activos. Capitán retira su equipo.
**Resultado esperado**: `{ success: true, remainingTeams: 3, tournamentStatus: "REGISTRATION" }`
**Verificar**: Torneo sigue en REGISTRATION, conteo muestra 3 equipos.

### 12 — Retiro con 2 equipos → warning (1 queda)
**Setup**: Torneo con exactamente 2 equipos activos. Capitán retira su equipo.
**Resultado esperado**: 
```json
{
  "success": true,
  "remainingTeams": 1,
  "tournamentStatus": "REGISTRATION",
  "message": "Atención: el torneo tiene solo 1 equipo inscripto..."
}
```
**Verificar**: Torneo NO se cancela, sigue en REGISTRATION.

### 13 — Retiro del último equipo → torneo se cancela automáticamente
**Setup**: Torneo con 1 equipo activo (o los demás ya están withdrawn). Capitán retira su equipo.
**Resultado esperado**: `{ success: true, remainingTeams: 0, tournamentStatus: "CANCELLED", message: "El torneo fue cancelado porque no quedan equipos inscriptos" }`
**Verificar DB**: `tournaments.status = 'cancelled'`.

### 14 — Miembros del equipo eliminados de tournamentTeamMembers
**Setup**: Equipo con 3 miembros + capitán.
**Acción**: Capitán retira el equipo.
**Verificar DB**: `tournamentTeamMembers` no tiene filas con `teamId` del equipo retirado.

---

## Casos de UI

### 15 — Botón visible para capitán en torneo REGISTRATION
**Setup**: Usuario logueado es capitán de un equipo inscripto. Torneo en REGISTRATION.
**Acción**: Abrir `/torneos/{id}`.
**Resultado esperado**: Botón "Retirar equipo" visible en el panel lateral del capitán.

### 16 — Botón NO visible para miembro no-capitán
**Setup**: Usuario logueado es miembro (no capitán) de un equipo inscripto.
**Acción**: Abrir `/torneos/{id}`.
**Resultado esperado**: Botón "Retirar equipo" NO aparece (ni en el panel del capitán, porque el usuario no es capitán).

### 17 — Botón NO visible si torneo en IN_PROGRESS o COMPLETED
**Setup**: Usuario es capitán de un equipo en un torneo con status `IN_PROGRESS`.
**Acción**: Abrir `/torneos/{id}`.
**Resultado esperado**: Botón "Retirar equipo" NO aparece (`canLeave = tournamentStatus === 'REGISTRATION'`).

### 18 — Modal de confirmación con checkbox obligatorio
**Setup**: Capitán hace clic en "Retirar equipo".
**Resultado esperado**: 
- Modal abre con título "Retirar equipo del torneo".
- Warning en amarillo sobre acción irreversible.
- Checkbox de confirmación desmarcado.
- Botón "Retirar equipo" deshabilitado hasta tildar checkbox.
- Botón "Cancelar" siempre habilitado.

### 19 — Warning rojo extra si quedan 2 equipos
**Setup**: Torneo con exactamente 2 equipos activos. Capitán abre modal.
**Resultado esperado**: Warning rojo adicional: "Si retirás tu equipo, el torneo podría cancelarse porque quedaría solo 1 equipo inscripto."

### 20 — Toast de confirmación después de retiro exitoso
**Setup**: Capitán completa el retiro (tilda checkbox, hace clic en "Retirar equipo").
**Resultado esperado**: Mensaje de éxito en verde. Página recarga automáticamente (~1.5s).

### 21 — Equipo desaparece del listado después del retiro
**Setup**: Después de retiro exitoso y recarga.
**Resultado esperado**: El equipo retirado ya no aparece en la sección "Equipos inscriptos" del detalle del torneo.

### 22 — Conteo de equipos se actualiza
**Setup**: Después del retiro exitoso.
**Resultado esperado**: El contador "X/Y equipos inscriptos" refleja el nuevo conteo (N-1).

---

## Casos de Seguridad

### 23 — Mutation sin auth → 401
**Setup**: Request sin cookie de sesión / sin Authorization header.
**Acción**: POST a `/api/graphql-auth` con mutation `leaveTournament`.
**Resultado esperado**: HTTP 401 o GraphQL error `"Authentication required"`.

### 24 — RLS: capitán de otro equipo no puede retirar este equipo
**Setup**: Usuario autenticado (UserA) es capitán del equipoA. Intenta retirar equipoB cuyo capitán es UserB.
**Acción**: `leaveTournament({ tournamentId, teamId: equipoB.id })`
**Resultado esperado**: Error → `"Solo el capitán (administrador) del equipo puede retirarlo del torneo"`
**Verificar**: La RLS policy de UPDATE en `tournamentTeams` deniega el acceso. El service lo captura antes con la validación 5 de todas formas.

### 25 — Input malformado (UUID inválido) → error de validación
**Acción**: `leaveTournament({ tournamentId: "not-a-uuid", teamId: "also-not" })`
**Resultado esperado**: `{ success: false, message: "Datos invalidos: tournamentId invalido; teamId invalido" }`

---

## Casos Responsive (mobile)

### 26 — Modal funciona en viewport 375px
**Setup**: DevTools → 375px width. Abrir modal de confirmación.
**Resultado esperado**: Modal muestra sin overflow horizontal. Botones apilados verticalmente y ocupan ancho completo (`flex-direction: column-reverse`).

### 27 — Touch targets >= 44px
**Setup**: Inspeccionar elementos en DevTools.
**Resultado esperado**: Botón "Retirar equipo" tiene `min-height: 44px`. Botones del modal también (`min-height: 44px`).

### 28 — Sin scroll horizontal en toda la página
**Setup**: 375px viewport.
**Resultado esperado**: No hay scroll horizontal en ninguna parte del detalle del torneo.

---

## Migración DB Requerida

**BLOQUEANTE**: Esta feature NO funciona hasta que se aplique la siguiente migración en Supabase.

### Pasos (via Supabase MCP):
1. Autenticar Supabase MCP con token de acceso personal.
2. Aplicar `mcp__supabase__apply_migration` con el siguiente SQL:

```sql
-- Agrega soft-delete a tournamentTeams
ALTER TABLE "tournamentTeams"
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CONSTRAINT "tournamentTeams_status_check"
    CHECK (status IN ('active', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS "withdrawnAt" timestamptz NULL,
  ADD COLUMN IF NOT EXISTS "withdrawalReason" text NULL;

-- Índice para consultas eficientes de equipos activos por torneo
CREATE INDEX IF NOT EXISTS "idx_tournamentTeams_tournamentId_status_active"
  ON "tournamentTeams" ("tournamentId", status)
  WHERE status = 'active';
```

3. Verificar RLS en `tournamentTeams`:
   - `SELECT`: public read (o autenticado según política existente)
   - `UPDATE WHERE captainId = auth.uid()`: permite soft-delete al capitán
   - `DELETE WHERE captainId = auth.uid()`: no necesario (usamos soft delete)

4. Verificar RLS en `tournamentTeamMembers`:
   - `DELETE WHERE teamId IN (SELECT id FROM tournamentTeams WHERE captainId = auth.uid())`: permite al capitán borrar miembros de su equipo

---

## Notas

- El retiro es un **soft delete**: el registro `tournamentTeams` queda con `status='withdrawn'` y se registra `withdrawnAt` + `withdrawalReason`.
- Los `tournamentTeamMembers` se borran (hard delete) ya que la inscripción queda invalidada.
- La UI filtra equipos retirados del listado (solo muestra `status='active'` via `toTournament()` en el service).
- Si todos los equipos se retiran, el torneo cambia automáticamente a `CANCELLED`.
