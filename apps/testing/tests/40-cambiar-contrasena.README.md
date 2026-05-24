# Tests E2E — US #40 Cambiar contraseña

Cobertura E2E para la historia [#40 Cambiar contraseña](https://github.com/mateo-khalil/sumate-ya/issues/40).
El feature ya está mergeado (PR #128) y vive en `/ajustes → sección Seguridad`.

## Cómo correr los tests

Desde la raíz del monorepo:

```powershell
# Atajo dedicado
pnpm --filter testing test:e2e:40

# Equivalente directo
pnpm --filter testing exec playwright test tests/40-cambiar-contrasena.spec.ts

# Con UI (ver el navegador)
pnpm --filter testing exec playwright test tests/40-cambiar-contrasena.spec.ts --headed

# Filtrar por bloque
pnpm --filter testing exec playwright test tests/40-cambiar-contrasena.spec.ts --grep "Validación cliente"
```

> El backend y el frontend deben estar corriendo. El `webServer` de Playwright los levanta automáticamente vía `npm run dev` en la raíz si no están activos (`reuseExistingServer` está activado en local).

Para abrir el reporte HTML después de la corrida:

```powershell
pnpm --filter testing exec playwright show-report
```

---

## Qué cubren estos tests

### Bloque 1 — Render y accesibilidad

- Sección "Seguridad" visible en `/ajustes` con el form hidratado
- Los 3 campos (`current/new/confirm`) y el botón de envío existen
- Inputs son `type="password"` (no exponen el valor en pantalla)
- `autocomplete` correcto: `current-password`, `new-password`, `new-password`
- Indicador de fortaleza arranca en "Sin ingresar"

### Bloque 2 — Validación cliente

- Submit con campos vacíos pinta los 3 errores y NO envía la request
- `newPassword.length < 8` → error "al menos 8 caracteres", no envía request
- `newPassword === currentPassword` → error "distinta a la actual", no envía request
- `confirmPassword !== newPassword` → error "no coinciden", no envía request
- Al editar un campo con error, el error de ese campo se limpia y los otros quedan

### Bloque 3 — Indicador de fortaleza

- `"abcdef"` → "Básica"
- `"hola1234"` → "Media"
- `"Hola1234!"` → "Fuerte"

### Bloque 4 — Submit exitoso (mock)

- 200 OK → toast verde + inputs limpiados + payload enviado tal cual
- Mientras la request está pendiente: botón muestra "Actualizando...", está disabled y `aria-busy="true"`

### Bloque 5 — Errores backend (mock)

- 400 con `errors.currentPassword` → error inline en el campo + toast rojo
- 401 con mensaje "Sesión inválida" → toast rojo con ese texto
- Network failure (request abortada) → toast "Error de red. Intentá de nuevo."
- Tras error, los inputs conservan su valor (sólo se limpian tras éxito)

### Bloque 6 — Responsive

- En 375x812 px el form no introduce scroll horizontal y el botón sigue clickeable

### Bloque 7 — Seguridad (acceso anónimo)

- Visitante sin sesión es redirigido a `/login` al intentar abrir `/ajustes` (middleware)

### Bloque 8 — Contrato POST `/api/auth/change-password`

Pega directo al backend Express en `:4000` con `APIRequestContext` (sin browser).
Todos los bodies son inválidos a propósito → el backend NUNCA muta la password real.

- Sin `Authorization` header → 401 "Missing or malformed token"
- Body vacío → 400 con `errors` para los 3 campos
- `newPassword` < 8 → 400 con `errors.newPassword`
- `newPassword !== confirmPassword` → 400 con `errors.confirmPassword`
- `newPassword === currentPassword` → 400 con `errors.newPassword` ("distinta a la actual")
- `currentPassword` incorrecto pero shape válido → 400 con `errors.currentPassword` ("actual no es correcta")

### Bloque 9 — Navegación interna

- El link "Seguridad" del sidebar lleva a `#seguridad` sin recargar la página

---

## Lo que NO cubren estos tests

- **No se realiza un cambio real de contraseña**: todo el camino feliz (200 OK) está
  mockeado para no romper otros specs que se autentican con `mateoduran2010@gmail.com`.
  Si querés validar el cambio real, hacelo manual en un usuario descartable.
- Tests de privacidad / preview del perfil (cubiertos por `privacy-settings.spec.ts`).
- Tests de login / register (cubiertos por `login.spec.ts` y `registro-jugador.spec.ts`).
- Verificación visual contra Supabase (la integración con `auth.updateUser` está cubierta
  por tests unitarios del backend).

---

## Estrategia de mocking

- **UI behaviour** → `page.route('**/api/auth/change-password', ...)` se intercepta en
  el browser para devolver respuestas deterministas (200, 400 con `errors`, 401, abort).
  El form post va del browser DIRECTO al backend `:4000`, sin proxy SSR.
- **Contrato backend** → `request.post('http://localhost:4000/api/auth/change-password', ...)`
  con bodies inválidos. El backend rechaza por Zod o por Supabase signInWithPassword sin
  llegar nunca a `auth.updateUser`.

---

## data-testid faltantes en el frontend

El Page Object usa clases y `aria-describedby` ids como fallback. Para hacerlo
robusto a refactors de CSS, el equipo frontend debería agregar:

| Selector actual                       | `data-testid` sugerido           |
| ------------------------------------- | -------------------------------- |
| `form.password-form`                  | `change-password-form`           |
| `input` (current)                     | `change-password-current`        |
| `input` (new)                         | `change-password-new`            |
| `input` (confirm)                     | `change-password-confirm`        |
| `button[type=submit]`                 | `change-password-submit`         |
| `div.toast`                           | `change-password-toast`          |
| `#password-strength`                  | `change-password-strength`       |
| `#current-password-error`             | `change-password-current-error`  |
| `#new-password-error`                 | `change-password-new-error`      |
| `#confirm-password-error`             | `change-password-confirm-error`  |
