# TESTING — WebApp Responsiva

## Alcance del epic

Verificación manual de la webapp en móviles (320–640px), tablets (641–1024px) y desktop (1024px+).

## Cómo probar

### DevTools del navegador
1. F12 → icono de dispositivo (Toggle Device Toolbar)
2. Presets recomendados: **iPhone SE** (375px), **iPhone 12 Pro** (390px), **iPad Mini** (768px), **Samsung Galaxy S20** (412px), **Pixel 7** (412px)
3. Orientaciones: Portrait y Landscape
4. Zoom del navegador al 200% (accesibilidad)

### Breakpoints implementados
| Breakpoint | Ancho | Dispositivos |
|------------|-------|-------------|
| Mobile chico | 320–374px | iPhone SE |
| Mobile estándar | 375–640px | iPhone 12 Pro, Pixel 7 |
| Tablet | 641–1024px | iPad Mini (768px) |
| Desktop | 1024px+ | Laptop, monitor |

---

## MOBILE (390px — iPhone 12 Pro como referencia)

### TC-01 — Landing: sin scroll horizontal
**Pasos:** Abrir `/` en 390px portrait.
**Esperado:** No hay scroll horizontal en ningún punto. Hero, stats, steps y CTA se ven correctamente. El ball animado no desborda el viewport.

### TC-02 — Login: form táctil completo
**Pasos:** Abrir `/login` en 390px.
**Esperado:** Card centrado con padding 2rem. Inputs full-width, font-size 1rem (sin zoom iOS). Botón "Iniciar Sesión" full-width y min 44px alto.

### TC-03 — Login: sin zoom automático en iOS
**Pasos:** Hacer focus en el input de email/contraseña en Safari iOS (o emulación).
**Esperado:** La página NO hace zoom automático. El font-size de los inputs es 1rem (≥16px).

### TC-04 — Registro jugador: formulario completable
**Pasos:** Completar el formulario en `/registro-jugador` en 390px.
**Esperado:** Card con padding reducido en < 480px. El grid de contraseña/confirmar contraseña colapsa a 1 columna. Botón "CREAR CUENTA" full-width. No hay desbordamiento horizontal.

### TC-05 — Registro club: formulario completable
**Pasos:** Completar el formulario en `/registro-club` en 390px.
**Esperado:** Igual que TC-04. Card `max-width: 560px` se adapta. Campo URL opcional visible. Sin desbordamiento.

### TC-06 — /partidos: lista de 1 columna
**Pasos:** Abrir `/partidos` en 390px.
**Esperado:** MatchList muestra 1 columna de cards. Filtros colapsan en 1 columna. Toggle "Próximos/Pasados" tiene min-height 44px. Sin scroll horizontal.

### TC-07 — /partidos: topbar simplificado en mobile
**Pasos:** Observar el topbar de `/partidos` en 390px.
**Esperado:** "Crear partido", "Mi Perfil", "Panel de Club" NO se muestran (ocultos en mobile). Solo visible: logo + user badge truncado + "Salir".

### TC-08 — /partidos/[id]: equipos apilados en 1 columna
**Pasos:** Abrir el detalle de un partido en 390px.
**Esperado:** Equipos A y B se muestran en 1 columna (`.teams-grid` colapsa a 1fr a < 640px). PlayerCards apilados. Sin desbordamiento horizontal.

### TC-09 — /partidos/[id]: botones táctiles
**Pasos:** Verificar botones "Sumarme" y "Salirme del partido" en 390px.
**Esperado:** Ambos botones tienen min-height 44px. "Sumarme" es full-width. "Salirme" no trunca el texto (white-space: normal).

### TC-10 — Panel club: hamburger menu funciona
**Pasos:** Abrir `/panel-club/dashboard` en 390px. Hacer click en el icono hamburger (≡) del topbar.
**Esperado:** Drawer lateral se desliza desde la izquierda mostrando: logo + "CLUB" pill, badge de usuario, links de navegación (Dashboard, Crear partido, Horarios, etc.), botón "Salir de la cuenta". Backdrop cierra el drawer al hacer click.

