# Prompt Log

- Timestamp: 2026-04-27 18:37:00
- Task ID: k7r2n5qx

## User Prompt

> En la rama votar-resultado hay un bug: la validación Zod del matchId rechaza UUIDs seeded "fake" como e1000000-0000-0000-0000-000000000001 con el error: "ID inválido" - invalid_format - format: "uuid". El error se muestra en rojo en la página /partidos/[id] cuando un participante intenta proponer un resultado.
>
> Causa raíz: Zod v4 cambió la validación z.string().uuid() para usar un regex estricto que requiere UUID v1-v8 según RFC 9562. Los UUIDs seeded del proyecto (formato e1000000-0000-0000-0000-000000000001) NO cumplen con este formato porque el primer carácter del tercer grupo debe ser 1-8 (es 0) y el primer carácter del cuarto grupo debe ser 8/9/a/b (es 0). Postgres acepta estos UUIDs porque solo valida la longitud y formato hexadecimal, pero Zod v4 los rechaza.
>
> Tareas: 1. Identificar todas las validaciones afectadas. 2. Reemplazar la validación estricta con Opción B (helper uuidSchema en apps/backend/src/lib/validators.ts usando regex permisiva). 3. Mejorar UX del error en frontend (parsear array Zod y mostrar solo el message). 4. Verificar UUIDs seeded siguen funcionando. 5. Tests documentados.

## Agent Main Actions

- Creó `apps/backend/src/lib/validators.ts` con `uuidSchema` basado en regex permisiva (`/^[0-9a-fA-F]{8}-...-[0-9a-fA-F]{12}$/`) que acepta cualquier formato hexadecimal UUID como Postgres, reemplazando el `z.string().uuid()` de Zod v4 que exigía bits de versión RFC 9562.
- Actualizó `matchResultVoteService.ts` para importar `uuidSchema` desde `lib/validators.ts` (eliminando la definición local rota) y agregó `parseGqlError()` en `ProposeResultForm.tsx` y `MatchResultsSection.tsx` para convertir mensajes de error Zod v4 (JSON array) en texto legible en español.
- Agregó los casos de prueba TC-18 a TC-21 en `docs/TESTING-votar-resultado.md` cubriendo UUID seeded, UUID v4 real, UUID malformado, y validación de UX del error; typecheck pasó limpio con 0 errores.
