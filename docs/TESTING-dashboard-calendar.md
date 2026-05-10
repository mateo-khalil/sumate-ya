# TESTING — Dashboard Calendar Refactor

## Alcance

Casos de prueba manuales para el refactor del calendario del dashboard
(`/panel-club/dashboard`) y la consistencia visual con `/panel-club/horarios`.

## Pre-condiciones

- Sesión activa como `club_admin`
- Al menos 1 cancha configurada con slots en la semana actual
- Al menos 1 partido creado (estado OPEN o IN_PROGRESS)
- Al menos 1 slot bloqueado

---

## Casos de prueba

### TC-01 — Acceso y cuadrícula semanal
**Pasos:** Ingresar a `/panel-club/dashboard` como club_admin.  
**Resultado esperado:** La vista Calendario muestra una cuadrícula con 7 columnas (LUN a DOM) y filas de horarios de 07:00 a 23:00.  
**Regresión:** No debe aparecer el stack vertical de días que existía antes del refactor.

---

### TC-02 — Cabecera de columnas con fechas
**Pasos:** Observar los encabezados de las 7 columnas del calendario.  
**Resultado esperado:** Cada columna muestra el día abreviado en español (LUN, MAR, MIE, JUE, VIE, SAB, DOM) y la fecha en formato `día/mes` (ej. "4/5").  

---

### TC-03 — Eje de tiempo vertical (07:00–23:00)
**Pasos:** Observar la columna izquierda del calendario.  
**Resultado esperado:** Las filas comienzan en 07:00 y terminan en 23:00 (17 filas totales). No se muestran las horas de medianoche (00:00–06:00).

---

### TC-04 — Día actual destacado en el header
**Pasos:** Acceder al dashboard en la semana actual.  
**Resultado esperado:** La columna del día de hoy tiene un fondo levemente naranja y el número de fecha aparece dentro de un círculo naranja.

---

### TC-05 — Hora actual destacada en el eje de tiempo
**Pasos:** Observar la columna de tiempo a la hora actual.  
**Resultado esperado:** La etiqueta de la hora actual aparece en color naranja y con mayor peso tipográfico respecto a las demás horas.

---

### TC-06 — Slot libre futuro en verde
**Pasos:** Identificar una celda con un slot AVAILABLE en un día y hora futuros.  
**Resultado esperado:** La celda tiene fondo verde translúcido (`cal-cell--avail`).

---

### TC-07 — Slot libre pasado en gris
**Pasos:** Observar celdas de días anteriores al día de hoy.  
**Resultado esperado:** Las celdas de días pasados (sin slot) aparecen en gris claro (`cal-cell--past-day-free`). Las que tenían ocupación muestran un patrón de rayas diagonales (`cal-cell--past-day-busy`).

---

### TC-08 — Slot bloqueado en rojo
**Pasos:** Identificar una celda con un slot en estado BLOCKED.  
**Resultado esperado:** La celda tiene fondo rojo translúcido y muestra el ícono de candado (lucide `Lock`).

---

### TC-09 — Partido abierto en amarillo
**Pasos:** Identificar una celda con MATCH_OPEN.  
**Resultado esperado:** Fondo amarillo dorado translúcido (`cal-cell--match-open`). El pip amarillo está visible en la esquina superior izquierda.

---

### TC-10 — Partido completo en naranja (distinto de abierto)
**Pasos:** Identificar una celda con MATCH_FULL.  
**Resultado esperado:** Fondo naranja translúcido (`cal-cell--match-full`) — visualmente diferente del amarillo de MATCH_OPEN.  
**Regresión crítica:** Antes del refactor, MATCH_OPEN y MATCH_FULL compartían la misma clase CSS (`cal-cell--match`). Verificar que sean distinguibles.

---

### TC-11 — Partido en curso en azul
**Pasos:** Identificar una celda con MATCH_IN_PROGRESS.  
**Resultado esperado:** Fondo azul translúcido (`cal-cell--inprog`).

---

### TC-12 — Click en celda con partido → MatchDetailModal
**Pasos:** Hacer click en una celda con partido (MATCH_OPEN, MATCH_FULL, o MATCH_IN_PROGRESS).  
**Resultado esperado:** Se abre el MatchDetailModal con los datos del partido (formato, estado, organizador, jugadores, capacidad).

---

### TC-13 — Click en slot libre futuro → Panel de acciones
**Pasos:** Hacer click en una celda con slot AVAILABLE en un día y hora futuros.  
**Resultado esperado:** Se abre un panel modal con dos opciones:
- "Crear partido aquí" → enlace a `/panel-club/horarios?slotId=...&action=create`
- "Bloquear horario" → enlace a `/panel-club/horarios?slotId=...&action=block`