### TC-11 — Panel club: drawer táctil
**Pasos:** En el drawer del TC-10, hacer click en cada link de navegación.
**Esperado:** Todos los links tienen min-height 48px. Al hacer click se navega y el drawer se cierra.

### TC-12 — Panel club: contenido sin sidebar
**Pasos:** En `/panel-club/dashboard` mobile, verificar el contenido principal.
**Esperado:** El sidebar está oculto. El contenido principal ocupa el 100% del ancho. page-layout tiene padding: 1rem sin sidebar gap.

### TC-13 — Dashboard: calendario scrolleable horizontalmente
**Pasos:** En `/panel-club/dashboard` mobile con la vista Calendario activa.
**Esperado:** El CalendarGrid muestra las columnas de días. Se puede deslizar horizontalmente para ver los 7 días. La columna de horas (izquierda) permanece fija mientras se desliza.

### TC-14 — Dashboard: filtros compactos
**Pasos:** En `/panel-club/dashboard` mobile, observar la barra de filtros.
**Esperado:** [Calendario | Agenda] + [Hoy | Esta semana | Este mes] + [Cancha] [Estado] en una fila que hace wrap. No hay date-pickers duplicados. Botones "Ir a horarios" y "Exportar" están ocultos (accesibles desde drawer).

### TC-15 — Horarios: calendario scrolleable
**Pasos:** En `/panel-club/horarios` mobile, vista Calendario.
**Esperado:** Mismo comportamiento que TC-13. La barra de navegación `< 4 - 10 May 2026 >` visible dentro del card. Columna de horas sticky.

### TC-16 — Crear partido: wizard step-by-step
**Pasos:** Navegar `/panel-club/crear-partido` en 390px y completar cada paso.
**Esperado:** CalendarGrid (paso 1) scrolleable horizontalmente con columna sticky. En paso 2, botones "Siguiente/Volver" full-width y apilados. wizard-card con padding reducido.

### TC-17 — Modales como bottom-sheets
**Pasos:** En horarios, hacer click en un slot para abrir SlotEditModal en 390px.
**Esperado:** El modal aparece desde abajo (bottom-sheet). Borde superior redondeado (16px). max-height: 92svh. Botones en el footer apilados en columna full-width. Botón cerrar (✕) min 44×44px.

### TC-18 — BulkBlockDialog como bottom-sheet
**Pasos:** Seleccionar varios slots y bloquearlos en horarios mobile.
**Esperado:** BulkBlockDialog aparece como bottom-sheet. Mismo patrón que TC-17.

### TC-19 — ExportDialog como bottom-sheet
**Pasos:** En Dashboard, hacer click en "Exportar" (si está visible) o navegarlo.
**Esperado:** ExportDialog aparece como bottom-sheet. Botones "Cancelar" y "Descargar" full-width.

### TC-20 — MatchDetailModal: slide-over full-width
**Pasos:** En Dashboard, hacer click en un partido para abrir MatchDetailModal en 390px.
**Esperado:** Panel desliza desde la derecha, width: 100% en < 480px. Botón cerrar (✕) min 44×44px. Contenido con scroll vertical.

---

## TABLET (768px — iPad Mini como referencia)

### TC-21 — Layout tablet: sidebar visible
**Pasos:** Abrir `/panel-club/dashboard` en 768px portrait.
**Esperado:** El sidebar de navegación ES visible (no hay hamburger button). El layout page-layout muestra sidebar + contenido principal en 2 columnas.

### TC-22 — /partidos: grid de 2 columnas en tablet
**Pasos:** Abrir `/partidos` en 768px.
**Esperado:** MatchList muestra `md:grid-cols-2` — 2 columnas de match cards. Filtros en `md:grid-cols-4` (fila compacta). Sin scroll horizontal.

