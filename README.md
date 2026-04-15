# Sumate Ya

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