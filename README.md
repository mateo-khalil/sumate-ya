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
SUPABASE_SERVICE_KEY=<tu_service_key>
SUPABASE_URL=https://getfqjkfsueucoalvtcc.supabase.co
```

> [!IMPORTANT]
> Sin el `.env` en la raíz del proyecto, la app no puede levantar correctamente.

### 3) Vincular `.env` a las apps

```bash
pnpm run sumate-ya
```

> [!NOTE]
> Este comando crea un symlink del `.env` para cada app y funciona solo en sistemas Unix.

> [!TIP]
> En Windows, copiá manualmente el `.env` a:
> - `apps/backend/.env`
> - `apps/frontend/.env`

### 4) Levantar entorno de desarrollo

```bash
pnpm run dev
```