### TC-23 — /partidos/[id]: layout en tablet
**Pasos:** Abrir detalle de un partido en 768px.
**Esperado:** Los equipos A y B se muestran side-by-side (`.teams-grid: 1fr 1fr`). MatchInfoCard y ClubLocationCard con padding normal.

### TC-24 — Modales centrados en tablet
**Pasos:** Abrir SlotEditModal en 768px.
**Esperado:** Modal centrado (no bottom-sheet). max-width: 540px. Botones en una fila (no apilados). Apariencia desktop normal.

### TC-25 — Calendario en tablet
**Pasos:** Ver el CalendarGrid en `/panel-club/horarios` en 768px.
**Esperado:** Grid de 7 columnas sin scroll horizontal (ancho suficiente). Columna de horas y header de días correctamente alineados.

---

## DESKTOP (1280px — mantener funcionalidad actual)

### TC-26 — Layout desktop: sin regresiones
**Pasos:** Navegar todas las rutas en 1280px.
**Esperado:** Todo funciona como antes del epic. Sidebar visible. Calendarios de 7 columnas. Modales centrados. Sin scroll horizontal. No aparece el hamburger button.

### TC-27 — Calendarios desktop: funcionalidad completa
**Pasos:** En `/panel-club/horarios` y `/panel-club/dashboard` en 1280px.
**Esperado:** CalendarGrid muestra 7 columnas completas. Checkboxes de selección funcionan (horarios). Click en celdas abre modales. Navegación prev/next semana funciona.

### TC-28 — Wizards desktop: steps horizontales
**Pasos:** Ir a `/partidos/crear` y `/panel-club/crear-partido` en 1280px.
**Esperado:** Step indicator horizontal visible (1 → 2 → 3 → 4). Wizard con max-width adecuado. Botones de navegación en una fila.

---

## CROSS-DEVICE

### TC-29 — Sin scroll horizontal en ninguna página
**Pasos:** Abrir cada ruta en 390px y verificar con DevTools > Console: `document.body.scrollWidth > window.innerWidth`.
**Esperado:** Valor `false` en todas las rutas. No hay overflow horizontal.

### TC-30 — Tipografía legible sin zoom en mobile
**Pasos:** Verificar tamaños de fuente en 390px con DevTools.
**Esperado:** Body text ≥ 14px. Títulos con `clamp()` se ajustan fluidamente. Ningún texto desborda su contenedor. El navegador no hace zoom automático.

---

## Herramientas de validación

```bash
# Simular viewport en Chromium headless
npx puppeteer screenshot --viewport-width=390 --viewport-height=844 https://localhost:4321

# Lighthouse mobile audit
npx lighthouse https://localhost:4321 --preset=mobile --output=html
```

### DevTools Responsive Presets

| Dispositivo | Ancho | Alto | DPR |
|-------------|-------|------|-----|
| iPhone SE | 375 | 667 | 2 |
| iPhone 12 Pro | 390 | 844 | 3 |
| Samsung Galaxy S20 | 412 | 915 | 3.5 |
| iPad Mini | 768 | 1024 | 2 |
| iPad Air | 820 | 1180 | 2 |

### Notas de implementación por fase

| Fase | Archivos principales | Técnica |
|------|---------------------|---------|
| 1 | ClubMobileNav.tsx, panel-club pages | Hamburger drawer, CSS `display:none` |
| 2 | registro-*.astro, login.astro | font-size:1rem, card padding |
| 3 | partidos/[id].astro, perfil.astro | CSS responsive + clamp() |
| 4 | CreateMatchFlow, ClubMatchWizard | Buttons full-width + column-reverse |
| 5 | CalendarGrid.tsx, globals.css | Horizontal scroll + sticky time col |
| 6 | globals.css modals, ExportDialog | Bottom-sheet pattern |
| 7 | (Este documento) | — |
