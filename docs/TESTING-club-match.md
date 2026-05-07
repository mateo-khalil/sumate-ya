# Testing Manual — Crear Partido desde Panel de Club (/panel-club/crear-partido)

## Contexto

El club admin puede crear partidos directamente desde el panel sin ser un jugador.
El partido se crea con `organizedByClub=true` y el organizador NO se auto-inscribe por defecto.
El flow original de players (`/partidos/crear`) no se ve afectado.

---

## Casos de prueba

### Autenticación y acceso

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 1 | Navegar a `/panel-club/crear-partido` como club_admin | Wizard cargado, Step 1 visible |
| 2 | Navegar como player | Redirect a `/login?reason=role-required` |
| 3 | Navegar sin autenticación | Redirect a login |
| 4 | Acceder a la página | Sidebar muestra "Crear partido" como activo |
| 5 | Sidebar del Panel Principal | Links "Dashboard", "Crear partido", "Horarios" visibles |
| 6 | Sidebar de Horarios | Links "Dashboard", "Crear partido" visibles |

### Quick access

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 7 | Botón "Crear partido" en Panel Principal (`/panel-club`) | Navega a `/panel-club/crear-partido` |
| 8 | Link sidebar "Crear partido" en Horarios | Navega correctamente |
| 9 | Pre-fill via `?slotId=...&date=...` | Step 1 auto-completa la selección y avanza a Step 2 |

### Step 1: Selección de horario

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 10 | Cargar Step 1 | Lista de slots disponibles agrupados por cancha |
| 11 | Slots con match futuro | Aparecen en gris con ícono candado "Ocupado", no seleccionables |
| 12 | Slots sin match | Seleccionables, click los selecciona (borde naranja) |
| 13 | Slot con `allowOnlineBooking=false` | Aparece igualmente (admin override, `includeNonBookable=true`) |
| 14 | Cambiar rango de fechas | Botón "Buscar" recarga los slots |
| 15 | Solo 1 cancha en el club | Pre-seleccionada automáticamente (grupos sin opción de filtrar) |
| 16 | Botón "Siguiente" deshabilitado sin selección | No se puede avanzar si no hay slot seleccionado |
| 17 | Slot seleccionado → Siguiente | Avanza a Step 2 con resumen del horario visible |

### Step 2: Formato + Detalles

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 18 | Selector de formato | 4 opciones: 5v5, 7v7, 10v10, 11v11 |
| 19 | Formato > maxFormat de cancha | Deshabilitado con tooltip (si la cancha es 7v7, 10v10 y 11v11 deshabilitados) |
| 20 | Al cambiar formato | Capacidad se ajusta automáticamente al máximo del formato |
| 21 | Capacidad editable | Spinner +/- y campo numérico entre 2 y FORMAT_CAPACITY |
| 22 | Descripción opcional (500 chars max) | Contador de caracteres visible |
| 23 | Checkbox "Inscribirme como jugador" (default false) | Si marcado, admin aparecerá en matchParticipants en el match |
| 24 | Botón "Volver" | Regresa a Step 1 con el slot seleccionado intacto |
| 25 | Botón "Siguiente" | Avanza a Step 3 |

### Step 3: Confirmación

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 26 | Resumen visible | Muestra: cancha, fecha, horario, formato, capacidad, descripción, admin inscripto |
| 27 | Badge "Organizado por el club" | Visible en la preview de confirmación |
| 28 | Botón "Crear partido" | Llama a `createClubMatch` mutation |
| 29 | Éxito | Pantalla de éxito con opciones: "Ver partido", "Crear otro", "Ir al dashboard" |
| 30 | "Crear otro partido" | Resetea el wizard al Step 1 |
| 31 | "Ver detalle del partido" | Navega a `/partidos/{matchId}` |
| 32 | Botón "Volver" | Regresa a Step 2 |

### Comportamiento del partido creado

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 33 | Partido creado tiene `organizedByClub=true` | Verificar en la DB via Supabase dashboard |
| 34 | Admin NO aparece en matchParticipants (autoEnrollOrganizer=false) | Solo el match existe, sin participants |
| 35 | Admin SI aparece (autoEnrollOrganizer=true) | Match participant en equipo A |
| 36 | Badge en `/partidos/[id]` | Badge "Organizado por el club" visible (icono Landmark + texto) |
| 37 | Partido visible en `/partidos` | Aparece en la lista pública como status OPEN |
| 38 | Partidos de players originales no rotos | `createMatch` de player sigue funcionando, `organizedByClub=false` por defecto |

### Validaciones de negocio (errores esperados)

| # | Descripción | Error esperado |
|---|-------------|---------------|
| 39 | Crear en slot bloqueado | "El horario está bloqueado. Desbloquealo antes de crear un partido" |
| 40 | Crear en slot inactivo | "El horario fue desactivado y no está disponible" |
| 41 | Crear en slot con match en esa fecha | "Ya existe un partido en este horario para esa fecha" |
| 42 | scheduledDate en el pasado | "La fecha del partido debe ser futura" |
| 43 | scheduledDate > 90 días | "La fecha no puede ser más de 90 días en el futuro" |
| 44 | Fecha no coincide con dayOfWeek del slot | "El horario seleccionado es para [día], pero la fecha corresponde a [otro día]" |
| 45 | Capacidad > maxCapacity del formato | Botón + deshabilitado al llegar al límite |
| 46 | Slot de otro club (ataque directo via API) | "No tenés permiso para crear partidos en este horario" |

### Audit log

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 47 | Crear partido exitoso | Entrada en `slotAuditLog` con action='CREATED', changedBy=adminId, newValue con matchId |

### Cache Redis

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 48 | Crear partido | Lista pública `/partidos` muestra el nuevo match sin recargar el backend |
| 49 | Cache `matches:open` invalidada | Logs muestran `[Redis] Deleted key: matches:open` |

### Casos edge

| # | Descripción | Resultado esperado |
|---|-------------|-------------------|
| 50 | Sin slots disponibles en el rango | Mensaje "No hay horarios disponibles en este rango" |
| 51 | Error de red al cargar slots | Error message con posibilidad de reintentar |
| 52 | Dos admins crean partido en el mismo slot simultáneamente | El segundo recibe error "Ya existe un partido en este horario" |

---

## Notas técnicas de testing

- `organizedByClub=true` se puede verificar directamente en la tabla `matches` de Supabase.
- El slot con `allowOnlineBooking=false` es seleccionable porque el servicio de admin bypassa esa restricción.
- La validación de `organizerId = auth.uid()` sigue activa via RLS aunque el admin no sea "player".
- Phase 2 (no implementado): BulkCreateModal, Templates, Popular slots heuristics.
