# Testing Manual — Gestión de Horarios (Panel Club)

> **Prerequisito**: Las migraciones de Phase 1 deben aplicarse via Supabase MCP antes de
> ejecutar cualquier caso. Ver sección "Migraciones" al final de este documento.
>
> **URL**: `/panel-club/horarios` (requiere rol `club_admin`)

---

## Casos de prueba

### CRUD de slots

**Caso 1 — Crear slot único con duración 60 min**
- Ir a `/panel-club/horarios` → "Nuevo slot"
- Ingresar: courtId válido, día lunes, 18:00–19:00, duración 60 min, precio 2000
- Resultado esperado: slot aparece en la lista con badge verde "Disponible", duración "60 min"

**Caso 2 — Crear slot con duración 90 min** *(mejora 5)*
- "Nuevo slot" → 18:00–19:30, duración 90 min
- Resultado esperado: slot creado con "90 min" visible en columna Duración

**Caso 3 — Crear slot con solapamiento** *(mejora 18)*
- Ya existe slot lunes 18:00–19:00
- Intentar crear lunes 18:30–19:30
- Resultado esperado: error del backend "Ya existe un slot activo... que se superpone"
- UI muestra banner de error rojo

**Caso 4 — Editar precio base de slot (mejora 13 básica)**
- Clic en icono Editar → tab "Editar" → cambiar precio
- Resultado esperado: precio actualizado en lista, audit log registra `price_changed`

**Caso 5 — allowOnlineBooking=false no aparece en /partidos/crear** *(mejora 15)*
- Editar slot → tab "Editar" → desmarcar "Reserva online habilitada"
- Ir a `/partidos/crear` con ese club/día
- Resultado esperado: slot NO aparece como opción para jugadores

**Caso 6 — Eliminar slot (soft-delete)** *(mejora 17)*
- Clic en icono Eliminar → confirmar
- Resultado esperado: slot aparece con opacidad reducida (badge "Eliminado"), no editable
- Audit log registra acción `deleted`
- Slot sigue visible en la lista con estado inactivo

---

### Bloqueos y desbloqueos

**Caso 7 — Bloquear slot sin matches**
- Clic en icono candado → confirmar (sin matches afectados)
- Resultado esperado: badge cambia a rojo "Bloqueado", icono se convierte en desbloquear

**Caso 8 — Bloquear slot con match programado — preview + confirmación** *(mejoras 6, 11, 19)*
- Existe un match futuro en ese slot
- Clic en candado
- Resultado esperado: se abre `BulkBlockDialog` mostrando:
  - "1 partido(s) afectado(s)"
  - Lista del match con fecha y participantes
  - Warning amarillo "Esta acción cancelará matches..."
  - Checkbox "Confirmo que se cancelarán..."
- Desmarcar checkbox → botón deshabilitado
- Marcar checkbox → "Cancelar matches y bloquear" habilitado
- Confirmar → slot queda bloqueado, audit log registra `blocked`
- TODO: match cancelado + notificación enviada (pendiente mejora 19)

**Caso 9 — Desbloquear slot**
- Slot bloqueado → clic en icono desbloquear
- Resultado esperado: badge vuelve a verde "Disponible", audit log registra `unblocked`

**Caso 10 — Bloquear con blockReason y blockType** *(mejora 4)*
- Clic editar → tab "Bloquear" → tipo: "Mantenimiento", motivo: "Cancha en reparación"
- Resultado esperado: columna "Motivo bloqueo" muestra "Mantenimiento — Cancha en reparación"

---

### Bulk actions

**Caso 11 — Bulk bloquear 5 slots con preview** *(mejoras 7, 11)*
- Marcar 5 checkboxes en la lista
- Clic "Bloquear sel." en toolbar
- Si algunos tienen matches: ver preview consolidado en BulkBlockDialog
- Confirmar → todos bloqueados, banner "X slot(s) procesado(s)"

**Caso 12 — Bulk desbloquear**
- Seleccionar slots bloqueados → "Desbloquear sel."
- Resultado esperado: todos vuelven a verde

