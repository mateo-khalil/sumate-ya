# Prompt Log

- Timestamp: 2026-06-23 20:22:00
- Task ID: m2k7r4xt

## User Prompt

> siguiente: como estamos creando un partido puntual http://localhost:4321/partidos/crear se debe de eliminar de la opcion Capacidad de jugadores – 4 + Máximo para 10v10: 20 jugadores dado que si se selecciona 10 vs 10 seran 20 y punto y si es un 5vs5 seran 10 y punto no es como un campeonato que si puedo agrear mas jugadores para cambios

## Agent Main Actions

- Eliminó el bloque "Capacidad de jugadores" (control ± y su hint) del componente `FormatSelector.tsx`; la capacidad ahora se deriva automáticamente del formato elegido mediante `getMaxCapacity(format)` y se propaga hacia arriba con la misma firma `onFormatChange(format, capacity)`.
- Removió el prop `capacity` de la interfaz `Props` de `FormatSelector` y borró el estado `localCapacity`, el `useEffect` de sincronización y la función `handleCapacityChange` que ya no son necesarios; actualizó el bloque Decision Context con la razón de negocio.
- Quitó `capacity={capacity}` del `FormatSelector` en `CreateMatchFlow.tsx`; typecheck pasa con 0 errores.
