# Sumate Ya

## Docker para el equipo

Levanta todo (backend + frontend servido por backend + PostgreSQL) con un solo comando.

### Requisitos
- Docker Desktop instalado

### Ejecutar
```bash
docker compose up --build -d
```

La primera vez puede tardar varios minutos (instala dependencias dentro de la imagen).

Si aparece conflicto de contenedor existente (por ejemplo `sumateya-postgres`), corré:

```bash
docker rm -f sumateya-postgres
```

y luego repetí:

```bash
docker compose up --build -d
```

### Abrir app
- http://localhost:4000

### Ver logs
```bash
docker compose logs -f app
```

### Bajar servicios
```bash
docker compose down
```

### Limpiar también la base de datos (opcional)
```bash
docker compose down -v
```

## Variables opcionales
Podés sobreescribir desde un archivo `.env` en la raíz:

```env
POSTGRES_DB=sumateya
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_PORT=5433
APP_PORT=4000
JWT_SECRET=sumate-ya-super-secret-change-me
JWT_EXPIRES_IN=24h
```

Si el puerto `4000` está ocupado en tu PC, cambiá `APP_PORT` (por ejemplo `APP_PORT=4001`) y abrí `http://localhost:4001`.

## Nota
Al iniciar el contenedor `app`, se ejecutan automáticamente:
- build de frontend
- build de backend
- migraciones
- seed de datos

Esto asegura que todos los compañeros tengan la misma base actualizada al levantar el entorno.
