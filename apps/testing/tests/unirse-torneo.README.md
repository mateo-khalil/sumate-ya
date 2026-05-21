# US #39 — Unirse a Torneo: E2E Tests

Spec: `apps/testing/tests/unirse-torneo.spec.ts`
Page Object: `apps/testing/tests/support/page-objects/TournamentDetailPage.ts`

---

## Cómo correr los tests

```bash
# Desde la raíz del monorepo
cd apps/testing
pnpm test:e2e:39

# Con interfaz visual (headed)
pnpm test:headed --grep "Unirse a torneo|Inscripción|capitán|Responsive"

# Un solo test
pnpm test:headed --grep "puede inscribir un equipo"
```

El servidor de desarrollo (frontend + backend) se levanta automáticamente si no está corriendo.
Los logs del servidor se redirigen a `apps/testing/server.log`.

---

## Qué cubren los tests

### Bloque 1 — Inscripción (22 tests totales, 6 en este bloque)

| Test | Descripción |
|------|-------------|
| Formulario visible | Player autenticado ve el form de inscripción en torneo abierto |
| Inscripción exitosa | Nombre válido → mensaje de confirmación visible |
| Validación nombre vacío | Submit sin nombre → error client-side, sin request al backend |
| Error nombre duplicado | Backend retorna "ya existe" → error inline |
| Error cupos completos | Backend retorna "cupos completos" → error inline |
| Payload correcto | tournamentId y teamName llegan correctos al backend |
| Usuario anónimo | Login CTA visible en lugar del formulario |

### Bloque 2 — Gestión de miembros / capitán (7 tests)

| Test | Descripción |
|------|-------------|
| Panel visible | Capitán ve su equipo en el panel de administración |
| Buscador visible | Input de búsqueda de miembros se muestra |
| Agregar miembro | Resultado de búsqueda → click → mensaje de éxito |
| Error al agregar (ya en otro equipo) | Error del backend → mensaje inline |
| Error al agregar (límite de equipo) | Error del backend → mensaje inline |
| Sin miembros removibles | Lista de chips oculta si el equipo solo tiene al capitán |
| No-capitán ve formulario | playerMichel en torneo del capitán → ve el form de registro |

### Bloque 3 — Fixture (2 tests)

| Test | Descripción |
|------|-------------|
| Fixture vacío | Mensaje "El fixture todavia no fue generado" visible |
| Sección visible | La sección de fixture existe en la página |

### Bloque 4 — Seguridad (3 tests)

| Test | Descripción |
|------|-------------|
| joinTournament sin auth | Retorna error GraphQL de autenticación |
| addMember sin auth | Retorna error GraphQL de autenticación |
| Nombre de 1 caracter | Error client-side, sin request al backend |

### Bloque 5 — Responsive (6 tests)

| Test | Descripción |
|------|-------------|
| Sin overflow mobile 375px | No hay scroll horizontal |
| Elementos visibles mobile | Heading, status, botón visibles |
| Touch target mobile | Botón ≥ 40px de altura |
| Sin overflow tablet 768px | No hay scroll horizontal |
| Panel capitán en mobile | Panel visible en 375px |
| Vista desktop 1280px | Todas las secciones visibles simultáneamente |

### Bloque 6 — Navegación (3 tests)

| Test | Descripción |
|------|-------------|
| Volver a torneos | Link navega a /torneos |
| Login CTA navega | Click en CTA lleva a /login |
| UUID inválido | Redirige a /torneos |

---

## Datos de prueba (seeds)

Los torneos son creados por `apps/testing/scripts/seed.ts` (Playwright globalSetup):

| Constante | UUID | Descripción |
|-----------|------|-------------|
| `SEED_TOURNAMENTS.open` | `t1000000-0000-0000-0000-000000000001` | Inscripción abierta, sin equipos |
| `SEED_TOURNAMENTS.withCaptainLucas` | `t1000000-0000-0000-0000-000000000002` | Inscripción abierta, equipo de Lucas pre-registrado |

Usuarios de prueba:

