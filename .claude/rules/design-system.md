---
paths:
  - apps/frontend/**
  - '**/*.css'
  - '**/*.scss'
---

# Design System Rules — FIFA World Cup Color Palette

## Overview

Sumate Ya uses a **FIFA World Cup-inspired dark stadium aesthetic**. All UI components, pages, and features must follow this established design system to maintain visual consistency.

## Color Palette (MANDATORY)

The color system is defined in `apps/frontend/src/styles/globals.css`. **Never introduce new colors without updating the theme variables.**

### Core Colors

| Token                  | Value                        | Usage                            |
| ---------------------- | ---------------------------- | -------------------------------- |
| `--color-background`   | `hsl(220 72% 7%)` #070f1f    | Page background (deep navy)      |
| `--color-foreground`   | `hsl(210 20% 94%)`           | Primary text (light gray)        |
| `--color-primary`      | `hsl(35 100% 48%)` (orange)  | CTAs, buttons, highlights        |
| `--color-secondary`    | `hsl(216 85% 45%)` (blue)    | Secondary actions, links         |
| `--color-accent`       | `hsl(216 85% 50%)` (bright)  | Hover states, focus rings        |

### Surface Colors

| Token                  | Value                        | Usage                            |
| ---------------------- | ---------------------------- | -------------------------------- |
| `--color-card`         | `hsl(220 55% 11%)`           | Card backgrounds                 |
| `--color-muted`        | `hsl(220 40% 16%)`           | Muted/disabled backgrounds       |
| `--color-muted-foreground` | `hsl(215 20% 55%)`       | Secondary/muted text             |
| `--color-input`        | `hsl(220 30% 16%)`           | Input field backgrounds          |
| `--color-border`       | `hsl(220 30% 20%)`           | Borders and dividers             |

### FIFA Custom Tokens

| Token                  | Value                        | Usage                            |
| ---------------------- | ---------------------------- | -------------------------------- |
| `--color-pitch`        | `hsl(220 72% 7%)`            | Stadium pitch background         |
| `--color-fifa-orange`  | `hsl(35 100% 48%)`           | FIFA brand orange                |
| `--color-fifa-blue`    | `hsl(216 85% 45%)`           | FIFA brand blue                  |
| `--color-fifa-gold`    | `hsl(42 100% 55%)`           | Trophy/achievement gold          |
| `--color-surface-glass` | `rgba(255, 255, 255, 0.05)` | Glass morphism effect            |

### Semantic Colors

| Token                  | Value                        | Usage                            |
| ---------------------- | ---------------------------- | -------------------------------- |
| `--color-destructive`  | `hsl(0 72% 51%)`             | Errors, delete actions           |
| `--color-ring`         | `hsl(35 100% 48%)`           | Focus rings (uses primary)       |

## Typography

- **Display/Headlines**: Bebas Neue (all caps, bold impact)
- **Body text**: Barlow / Barlow Condensed (clean, readable)
- System font fallback: `system-ui, sans-serif`

## Visual Effects

### Stadium Aesthetic

- Background uses layered radial gradients (blue glow from top and bottom)
- Subtle grid overlay (`body::before`) simulates pitch markings
- Cards use `--color-card` with subtle borders at `--color-border`

### Glass Morphism (sparingly)

```css
.glass-panel {
  background: var(--color-surface-glass);
  backdrop-filter: blur(8px);
  border: 1px solid var(--color-surface-border);
}
```

## Rules for New UI Development

