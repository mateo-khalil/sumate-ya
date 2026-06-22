# Prompt Log

- Timestamp: 2026-06-22 00:30:00
- Task ID: w7t2n9q4

## User Prompt

> corrige que en safari el texto no aparece en lso campos de usaurio [Image #5]
>
> (Image #5: pantalla de login en modo claro; el texto tipeado/autocompletado en el campo Email no se ve en Safari)

## Agent Main Actions

- Diagnostiqué que los estilos scoped de `.field input` (login y registro) ganaban en especificidad sobre el override global `html.light .field input`, dejando el texto con el color casi blanco del tema oscuro; en Safari se agravaba por `-webkit-text-fill-color`/autofill.
- Cambié el color de los inputs a `var(--color-foreground)` (auto-invierte por tema) y agregué `-webkit-text-fill-color`, `caret-color` y manejo de `:-webkit-autofill` en `login.astro`, `registro-jugador.astro` y `registro-club.astro`.
- Restauré la superficie/focus de los campos en modo claro vía `:global(html.light) .field input` donde faltaba (login, registro-club) y corrí `turbo typecheck --force` (0 errores).
