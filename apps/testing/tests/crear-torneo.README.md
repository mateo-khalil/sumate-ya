# Tests E2E — US #21 Crear Torneo

Spec: `apps/testing/tests/crear-torneo.spec.ts`
Page Object: `apps/testing/tests/support/page-objects/CreateTournamentPage.ts`

---

## Cómo correr los tests

```bash
# Desde apps/testing (requiere backend + frontend corriendo)
pnpm test:e2e:21

# Con UI del navegador visible
pnpm test:headed -- crear-torneo.spec.ts

# Solo un test específico
pnpm test -- --grep "torneo con datos válidos"

# Toda la suite completa
pnpm test
```

El comando `test:e2e:21` levanta el stack via `turbo dev` si no está corriendo
(reuseExistingServer en local). En CI siempre arranca fresh.

---

## Qué cubre esta suite (23 tests)

| Grupo | Descripción |
|---|---|
| Autenticación | Redirect anónimo a /login, acceso de player, acceso de club_admin |
| Estructura del form | Todos los campos requeridos visibles |
| Métricas round-robin | 4 equipos→6 partidos, 6 equipos→15 partidos, 2 equipos→1 partido |
| Selección de horarios | Slots cargados, deshabilitado sin slots, selección actualiza contador y rounds list |
| Validación del form | Deshabilitado sin nombre, deshabilitado con nombre < 3 chars |
| Flujo exitoso | Pantalla de éxito, nombre y fixture count mostrados, reset del form, payload correcto |
| Errores backend | Horario ocupado inline, error genérico inline, error de carga de slots, sin slots disponibles |
| Navegación | Link en /torneos, link en /panel-club/dashboard (admin), nav Partidos |
| Seguridad | Mutation sin token retorna error de auth |
| Responsive | Sin scroll horizontal en 375px, campos visibles en 375px, touch target ≥40px, tablet 768px |

---

## Qué no cubre y por qué

### Generación de fixture al completar inscripciones

Los tests de "torneo con 4 equipos genera 6 partidos al completar inscripciones" y
"torneo con 6 equipos genera 15 partidos" **no están automatizados** porque:

1. Requieren crear un torneo real en la DB (no es posible mockear la creación en SSR).
2. Luego registrar `teamCount` equipos via `registerTournamentTeam` (N API calls).
3. Luego leer los `fixtureMatches` con `homeTeamId`/`awayTeamId` seteados.
4. Luego limpiar todos esos registros (torneo + equipos + fixtureMatches) con `service_role`.
5. El flujo completo tomaría >30s y requeriría acceso a service_role key en tests.

**Alternativa cubierta**: los tests de métricas round-robin verifican el cálculo
client-side (que el form muestre "6 partidos" para 4 equipos, "15" para 6 equipos).
La lógica del servidor está cubierta por tests unitarios en `apps/backend/`.

### fixtureMatches tiene campos correctos (homeTeam, awayTeam, round, scheduledAt)

Por la misma razón — requiere datos reales. El test "payload enviado al backend
contiene los campos correctos" verifica que el frontend envía `schedule` con el
formato correcto (`[{ slotId, date }]`).

### fixture NO se genera antes de completar inscripciones

Comportamiento del backend verificado por tests unitarios. El E2E solo puede
constatar que el torneo recién creado queda en estado `REGISTRATION` (cero equipos
inscritos), lo cual está implícito en el mock de success.

### Edición de torneo creado por otro usuario

No existe página de edición de torneos en el frontend actual (v1).

---

## data-testid faltantes

Los siguientes atributos deberían agregarse a `CreateTournamentFlow.tsx` para que
los selectores del test sean estables y no dependan de CSS classes:

```
data-testid="tournament-name-input"        → <input> del campo Nombre
data-testid="tournament-club-select"       → <select> del club
data-testid="tournament-team-count-input"  → <input type="number"> Equipos
data-testid="tournament-players-input"     → <input type="number"> Jugadores por equipo
data-testid="tournament-description"       → <textarea> Descripción
data-testid="tournament-slot-date"         → <input type="date"> en slot-toolbar
data-testid="tournament-format-chip"       → cada <button> de formato (+ data-value="5v5")
data-testid="tournament-slot-option"       → cada <button> de horario (+ data-slot-id attr)
data-testid="tournament-submit"            → botón "Crear torneo"
data-testid="tournament-success"           → contenedor TORNEO CREADO
data-testid="tournament-submit-error"      → div.submit-error
data-testid="tournament-metric-matches"    → <strong> dentro de metric "partidos"
data-testid="tournament-metric-remaining"  → <strong> dentro de metric "horarios faltan"
```

---

## Tests manuales recomendados

Los siguientes casos son difíciles de automatizar pero deben cubrirse manualmente
en cada release:

1. **Fixture real end-to-end**: crear torneo de 4 equipos → registrar 4 equipos →
   verificar que `fixtureMatches` tiene homeTeamId/awayTeamId correctos.

2. **Conflicto de horario con partido existente**: crear un partido en un horario,
   luego intentar crear un torneo con ese mismo horario — debe rechazarse.

3. **Formato incompatible con cancha**: seleccionar un horario cuya cancha tiene
   `maxFormat < formato elegido` — el backend debe rechazarlo con error descriptivo.

4. **Torneo con horario en el pasado**: seleccionar una fecha anterior a hoy —
   backend debe rechazar "Todos los horarios del torneo deben ser futuros".

5. **Visualización en iOS Safari 17**: el date picker nativo puede tener
   comportamiento diferente al de Chrome.

---

## Arquitectura de mocking

```
Cliente (browser)
    │
    ├─ GET /torneos/crear ──→  backend SSR (REAL) ──→ clubs list
    │                         ↳ requires auth
    │
    ├─ POST /api/graphql ──→  MOCK (mockTournamentSlots)
    │    { query: GET_CLUB_SLOTS, variables: { clubId, date } }
    │    ↳ returns { data: { clubSlots: [DEFAULT_MOCK_SLOT] } }
    │
    └─ POST /api/graphql-auth ──→  MOCK (mockCreateTournament)
         { query: CREATE_TOURNAMENT, variables: { input } }
         ↳ returns success or error shape
```

El handler de slots omite `/api/graphql-auth` (comprueba la URL antes de mockear)
para evitar que intercepte la mutation de creación.
