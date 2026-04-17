# Sumate Ya

## Tareas Board

> Source: [Notion Board](https://www.notion.so/618a9c6a8a848387b6a781f21ccf6fc3) — 40 tasks total

### Sprint 1

| Task | Status | Priority | Effort | Assignee |
| --- | --- | --- | --- | --- |
| 💻 Crear prototipo funcional | ✅ Done | Medium | 1 | Mateo Durán |
| 📎 Crear esquema base de datos | ✅ Done | High | 2 | juanma sanchez |
| 📄 Crear secciones en Notion | ✅ Done | — | 1 | juanma sanchez |
| 📎 Crear repositorio base | ✅ Done | High | 2 | juanma sanchez |
| ⚙️ Configurar ambiente | ✅ Done | High | 1 | (team) |
| 🔑 Login y sesión | 🔍 Reviewing | High | 3 | — |
| ⚽ Listado de partidos | 🧪 Testing | High | 5 | Mateo Durán |
| 🔐 Registro de jugador | 🚧 In development | High | 3 | — |
| ⚙️ Configurar repositorio de test | 🚧 In development | High | 3 | juanma sanchez |
| 🏢 Registro de club | ⬜ Not started | High | 3 | — |
| 🚪 Logout y manejo de sesión | ⬜ Not started | Medium | 2 | Mateo Durán |

### Sprint 2

| Task | Status | Priority | Effort | Assignee |
| --- | --- | --- | --- | --- |
| ➕ Crear partido | ⬜ Not started | High | 5 | — |
| 📋 Detalle de partido | ⬜ Not started | High | 5 | — |
| 👤 Ver perfil de usuario | ⬜ Not started | High | 3 | — |
| 🗳️ Votar resultado | ⬜ Not started | High | 5 | — |
| ✋ Unirse a partido | ⬜ Not started | High | 3 | — |
| ✅ Cargar resultado de partido | ⬜ Not started | High | 5 | — |
| 🏆 Confirmar resultado y actualizar stats | ⬜ Not started | High | 3 | — |
| 🔍 Filtrar partidos | ⬜ Not started | Medium | 3 | — |
| 🚪 Abandonar partido | ⬜ Not started | Medium | 3 | — |
| 📊 Historial de partidos jugados | ⬜ Not started | Medium | 3 | — |
| 🗑️ Auto-eliminar partido sin jugadores | ⬜ Not started | Medium | 2 | — |
| 🗺️ Ver partidos en mapa | ⬜ Not started | Medium | 5 | — |
| 📸 Subir foto de perfil | ⬜ Not started | Medium | 3 | — |

### Sprint 3

| Task | Status | Priority | Effort | Assignee |
| --- | --- | --- | --- | --- |
| 🔒 Bloquear/gestionar horarios | ⬜ Not started | High | 5 | — |
| 🏟️ Panel de club — ver partidos | ⬜ Not started | High | 5 | — |
| ➕ Crear torneo | ⬜ Not started | Medium | 5 | — |
| 🏟️ Crear partidos desde club | ⬜ Not started | Medium | 3 | — |
| 🏆 Listado de torneos | ⬜ Not started | Medium | 5 | — |
| 📋 Detalle de torneo | ⬜ Not started | Medium | 5 | — |
| ✋ Unirse a torneo | ⬜ Not started | Medium | 3 | — |
| 🔑 Cambiar contraseña | ⬜ Not started | Medium | 2 | — |
| 🏅 División y ranking | ⬜ Not started | Medium | 3 | — |
| 🔒 Ajustes de privacidad | ⬜ Not started | Medium | 2 | — |

### Sprint 4

| Task | Status | Priority | Effort | Assignee |
| --- | --- | --- | --- | --- |
| 📊 Leaderboard / winrate | ⬜ Not started | Medium | 5 | — |
| 🗺️ Ver torneos en mapa | ⬜ Not started | Low | 3 | — |
| 🎬 Montajes IA de highlights | ⬜ Not started | Low | 8 | — |
| 🚪 Abandonar torneo | ⬜ Not started | Low | 2 | — |
| 🔍 Filtrar torneos | ⬜ Not started | Low | 2 | — |

### Progress Summary

| Status | Count |
| --- | --- |
| ✅ Done | 5 |
| 🔍 Reviewing | 1 |
| 🧪 Testing | 1 |
| 🚧 In development | 2 |
| ⬜ Not started | 31 |

---

## Puesta en marcha

### 1) Instalar dependencias

```bash
npm i -g pnpm
pnpm install
```

### 2) Configurar variables de entorno

Creá un archivo `.env` en el root del repo con estas variables:

```env
PRIVATE_SUPABASE_SECRET_KEY=<tu_secret_key>
SUPABASE_URL=https://getfqjkfsueucoalvtcc.supabase.co
SUPABASE_ANON_KEY=<tu_anon_key>
```

`PRIVATE_SUPABASE_SECRET_KEY` debe ser una key de servidor `sb_secret_...`. Los nombres viejos `SUPABASE_SECRET_KEY` y `SUPABASE_SERVICE_KEY` quedan soportados sólo como compatibilidad temporal.

> [!IMPORTANT]
> Sin el `.env` en la raíz del proyecto, la app no puede levantar correctamente.

### 3) Vincular `.env` a las apps

```bash
pnpm run sumate-ya
```

> [!NOTE]
> Este comando crea un symlink del `.env` sólo para `apps/backend/.env` y funciona solo en sistemas Unix.
> El frontend no hereda secretos del backend; usa su propio `apps/frontend/.env` sólo si necesitás configurar `PRIVATE_BACKEND_URL`.

> [!TIP]
> En Windows, copiá manualmente el `.env` a:
>
> - `apps/backend/.env`

Si querés apuntar el frontend a otro backend, creá `apps/frontend/.env` con:

```env
PRIVATE_BACKEND_URL=http://localhost:4000
```

### 4) Levantar entorno de desarrollo

```bash
pnpm run dev
```

### Test repository.
npm install --save-dev @playwright/test

Inside that directory, you can run several commands:

  npx playwright test
    Runs the end-to-end tests.

  npx playwright test --ui
    Starts the interactive UI mode.

  npx playwright test --project=chromium
    Runs the tests only on Desktop Chrome.

  npx playwright test example
    Runs the tests in a specific file.

  npx playwright test --debug
    Runs the tests in debug mode.

  npx playwright codegen
    Auto generate tests with Codegen.

We suggest that you begin by typing:

    npx playwright test