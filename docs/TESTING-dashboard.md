# Testing Manual — Dashboard de Club (/panel-club/dashboard)

## Contexto

Página SSR accesible solo para `club_admin`. Muestra KPIs, calendario semanal de partidos,
vista agenda y tabla, modal de detalle, alertas de conflictos, y exportación CSV/JSON.

---

## Casos de prueba

### Autenticación y acceso

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 1 | Acceder como club_admin | Navegar a `/panel-club/dashboard` con sesión activa | Se muestra el dashboard completo con KPIs y calendario |
| 2 | Acceder como player | Navegar a `/panel-club/dashboard` con sesión de jugador | Redirect a `/login?reason=role-required` |
| 3 | Acceder sin autenticación | Navegar a `/panel-club/dashboard` sin sesión | Redirect a login |
| 4 | Aislamiento de datos | Autenticarse con club_admin_B e intentar ver datos de club_admin_A via filtros | Solo se ven datos del propio club (RLS + ownership check) |

### KPIs y métricas

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 5 | KPIs se cargan correctamente | Abrir el dashboard con partidos en la semana | Header muestra valores numéricos en todas las 6 tarjetas |
| 6 | Partidos esta semana | Verificar con 3 partidos en la semana actual | KPI "Partidos esta semana" muestra 3 |
| 7 | Tasa de ocupación | Club con 10 slots activos y 4 con partido | Ocupación muestra ~40%, gauge circular proporcional |
| 8 | Ingresos estimados | Slots con precio ARS 1.500 que tienen partidos | "Ingresos estimados" muestra "$4.500" (3 × 1.500) |
| 9 | Jugadores únicos del mes | 5 jugadores distintos en diferentes partidos del mes | "Jugadores únicos (mes)" muestra 5 |
| 10 | Slots bloqueados | Club con 2 slots bloqueados activos | "Slots bloqueados" muestra 2 con color rojo |
| 11 | Formato moneda | Ingresos con valor grande (ej: $15.000) | Se muestra con separador de miles correcto en formato es-AR |

### Filtros

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 12 | Filtro "Hoy" | Clic en botón "Hoy" | startDate y endDate se setean al día actual; se refetcha |
| 13 | Filtro "Esta semana" | Clic en "Esta semana" | Rango Mon–Dom de la semana actual aplicado |
| 14 | Filtro "Este mes" | Clic en "Este mes" | Primer y último día del mes actual |
| 15 | Filtro por cancha | Seleccionar "Cancha A" en dropdown | Solo partidos y slots de Cancha A visibles |
| 16 | Filtro por estado | Seleccionar "Abierto" y "En curso" | Solo matches con esos estados |
| 17 | Filtro por fecha personalizada | Ingresar rango manual 2026-06-01 a 2026-06-30 | Se cargan los datos del período |
| 18 | Reset de filtros | Aplicar filtros y clic en "Limpiar" | Vuelve al rango de la semana actual sin filtros de cancha/estado |
| 19 | Indicador de filtros activos | Seleccionar 2 canchas | Botón "Cancha (2)" con contador |

### Vistas

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 20 | Cambio a vista Agenda | Clic en tab "Agenda" | Lista cronológica de partidos agrupados por día |
| 21 | Cambio a vista Tabla | Clic en tab "Tabla" | Tabla con columnas: Fecha, Hora, Cancha, Formato, Estado, Jugadores, Organizador |
| 22 | Cambio a vista Calendario | Clic en tab "Calendario" | Grid semanal con slots por cancha |
| 23 | Tabs Próximos/Pasados en Agenda | En vista Agenda, clic en "Pasados" | Muestra solo partidos con scheduledAt < ahora |
| 24 | Ordenamiento en tabla | Clic en columna "Estado" en vista Tabla | Ordena por estado alfabéticamente (asc/desc toggle) |

### Colores semánticos

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 25 | Slot disponible | Ver slot sin partido y no bloqueado | Color verde (slot-avail) |
| 26 | Slot con partido abierto | Ver slot con match.status = 'open' | Color amarillo (slot-open) |
| 27 | Slot con partido en curso | Match con timeStatus = NOW | Color azul (slot-inprog) |
| 28 | Slot bloqueado | isBlocked = true | Color rojo (slot-blocked) |
| 29 | Slot inactivo | isActive = false | Color gris oscuro (slot-inactive) |
| 30 | Slot partido finalizado | timeStatus = PAST | Color gris claro (slot-compl) |

