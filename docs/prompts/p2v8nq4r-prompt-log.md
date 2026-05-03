# Prompt Log

- Timestamp: 2026-05-03 19:57:05
- Task ID: p2v8nq4r

## User Prompt

> agrega una regla de nunca mas usar emojis y siempre usar iconos de esa libreria etc.

## Agent Main Actions

- Añadió un Hard Rule "No Emojis in UI" en `CLAUDE.md` que prohíbe emojis en JSX/Astro y obliga a usar `lucide-react` (ya instalado), prohibiendo además agregar otras librerías de iconos o inline SVG manual.
- Agregó una sección completa "Iconography" en `.claude/rules/design-system.md` con reglas, ejemplos de uso en `.tsx` y `.astro`, convenciones de tamaño/strokeWidth/color usando tokens FIFA, requisitos de accesibilidad (`aria-hidden`/`aria-label`) y una tabla de mapeo de conceptos a iconos lucide (Volleyball, MapPin, Calendar, Check, Hand/Shield/Zap/Target para posiciones, Landmark, Construction, etc.).
- Agregó una sección "Iconography (MANDATORY)" en `.claude/rules/frontend.md` con la regla resumida y un puntero a la guía completa en design-system.md, manteniendo el principio DRY entre los tres archivos de reglas.