**Caso 13 — Bulk eliminar (soft-delete)** *(mejora 17)*
- Seleccionar slots → eliminar via acción individual en cada fila
- (Bulk delete no implementado en Phase 1 — ver TODO en SlotManager)

---

### Colores semánticos

**Caso 14 — Verificar colores** *(mejora 8)*

| Estado | Color esperado |
|--------|---------------|
| Disponible (isBlocked=false, sin match) | Verde — badge `.badge--available` |
| Con partido programado (hasScheduledMatch=true) | Amarillo — badge `.badge--match` |
| Bloqueado (isBlocked=true) | Rojo — badge `.badge--blocked` |
| Inactivo/eliminado (isActive=false) | Gris — badge `.badge--inactive` + fila con opacidad 45% |

---

### Historial / Audit log

**Caso 15 — Ver auditoría de un slot** *(mejora 16)*
- Clic editar slot que tuvo varios cambios → tab "Bloquear"
  *(tab Historial deferred a Phase 2 — placeholder visible en modal)*
- En DB: verificar que tabla `slotAuditLog` tiene registros con `previousValue` y `newValue`

**Caso 16 — Soft delete preserva audit log** *(mejoras 16, 17)*
- Eliminar slot → verificar en `slotAuditLog` que la entrada `deleted` existe
- El slot sigue en la lista en estado inactivo
- Ningún endpoint player-facing retorna el slot eliminado

---

### Bloqueos puntuales y por rango (Phase 2)

> Los casos 17–19 están preparados a nivel schema y servicio pero la UI de rango de fechas
> se implementa en Phase 2 (`SlotBlock` table + `blockSlotsByDateRange` mutation).

**Caso 17 — Bloqueo puntual por fecha** *(mejora 2, pendiente Phase 2)*
- Crear un registro en `slotBlocks` con `blockDate = fecha específica`
- Verificar que el slot aparece bloqueado solo ese día desde la vista de jugador

**Caso 18 — Bloqueo por rango de fechas** *(mejora 2, pendiente Phase 2)*
- `slotBlocks` con `startDate` y `endDate`
- Verificar que instancias dentro del rango se muestran bloqueadas

**Caso 19 — Bloqueo recurrente (mejora 2, pendiente Phase 2)**
- `slotBlocks` sin `blockDate` → afecta todas las instancias del slot semanalmente

---

### Solapamiento

**Caso 20 — Validación de solapamiento al editar** *(mejora 18)*
- Slot existente: lunes 18:00–19:00
- Editar para cambiar a 17:30–18:30 (solaparía con otro slot hipotético 17:00–18:00)
- Resultado esperado: error claro del backend

**Caso 21 — Solapamiento con slot inactivo NO bloquea**
- Slot eliminado (isActive=false) lunes 18:00–19:00
- Crear nuevo slot lunes 18:00–19:00
- Resultado esperado: se puede crear sin error (el overlap check filtra por isActive=true)

---

### Precios dinámicos

**Caso 22 — Configurar horario pico** *(mejora 13)*
- Usar mutation `updateCourtPricing`: basePrice=2000, peakMultiplier=1.5, peakDays=[5,6], peakStart=19:00, peakEnd=22:00
- Verificar que `courtPricing` existe en DB

> `CourtPricingPanel` UI → Phase 4

**Caso 23 — Precio final calculado en CourtPricingPanel** *(mejora 13, Phase 4)*
- Pendiente implementación del panel en Phase 4

---

### RLS y seguridad

**Caso 24 — RLS: club_admin de otro club no puede ver/modificar slots ajenos**
- Autenticar con admin de club B
- Intentar query `myClubSlots` → solo devuelve slots de club B
- Intentar mutation `toggleSlotBlock` con slotId de club A → error "No tenés permiso"

**Caso 25 — Usuario no autenticado no puede usar mutations**
- Llamar `createClubSlot` sin token → error "Autenticación requerida"

**Caso 26 — Usuario con rol player no puede usar mutations de admin**
- Autenticar como jugador → `createClubSlot` → error (ya que `requireAuth` pasa, pero
  `requireClubOwnership` retorna null porque no hay club asociado)

---

### Notificaciones (Phase 4)