| Clave | Email | Rol en los tests |
|-------|-------|-----------------|
| `playerLucas` | lucas@test.com | Capitán en la mayoría de los tests |
| `playerMichel` | testloginmichel@sumateya.com | Miembro candidato, no-capitán |
| `playerMateo` | mateoduran2010@gmail.com | No usado en esta suite |

---

## Arquitectura de mocking

La página `/torneos/[id]` es SSR (`prerender = false`). La carga inicial de datos
va del servidor Astro al backend directamente (no pasa por el browser) → **no se puede interceptar con `page.route()`**.

Por eso los tests usan datos reales del seed. Lo que SÍ se puede mockear:

- `POST /api/graphql-auth` → todas las mutaciones del formulario (joinTournament,
  addTournamentTeamMember, removeTournamentTeamMember) y la query de jugadores elegibles
  se interceptan en el browser con `page.route(GRAPHQL_AUTH_ROUTE, ...)`.

**Flujo típico de un test de inscripción:**
1. Mock de `/api/graphql-auth` para devolver éxito/error controlado
2. `tournamentOpenPage.goto()` → SSR carga datos reales del seed
3. `waitForFormHydrated()` → espera que la isla React se hidrate
4. Interacción con el formulario → el mock intercepta la request
5. Assertion del mensaje de respuesta

---

## Limitaciones conocidas (tests manuales)

Los siguientes escenarios **no están cubiertos en esta suite** y requieren validación manual:

### 1. Quitar miembro con chip visible

Para mostrar el chip de un miembro removible, se necesita un equipo con 2+ miembros en la DB.
El seed solo agrega al capitán como miembro. Para testear el chip de quitar:
- Agregar un segundo miembro al equipo de Lucas directamente en el seed
- O extender seed.ts para llamar a `joinTournament` + `addTournamentTeamMember`

### 2. Generación de fixture al completar inscripciones

Requiere que todos los `teamCount` equipos se inscriban secuencialmente. En el setup actual
con 4 equipos, se necesitarían 4 llamadas reales a `joinTournament` con usuarios distintos.
Complejidad: alta. Recomendado: test de integración en el backend.

### 3. Constraint "un jugador solo en un equipo por torneo" (UI)

La validación existe en el backend y se testea vía test de seguridad (error de backend).
Para el flujo UI completo se necesitaría que un jugador ya esté inscripto en otro equipo
del mismo torneo — requiere setup de datos complejo.

### 4. Inscripción con miembros pre-seleccionados

El formulario permite seleccionar miembros antes de hacer submit. La lógica de
`memberIds` en el payload es correcta (verificado en test de payload), pero la
interacción completa (buscar + seleccionar + submit) requiere una cuenta de
jugador disponible en la query de elegibles real.

---

## data-testid faltantes

Los componentes no tienen `data-testid`. Agregar los siguientes permitiría reemplazar
selectores CSS frágiles por selectores estables:

| data-testid | Componente | Dónde agregarlo |
|-------------|-----------|----------------|
| `tournament-join-form` | `<form>` de registro | TournamentRegistrationForm.tsx |
| `tournament-team-name-input` | Input de nombre del equipo | TournamentRegistrationForm.tsx |
| `tournament-submit-join` | Botón "Anotar equipo" | TournamentRegistrationForm.tsx |
| `tournament-form-error` | `<p role="alert">` | TournamentRegistrationForm.tsx |
| `tournament-form-message` | `<p role="status">` | TournamentRegistrationForm.tsx |
| `tournament-captain-panel` | `.captain-panel` div | TournamentRegistrationForm.tsx |
| `tournament-member-search` | Input búsqueda (capitán) | TournamentRegistrationForm.tsx |
| `tournament-member-chip` | Chip de miembro removible | TournamentRegistrationForm.tsx |
| `tournament-player-result` | Botón de resultado de búsqueda | TournamentRegistrationForm.tsx |
| `tournament-login-cta` | Link de login para anónimos | TournamentRegistrationForm.tsx |
| `tournament-registration-closed` | `.registration-closed` | TournamentRegistrationForm.tsx |
| `tournament-status-pill` | `.status-pill` | [id].astro |
| `tournament-capacity-number` | `.capacity-number` | [id].astro |
