# División y Ranking — E2E Tests (US #41 / PR #124)

## Cómo correr los tests

```bash
# Desde apps/testing/
pnpm test:e2e:41

# O directamente con Playwright:
pnpm exec playwright test tests/division-ranking.spec.ts

# Con UI mode (ver ejecución en tiempo real):
pnpm exec playwright test tests/division-ranking.spec.ts --ui

# Un solo grupo:
pnpm exec playwright test tests/division-ranking.spec.ts --grep "Badge de división en perfil"
```

Antes de correr los tests, asegurate de que el stack esté levantado (`pnpm dev`) y de haber corrido el setup de auth (`pnpm exec playwright test --project=setup`).

---

## Qué cubren estos tests

### Grupo 1 — Badge en perfil propio (`/perfil`)

| Test | Qué verifica |
|------|-------------|
| Jugador autenticado ve badge | `.division-badge` visible en la card de perfil |
| Clase CSS correcta | La clase `division-{bronze,silver,gold,diamond}` corresponde al nivel de la API |
| Atributo `title` correcto | `title="División {Nombre}"` para accesibilidad |
| Indicador `D1–D4` correcto | El span `.division-mark` muestra `D{level}` |

### Grupo 2 — Consistencia de umbrales

| Test | Qué verifica |
|------|-------------|
| División API consistente con stats | `division == computeExpectedDivision(matchesPlayed, matchesWon)` |
| `< 5 partidos → Bronce` | División 1 si matchesPlayed < 5 (puede saltearse según el estado de la DB) |
| Umbrales correctos en TS | Las constantes de `DIVISION_THRESHOLDS` reproducen fielmente la función SQL |

### Grupo 3 — Badge en listado de participantes (`/partidos/[id]`)

| Test | Qué verifica |
|------|-------------|
| Badge presente en player-cards | Al menos un `.player-card` tiene `.division-badge` |
| Modo compacto | Todos los badges en player-cards tienen `.division-badge--compact` |
| Badge de playerMateo correcto | Badge con clase CSS correcta en la card del seed player |

### Grupo 4 — Privacidad (`showDivision` — integración con US #53)

| Test | Qué verifica |
|------|-------------|
| Owner siempre ve su división | `myProfile.division` no es null aunque `showDivision=false` |
| `showDivision=false` → `division=null` para visitante | API filtra la división cuando el owner la ocultó |
| `showDivision=true` → división real | API devuelve el valor correcto cuando está habilitado |
| Perfil `isPublic=false` → sin badge | Perfil privado no muestra `.division-badge` a visitantes |

### Grupo 5 — Responsive

| Test | Viewport | Qué verifica |
|------|---------|-------------|
| Mobile | 375×812 | Badge sin overflow horizontal |
| Tablet | 768×1024 | Badge visible, altura mínima 16px |
| Desktop | 1280×800 | Badge dentro del max-width del card |
| Mobile en partido | 375×812 | Badge en player-card sin overflow |

### Grupo 6 — Mapeo visual y helper

| Test | Qué verifica |
|------|-------------|
| `DIVISION_CSS_CLASS` | Constantes 1→bronze … 4→diamond |
| `DIVISION_NAME` | Constantes 1→Bronce … 4→Diamante |
| `expectDivisionBadge` | Helper completo (clase + title) contra el perfil real |

---

## Qué NO cubren (limitaciones)

### 1. Test "player con 0 partidos → Bronce"

El test `'player con menos de 5 partidos confirmados tiene división Bronce'` se saltea
automáticamente si `playerMateo` ya tiene ≥ 5 partidos en la DB. Para cubrir este caso
correctamente se necesita una cuenta limpia (sin historial). Las credenciales sugeridas son:

```
testloginmichel@sumateya.com / Test1234!
```

Para habilitarlo:
1. Agregar en `support/users.ts`:
   ```typescript
   playerMichel: {
     email: 'testloginmichel@sumateya.com',
     password: 'Test1234!',
     storageStatePath: path.join(AUTH_DIR, 'player-michel.json'),
   }
   ```
2. Agregar en `tests/auth.setup.ts`:
   ```typescript
   setup('authenticate as player Michel', async ({ page }) => {
     const login = new LoginPage(page);
     await login.loginAs(TEST_USERS.playerMichel);
     await page.context().storageState({ path: TEST_USERS.playerMichel.storageStatePath });
   });
   ```
3. Crear un describe separado con `test.use({ storageState: TEST_USERS.playerMichel.storageStatePath })`.

### 2. Test "división sube/baja automáticamente al confirmar resultado"

Este test requiere crear un partido, inscribir jugadores, votar el resultado y luego
verificar que `division` cambió. Es un flujo de 4 pasos con estado mutable; se puede
implementar como un test de integración más largo (> 30 s). No se incluye aquí para
mantener cada test dentro del presupuesto de 15 s.

### 3. Snapshots visuales del badge por nivel

Los tests de snapshot visual (DivisionBadge Bronce/Plata/Oro/Diamante) requieren
cuentas con divisions conocidas y datos de seed deterministas por nivel. Por ahora
se verifica la clase CSS (suficiente para detectar regresiones de color).

### 4. `data-testid` en DivisionBadge

**TODO** — `DivisionBadge.astro` no tiene `data-testid`. Los tests usan la clase CSS
`.division-badge` y el atributo `title` como locators. Para robustez adicional
agregar `data-testid="division-badge"` al span raíz en `DivisionBadge.astro`.

---

## Dependencias de datos (seed)

- `SEED_MATCHES.full` (`e1000000-0000-0000-0000-000000000001`): partido completo con
  `playerMateo` inscripto en team B. Producido por `scripts/seed.ts`.
- `playerMateo` (`mateoduran2010@gmail.com`): usuario principal, tiene algún historial
  de partidos en la DB de desarrollo (división varía según el estado real).

---

## data-testid que faltan agregar al código de la app

| Componente | Selector actual | `data-testid` sugerido |
|-----------|----------------|------------------------|
| `DivisionBadge.astro` (raíz) | `.division-badge` | `division-badge` |
| `DivisionBadge.astro` (mark) | `.division-mark` | `division-level-mark` |
| `DivisionBadge.astro` (name) | `.division-name` | `division-level-name` |

Estos `data-testid` harían los tests agnósticos al nombre de clase CSS y más resilientes
a cambios de diseño.
