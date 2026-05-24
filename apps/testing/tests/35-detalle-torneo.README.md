# Tests E2E — US #35 Detalle de Torneo

## Cómo correr los tests

Desde la raíz del monorepo:

```bash
# Correr solo los tests de esta US
pnpm --filter @sumate-ya/testing exec playwright test 35-detalle-torneo

# Con modo UI (ver el navegador)
pnpm --filter @sumate-ya/testing exec playwright test 35-detalle-torneo --headed

# Filtrar por nombre de test
pnpm --filter @sumate-ya/testing exec playwright test 35-detalle-torneo --grep "fixture"
```

Desde el directorio `apps/testing`:

```bash
pnpm exec playwright test tests/35-detalle-torneo.spec.ts
```

> El backend y el frontend deben estar corriendo antes de ejecutar los tests.
> `pnpm dev` en la raíz levanta ambos servicios.

---

## Dependencias con otras USs

### US #21 — Crear Torneo (setup de datos)

El seed (`apps/testing/scripts/seed.ts`) crea tres torneos usados por los tests:

| Constante `SEED_TOURNAMENTS` | Estado        | Uso en esta US                        |
| ---------------------------- | ------------- | ------------------------------------- |
| `open`                       | `upcoming`    | Tests de estado vacío de equipos      |
| `withCaptainMateo`           | `upcoming`    | Tests de visualización de equipos     |
| `withFixture`                | `in_progress` | Tests de fixture con resultados       |

El seed se ejecuta automáticamente como `globalSetup` de Playwright antes del primer test.
Si los torneos ya existen (idempotente vía `ON CONFLICT DO NOTHING`), el seed sólo actualiza
los campos que pudieron cambiar.

### US #39 — Unirse a Torneo (solapamiento de cobertura)

`unirse-torneo.spec.ts` ya cubre:
- Botón "Inscribirse" visible para jugador sin equipo
- Botón "Inscribirse" visible para capitán
- Panel de capitán para capitán del equipo ya inscripto
- Flujo completo de inscripción (join + redirect)

Los tests de esta US (#35) evitan duplicar esa cobertura y se enfocan en:
- Visualización estática de la página (hero, info-grid, lista de equipos)
- Visualización del fixture con resultados
- Comportamiento para visitante anónimo
- Seguridad: query pública OK, mutation sin auth bloqueada
- Responsive mobile

---

## Qué cubren estos tests

### 1. Hero y metadatos (`describe: Visualización del encabezado`)
- Nombre del torneo visible en el `<h1>` del hero
- Descripción del torneo visible
- Metadatos (club organizador, formato, fechas) visibles en `.hero-meta`

### 2. Grilla de información (`describe: Grilla de información`)
- Los 4+ campos clave (estado, inscriptos/total, formato, categoria) son visibles
- Capacidad total correcta (`SEED_CAPACITY = 8`)

### 3. Equipos inscriptos (`describe: Lista de equipos inscriptos`)
- Cuando hay equipos: tarjeta por equipo, nombre de capitán visible, lista de jugadores
- Cuando no hay equipos: estado vacío visible, botón de inscripción visible

### 4. Fixture de partidos (`describe: Fixture de partidos`)
- Match completado muestra resultado (`scoreHome - scoreAway`)
- Match completado muestra marca "Jugado"
- Match programado muestra estado `SCHEDULED` (sin score)
- Ordenamiento: el match de ronda 1 aparece antes que ronda 2

### 5. Visitante anónimo (`describe: Visitante anónimo`)
- La página carga sin credenciales
- El botón de inscripción NO es visible para anónimos

### 6. Seguridad API (`describe: Seguridad API`)
- `query tournament` sin token de auth resuelve OK (lectura pública)
- `mutation joinTournament` sin token retorna error de autenticación

### 7. Responsive mobile (`describe: Responsive mobile`)
- Info-grid en columna única en 375 px sin overflow horizontal

---

## Qué NO cubren estos tests

- Flujo de inscripción (cubierto en `39-unirse-torneo.spec.ts`)
- Panel de capitán (cubierto en `39-unirse-torneo.spec.ts`)
- Creación del torneo (cubierto en `crear-torneo.spec.ts`)
- División y ranking (cubierto en `41-division-y-ranking.spec.ts`)
- Tests de performance / carga
- Comportamiento con errores de red en el backend (SSR no interceptable con `page.route`)

---

## data-testid faltantes en el frontend

Los siguientes selectores usados por los tests **no tienen `data-testid`** asignado y dependen
de clases CSS o roles ARIA. Si el equipo refactoriza el HTML, estos selectores pueden romperse:

| Selector actual             | Dónde se usa                  | `data-testid` sugerido        |
| --------------------------- | ----------------------------- | ----------------------------- |
| `.hero-description`         | `heroDescription` locator     | `tournament-hero-description` |
| `.hero-meta`                | `heroMeta` locator            | `tournament-hero-meta`        |
| `[aria-label="Datos del torneo"]` | `infoGrid` locator      | `tournament-info-grid`        |
| `h2` con texto "Equipos inscriptos" | `teamsHeading` locator | `tournament-teams-heading`   |
| `article.team-row`          | `teamCards` locator           | `tournament-team-card`        |
| `.detail-section .empty-state` | `emptyTeamsState` locator  | `tournament-teams-empty`      |
| `.capacity-number`          | `capacityNumber` locator      | `tournament-capacity-number`  |
| `.nf-title`                 | `notFoundMessage` locator     | `tournament-not-found-title`  |
| `.fixture-match--played`    | `fixturePlayed` locator       | `fixture-match-played`        |
| `.played-mark`              | `fixturePlayedMark` locator   | `fixture-played-mark`         |
| `.fixture-match__score`     | `fixtureMatchScore()` locator | `fixture-match-score`         |

Añadir estos `data-testid` haría los tests más robustes frente a cambios de estilos.