---

### TC-14 — Click en slot bloqueado → Panel de información
**Pasos:** Hacer click en una celda con slot BLOCKED.  
**Resultado esperado:** Se abre un panel modal con:
- Título "BLOQUEADO" en rojo
- Motivo del bloqueo (si existe)
- Tipo de bloqueo (si existe)
- Enlace "Desbloquear en horarios"

---

### TC-15 — Filtro "Hoy" centra la vista
**Pasos:** Cambiar a una semana diferente con el DateRangePicker y luego presionar "Hoy" en los filtros rápidos.  
**Resultado esperado:** Los filtros se actualizan al día de hoy, la cuadrícula recarga con datos del día actual.

---

### TC-16 — DateRangePicker cambia la semana mostrada
**Pasos:** Cambiar la fecha de inicio y fin en el DateRangePicker a otra semana.  
**Resultado esperado:** La cuadrícula se actualiza mostrando las columnas correctas para el nuevo rango de fechas. El número de columnas puede ser diferente a 7 si el rango cubre más o menos días.

---

### TC-17 — Filtro de cancha filtra correctamente
**Pasos:** Seleccionar una cancha específica en el filtro de cancha.  
**Resultado esperado:** La cuadrícula muestra solo los slots de esa cancha. Las celdas de otras canchas no aparecen.

---

### TC-18 — Múltiples canchas en el mismo horario se renderizan
**Pasos:** Acceder a un horario donde 2+ canchas tienen slots simultáneos.  
**Resultado esperado:** La celda muestra el slot de la primera cancha y un indicador "+N" en la esquina inferior derecha indicando la cantidad de canchas adicionales.

---

### TC-19 — Cambio de pestaña Calendario → Agenda mantiene filtros
**Pasos:** Aplicar un filtro de cancha o fecha, luego cambiar a la pestaña Agenda.  
**Resultado esperado:** La vista Agenda muestra los partidos filtrados por los mismos criterios. Al volver a Calendario, los filtros persisten.

---

### TC-20 — Pestaña Tabla NO aparece
**Pasos:** Observar el switcher de vistas en el dashboard.  
**Resultado esperado:** Solo aparecen dos pestañas: "Calendario" y "Agenda". La pestaña "Tabla" no existe.  
**Regresión:** Era un requisito explícito del refactor eliminar esta vista.

---

### TC-21 — Consistencia visual entre /panel-club/horarios y /panel-club/dashboard
**Pasos:** Navegar entre `/panel-club/horarios` y `/panel-club/dashboard`.  
**Resultado esperado:** Ambas páginas muestran la misma cuadrícula semanal con el mismo sistema de colores, tipografía, bordes, y comportamiento de scroll. La estructura de grilla (día-columnas, hora-filas) es idéntica en ambas.

---

### TC-22 — Scroll automático al montar el calendario
**Pasos:** Acceder al dashboard. No hacer scroll manual.  
**Resultado esperado:** El calendario está posicionado en 07:00 (primera fila visible). No hay scroll a medianoche.

---

### TC-23 — Días pasados completamente grises
**Pasos:** Acceder al dashboard en una semana que incluye días ya transcurridos.  
**Resultado esperado:** Todas las celdas de días pasados son grises, independientemente del estado original del slot (libre, partido, bloqueado). Los slots con actividad pasada usan el patrón de rayas.

---

### TC-24 — Horas pasadas del día actual con opacidad reducida
**Pasos:** Acceder al dashboard hoy, observar las horas que ya pasaron (antes de la hora actual).  
**Resultado esperado:** Las celdas de la columna de hoy correspondientes a horas pasadas aparecen con ~42% de opacidad. Las celdas de horas futuras muestran el color completo.

---

### TC-25 — Accesibilidad de teclado en celdas interactivas
**Pasos:** Navegar con Tab hasta una celda con partido. Presionar Enter.  
**Resultado esperado:** Se abre el MatchDetailModal. La celda tiene `role="button"` y `tabIndex=0`. El modal tiene `aria-modal="true"` y puede cerrarse con Escape.

---

## Notas de regresión

- El refactor de `SlotCalendarView.tsx` (horarios) comparte el mismo `CalendarGrid` base.
  Verificar que `/panel-club/horarios` no se vea afectada: prev/next semana funciona,
  checkboxes de selección múltiple funcionan, precios en slots visibles, edición al click.
- El componente `ClubTableView.tsx` fue eliminado. No debe ser referenciado en ningún import.