1. **ALWAYS use theme tokens** — never hardcode hex/hsl colors
2. **ALWAYS use Tailwind classes** that reference the theme (`bg-primary`, `text-muted-foreground`, etc.)
3. **NEVER introduce light mode styles** — this is a dark-first design system
4. **NEVER use pure white (#fff)** — use `--color-foreground` or muted variants
5. **NEVER use pure black (#000)** — use `--color-background` or darker surface tokens
6. Use `--color-primary` (FIFA orange) for primary CTAs and interactive highlights
7. Use `--color-secondary` (FIFA blue) for secondary actions and informational elements
8. Use `--color-fifa-gold` only for achievement/trophy/success states

## Component Color Guidelines

| Component Type     | Background          | Text                     | Border              |
| ------------------ | ------------------- | ------------------------ | ------------------- |
| Page               | `background`        | `foreground`             | —                   |
| Card               | `card`              | `card-foreground`        | `border`            |
| Primary Button     | `primary`           | `primary-foreground`     | —                   |
| Secondary Button   | `secondary`         | `secondary-foreground`   | —                   |
| Ghost Button       | transparent         | `foreground`             | —                   |
| Input              | `input`             | `foreground`             | `border`            |
| Muted Text         | —                   | `muted-foreground`       | —                   |
| Error State        | `destructive`       | `destructive-foreground` | —                   |

## Iconography (MANDATORY)

**NEVER use emojis in the UI.** Emojis render inconsistently across operating systems, fonts, and screen readers, and they break the FIFA stadium aesthetic. Use **lucide-react** SVG icons exclusively.

### Rules

1. **ALWAYS use icons from `lucide-react`** for any icon, glyph, or pictogram in the UI (navbar logos, banner status icons, button affordances, sidebar menu items, position markers, empty-state illustrations, loading spinners, etc.).
2. **NEVER use emoji characters** (⚽, ✓, ✗, ⚠, 📍, 🗺️, 📅, 👥, 🏟️, 🟡, ✅, ❌, 🔒, 🔑, 🏗️, 🧤, 🛡️, ⚡, 🎯, ☰, etc.) in JSX, Astro templates, or string content rendered to users.
3. **NEVER inline raw `<svg>` markup** for stock icons that already exist in lucide-react — import the React component instead so size/strokeWidth/color stay consistent.
4. **NEVER add a different icon library** (Heroicons, Material Icons, FontAwesome, react-icons, etc.). One library keeps the bundle lean and the visual language uniform.

### Usage in `.tsx` (React)

```tsx
import { Calendar, MapPin } from 'lucide-react';

<Calendar size={18} strokeWidth={2} aria-hidden="true" />
```

### Usage in `.astro` (Astro pages and components)

Astro renders React components statically when no `client:*` directive is used — so lucide icons ship as inline SVG with **zero JS cost**.

```astro
---
import { Volleyball } from 'lucide-react';
---
<span class="topbar-ball"><Volleyball size={20} strokeWidth={2} aria-hidden="true" /></span>
```

### Sizing & color

- Default sizes: `14` (inline with text), `16` (sidebar/list items), `18` (banner/stat row), `20` (navbar/brand), `28+` (hero/empty states).
- Default `strokeWidth`: `2` (regular), `2.25–2.5` (small icons that need more weight).
- Color comes from `currentColor` — set the wrapper's `color` to a theme token (`hsl(35 100% 55%)` orange, `hsl(216 85% 65%)` blue, `hsl(42 100% 60%)` gold, etc.) instead of hardcoding fills on the SVG.
- Wrap inline icons in a `display: inline-flex; align-items: center;` span so they align with adjacent text.

### Accessibility

- Decorative icons: `aria-hidden="true"`.
- Standalone icon-only buttons (no visible label): add `aria-label` with the action.
- Status icons paired with text (banners, badges) stay `aria-hidden` — the surrounding text already conveys meaning.

### Picking the right icon

Common mappings used in the codebase — reuse these to keep the visual language consistent:

| Concept | Icon |
| --- | --- |
| Brand / soccer ball | `Volleyball` |
| Calendar / date | `Calendar` |
| Players / team | `Users` |
| Location pin | `MapPin` |
| Map view | `Map` |
| Success / check | `Check`, `CheckCircle` |
| Failure / dismiss | `X`, `XCircle` |
| Warning | `TriangleAlert` |
| Locked / full | `Lock` |
| Login key | `Key` |
| In progress | `Activity` |
| Goalkeeper | `Hand` |
| Defender | `Shield` |
| Midfielder | `Zap` |
| Forward | `Target` |
| Stadium / club | `Landmark` |
| Stats / charts | `BarChart3` |
| Construction / coming soon | `Construction` |
| Loading spinner | `Loader2` (with `animation: spin`) |
| List view toggle | `List` |
| Geolocate | `LocateFixed` |

If a needed icon is not in the table, search lucide.dev and add it to the table once used.

## Accessibility

- Ensure sufficient contrast ratios (WCAG AA minimum)
- Primary orange on dark background passes contrast requirements
- Muted text should only be used for supplementary information, not critical content