**Caso 27 — Notificación a jugadores al cancelar match** *(mejora 19)*
- Al confirmar `toggleSlotBlock` con `confirmForce=true` cuando hay matches:
  - Verificar log `[TODO: cancel X matches...]` en consola del backend
  - Verificar entrada en `slotAuditLog` con acción `blocked` y reason
  - Pendiente: Resend email + tabla `notifications`

---

### Misceláneos

**Caso 28 — blockReason con tipo se muestra al jugador** *(mejora 4)*
- Slot bloqueado con blockType=MAINTENANCE, blockReason="Pintura nueva"
- Desde `/partidos/crear`, el slot no aparece como opción (isBlocked=true filtra en
  `getSlotsByClubAndDay`)
- Vista de jugador (Phase 3) mostraría "Bloqueado por Mantenimiento"

---

## Migraciones requeridas (Phase 1)

Ejecutar via Supabase MCP en orden:

```
1. ALTER TABLE "clubSlots"
   ADD COLUMN "blockReason" text,
   ADD COLUMN "blockType" text,
   ADD COLUMN "isActive" boolean NOT NULL DEFAULT true,
   ADD COLUMN "allowOnlineBooking" boolean NOT NULL DEFAULT true,
   ADD COLUMN "duration" int NOT NULL DEFAULT 60,
   ADD COLUMN "updatedBy" uuid REFERENCES auth.users(id),
   ADD COLUMN "updatedAt" timestamptz DEFAULT now();

2. CREATE TABLE "slotAuditLog" (
   "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   "slotId" uuid REFERENCES "clubSlots"(id),
   "action" text NOT NULL,
   "previousValue" jsonb,
   "newValue" jsonb,
   "changedBy" uuid REFERENCES auth.users(id),
   "reason" text,
   "createdAt" timestamptz NOT NULL DEFAULT now()
   );

3. CREATE TABLE "courtPricing" (
   "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
   "courtId" uuid NOT NULL UNIQUE REFERENCES courts(id),
   "basePrice" numeric NOT NULL,
   "peakStart" time,
   "peakEnd" time,
   "peakDays" int[],
   "peakMultiplier" numeric NOT NULL DEFAULT 1.0,
   "offPeakDiscount" numeric NOT NULL DEFAULT 0.0,
   "createdAt" timestamptz NOT NULL DEFAULT now()
   );

4. Verificar que clubs.ownerId existe (FK → auth.users)

5. RLS policies:
   - clubSlots: SELECT público, INSERT/UPDATE/DELETE solo ownerId via join
   - slotAuditLog: SELECT solo ownerId del club asociado, INSERT automático
   - courtPricing: SELECT público, INSERT/UPDATE/DELETE solo ownerId del club

6. Trigger de solapamiento (BEFORE INSERT/UPDATE en clubSlots)
   Trigger de audit log automático (AFTER INSERT/UPDATE/DELETE en clubSlots)
```

---

## Casos adicionales — Phase 1 cierre (29-36)

### Caso 29 — Cancelación real al bloquear con confirmForce=true (P1 / mejora 19)

**Precondición:** Existe un slot con un partido en estado `open` o `full` con `scheduledAt` futuro.

**Pasos:**
1. Ir a Horarios → hacer clic en el slot con partido.
2. Tab "Bloquear" → marcar como bloqueado → clic "Bloquear".
3. El sistema retorna preview: "Hay 1 partido programado. Confirmá con confirmForce=true".
4. En `BulkBlockDialog` (o SlotEditModal): marcar checkbox de confirmación → aplicar.

**Resultado esperado:**
- El slot queda `isBlocked=true` en DB.
- El partido cambia a `status='cancelled'` en DB (verificar en Supabase).
- `cancellationReason` del partido queda poblado con el motivo del bloqueo.
- En la tabla `notifications` aparece una fila por cada jugador del partido con `type='match_cancelled'`.
- El resolver retorna `cancelledMatchesCount=1` y `notifiedPlayersCount=N`.

---

### Caso 30 — Notificaciones en audit log al cancelar (mejora 19)

**Precondición:** Caso 29 ejecutado.