### Modal de detalle

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 31 | Abrir modal | Clic en slot con partido en cualquier vista | Slide-over modal derecho con info completa |
| 32 | Info del partido | Modal abierto | Muestra: fecha, hora, cancha, formato, estado, timeStatusLabel en español |
| 33 | Barra de capacidad | Partido con 7/10 jugadores | Barra mostrando 70%, color amarillo-naranja |
| 34 | Organizador con link | Modal con organizador | Avatar + nombre + link "Ver perfil" |
| 35 | Lista de participantes | Partido con 5 participantes | Avatares (o iniciales) + nombres |
| 36 | Cerrar con Escape | Modal abierto, presionar Esc | Modal se cierra |
| 37 | Cerrar con backdrop | Clic fuera del panel | Modal se cierra |

### timeStatusLabel

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 38 | Partido próximo en 2h | Match scheduledAt = now + 2h | timeStatusLabel = "En 2h" |
| 39 | Partido en este momento | Match en progreso | timeStatusLabel = "Ahora" |
| 40 | Partido finalizado hace 30min | Match terminado reciente | timeStatusLabel = "Hace 30 min" |
| 41 | Partido mañana | scheduledAt = now + 25h | timeStatusLabel = "Mañana" |

### Alertas de conflictos

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 42 | Partido sin participantes < 24h | Match a 12h con 0 participantes | Banner rojo "Partido sin jugadores inscriptos a menos de 24hs" |
| 43 | Partido en slot bloqueado | Match activo en slot con isBlocked=true | Alerta "Partido programado en un slot bloqueado" |
| 44 | Descartar alerta | Clic en X de una alerta | Alerta desaparece (client-side dismiss) |
| 45 | Sin conflictos | Club sin problemas detectados | Banner de alertas no se muestra |

### Exportación

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 46 | Abrir dialog de exportación | Clic en "Exportar" | Modal con opciones CSV/JSON y rango de fechas |
| 47 | Exportar CSV | Seleccionar CSV, clic "Descargar" | Descarga `dashboard_YYYY-MM-DD_YYYY-MM-DD.csv` |
| 48 | Exportar JSON | Seleccionar JSON, clic "Descargar" | Descarga JSON estructurado con arrays de partidos |
| 49 | Rango > 90 días en export | Intentar exportar con más de 90 días | Error "El rango de exportación no puede superar 90 días" |
| 50 | Cancelar exportación | Clic en "Cancelar" o backdrop | Modal se cierra sin descargar |

### Caché Redis

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 51 | Cache HIT | Recargar dashboard sin cambios en 2 min | Logs muestran `[Redis] Cache HIT: club:XXX:dashboard:...` |
| 52 | Invalidación de caché | Crear un nuevo partido, recargar dashboard | Dashboard muestra el nuevo partido (cache invalidado) |

### Seguridad

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 53 | RLS club aislado | Club admin B intenta ver data de club A | Error "No se encontró un club asociado" o datos vacíos |
| 54 | Sin token | Request directo a `/graphql` con query clubDashboard sin Bearer | Error "Authentication required" |
| 55 | Rol incorrecto | Player llama clubDashboard con token válido | Error "Solo administradores de club pueden acceder" |

### Performance

| # | Descripción | Acción | Resultado esperado |
|---|-------------|--------|--------------------|
| 56 | Carga inicial | Abrir dashboard por primera vez | Datos pre-cargados por SSR (sin spinner inicial), < 2s |
| 57 | Cambio de filtro | Aplicar filtro de fecha | Indicador "Actualizando..." durante fetch, < 1.5s |

---

## Notas de testing

- Para simular conflictos: crear un match con `scheduledAt` en las próximas 24h y sin inscripciones.
- Redis puede no estar disponible en local: el dashboard funciona igualmente (fallback a fetch directo).
- El link "Ver perfil" del organizador abre `/perfil/:id` en tab nueva — solo funciona si esa ruta existe.
- Phase 2 (no implementado): bloqueo rápido de slot desde el dashboard, panel de audit log integrado.
