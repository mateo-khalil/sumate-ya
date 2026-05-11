# Testing Manual — Privacidad de Perfil

Rama: `privacidad`  
Fecha: 2026-05-11

## Casos de prueba

### Funcionalidad básica

1. **Toggle isPublic=false (vista propia)**
   - Ir a `/ajustes` → sección Privacidad
   - Desactivar "Perfil público" → guardar
   - Ir a `/perfil` → debe mostrar badge "Tu perfil está privado. Cambiar en Ajustes"
   - El perfil propio sigue mostrando todos los datos (nombre, avatar, stats, historial)

2. **Toggle isPublic=false (vista de otro usuario)**
   - Loguearse con otro usuario → ir a `/perfil/<id-del-usuario-privado>`
   - Debe mostrar solo nombre + avatar
   - Mensaje: "Este jugador mantiene su perfil privado."
   - Sub-mensaje: "Solo se muestra su nombre y foto en los partidos donde participa."
   - No se ven stats, posición ni división

3. **showStats=false (otro usuario)**
   - Dejar isPublic=true, desactivar "Estadísticas" → guardar
   - Otro usuario visita `/perfil/[id]` → sección stats no aparece (texto "Estadísticas no disponibles")

4. **showHistory=false (otro usuario)**
   - TODO: cuando se implemente `profile(id).myMatches` para perfiles ajenos
   - Backend ya retorna array vacío cuando showHistory=false para requesterId != profileId

5. **Mutation updatePrivacy actualiza correctamente**
   - Hacer POST a `/graphql` con mutation `updatePrivacy` y varios campos
   - Respuesta debe incluir los nuevos valores
   - Verificar en Supabase: `profiles.showStats`, `profiles.isPublic`, etc. cambiaron

6. **RLS: SELECT de perfiles por usuario autenticado**
   - Todo usuario autenticado puede leer cualquier fila de `profiles`
   - Verificar con cliente anon+JWT que la consulta devuelve datos (filtrado de columnas va por el backend)

### UX / Mejoras

7. **Tooltips en cada toggle**
   - En `/ajustes` → hover/focus cada toggle sub → debe aparecer el texto descriptivo debajo del label

8. **Confirmación visual al guardar**
   - Hacer cambio → guardar → debe aparecer toast verde "Configuración de privacidad guardada" por ~3.5s

9. **Badge "Perfil privado" en /perfil propio**
   - Con isPublic=false → `/perfil` muestra el notice con icono de candado y link a `/ajustes`
   - Con isPublic=true → el notice NO aparece

10. **Mensaje a visitantes de perfiles privados**
    - Otro usuario visita `/perfil/[id]` con isPublic=false
    - Mensaje visible: "Este jugador mantiene su perfil privado."

11. **Preview "Ver como otros me ven"**
    - En `/ajustes`, con isPublic=false → click "Ver como otros me ven"
    - Modal muestra perfil con solo nombre + avatar + tag "Perfil privado"
    - Con isPublic=true, showStats=false → modal muestra stats ocultos
    - Nota al pie: "Los cambios no están guardados."

12. **Perfil en /partidos/[id] siempre visible**
    - Jugador con perfil privado participa en un partido
    - En `/partidos/[id]`, su nombre y avatar siguen siendo visibles en el equipo
    - (Esto es garantizado por el backend: los participantes se exponen via matchParticipants,
      que incluye displayName y avatarUrl sin restricción de privacidad del perfil)

### Granularidad

13. **Ocultar solo stats sin ocultar historial**
    - isPublic=true, showStats=false, showHistory=true → guardar
    - Otro usuario: no ve stats pero sí ve historial (cuando esté implementado el endpoint ajeno)

14. **Owner siempre ve todo**
    - Con isPublic=false, showStats=false → ir a `/perfil` con el propio usuario
    - Todos los datos visibles sin restricción

15. **Audit log registra cada cambio**
    - Cambiar privacidad → verificar en tabla `privacyAuditLog` que hay una nueva fila
    - La fila tiene: `userId`, `previousSettings` (json), `newSettings` (json), `changedAt`

### Cache

16. **Cache Redis se invalida al cambiar settings**
    - Con Redis activo: cargar `/perfil` (cache warm)
    - Cambiar privacidad en `/ajustes`
    - Recargar `/perfil` → debe reflejar cambios (cache fue invalidado)

### Responsive

17. **Form de privacidad en mobile (375px)**
    - `/ajustes` en viewport 375px
    - Nav de secciones cambia a fila horizontal con scroll
    - Toggles ocupan ancho completo
    - Botones "Ver como otros" y "Guardar" apiladoss verticalmente

18. **Modal preview en mobile**
    - Modal aparece desde abajo (bottom-sheet) en viewports ≤ 480px
    - Se puede cerrar tocando fuera o el botón X

19. **Touch targets >= 44px en mobile**
    - Los toggle switches tienen `min-height: 44px` para ser accionables en touch
    - Los botones de acción tienen `min-height: 44px`

20. **Mensajes de error en español al fallar updatePrivacy**
    - Simular fallo de red → el toast muestra "Error de red. Intentá de nuevo."
    - Simular error del servidor → el toast muestra el mensaje en español del backend

## Notas técnicas

- La privacidad se filtra en el **service layer** (backend), no por RLS de filas
- RLS permite SELECT de cualquier fila a usuarios autenticados — el backend decide qué columnas exponer
- `myProfile` (perfil propio) nunca aplica filtros de privacidad
- `profile(id)` aplica filtros cuando requesterId !== profileId
- Audit log usa el cliente service-role (singleton), ya que la verificación de ownership es en el service
- Cache: `profile:me:<userId>` + `profile:public:<userId>` + `user:matches:<userId>` se invalidan en updatePrivacy