**Pasos:**
1. Abrir el slot bloqueado → tab "Historial".

**Resultado esperado:**
- Aparece una entrada con `action='blocked'` y el motivo del bloqueo.
- El partido cancelado tiene `cancellationReason` visible en la tabla `matches` (verificable en Supabase).
- Los jugadores afectados tienen notificaciones activas (`isRead=false`) en la tabla `notifications`.

---

### Caso 31 — Tab "Historial" con diff visual (P2 / mejora 16)

**Precondición:** Un slot fue editado (precio o tiempo cambiado) al menos una vez.

**Pasos:**
1. Abrir `SlotEditModal` de ese slot.
2. Hacer clic en tab "Historial".

**Resultado esperado:**
- Lista cronológica de cambios (más reciente primero).
- Cada entrada muestra: acción en español ("Actualizado", "Bloqueado", etc.), nombre del admin (o "Administrador" como fallback), fecha relativa ("hace 2 horas").
- Si hay `previousValue` y `newValue`: se muestran los campos cambiados como "campo: antes → después".
- Si no hay registros: aparece "Sin cambios registrados".
- Loading spinner mientras carga.

---

### Caso 32 — Crear match en slot con allowOnlineBooking=false → rechazado (P3)

**Precondición:** Un slot tiene `allowOnlineBooking=false` en DB.

**Pasos:**
1. Como player, intentar crear un partido en ese slot (via API directa con el slotId conocido).

**Resultado esperado:**
- Error: `"Este horario no permite reservas online. Contactá al club para reservar."`
- Ningún partido creado.

---

### Caso 33 — Crear match en slot soft-deleted (isActive=false) → rechazado (P4)

**Precondición:** Un slot tiene `isActive=false` (fue eliminado via soft delete).

**Pasos:**
1. Como player, intentar crear un partido en ese slot (via API directa con el slotId conocido).

**Resultado esperado:**
- Error: `"El horario fue eliminado y no está disponible."`
- Ningún partido creado.

---

### Caso 34 — updatedBy se popula al modificar slot (P5)

**Precondición:** Existe un slot de un club.

**Pasos:**
1. Admin edita el slot (cambia precio o tiempo) desde SlotEditModal → Guardar.

**Resultado esperado:**
- En Supabase, el campo `updatedBy` de `clubSlots` tiene el UUID del admin que realizó el cambio.
- `updatedAt` también se actualiza.
- Antes de cualquier edición, `updatedBy` puede ser NULL (solo tiene valor desde la primera edición).

---

### Caso 35 — Player con registro en clubs intenta mutations → rechazado por rol (P7)

**Precondición (edge case):** Existe un usuario con `role=player` que tiene un registro en la tabla `clubs` (seed mal configurado).

**Pasos:**
1. Autenticarse como ese player.
2. Intentar llamar la mutation `createClubSlot` con un slotId válido.

**Resultado esperado:**
- Error: `"Solo administradores de club pueden realizar esta acción"`
- La verificación explícita de `profile.role === 'club_admin'` en el resolver bloquea antes del service.

---

### Caso 36 — updateCourtPricing falla → response consistente { success: false, message } (P6)

**Precondición:** Un courtId inválido (no pertenece al club del admin autenticado).

**Pasos:**
1. Llamar mutation `updateCourtPricing` con un `courtId` de otro club.

**Resultado esperado:**
- Response: `{ success: false, courtPricing: null, message: "Esta cancha no pertenece a tu club" }` (o similar).
- El formato es consistente con el resto de mutations (no es un error Apollo crudo).
- Se registra en los logs del servidor con `[club-slot.resolver.updateCourtPricing] Error:`.

---

## Fases futuras

| Mejora | Fase |
|--------|------|
| Vista calendario semanal (1) | Phase 2 |
| Bloqueos por rango/puntuales UI (2) | Phase 2 |
| slotBlocks table | Phase 2 |
| Bulk actions con calendario drag (9) | Phase 4 |
| Plantillas predefinidas UI (10) | Phase 2 |
| Preview visual impacto en modal (11 completo) | Phase 2 |
| CourtPricingPanel UI (13) | Phase 4 |
