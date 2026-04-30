# Prompt Log

- Timestamp: 2026-04-25 10:05:00
- Task ID: n3k7w2qp

## User Prompt

> bien excelente ahora debe de centrar al mapa en montevideo y debes de corroborar que todas las coordenadas de ls club que ingresen o qu ya esten ingresadas sean de uruguay esten dentro de uruguay en caso que existan coordenadas fuera de uruguay setealas de forma forzada para que se cumpla estar dentro de uruguay

## Agent Main Actions

- Creó `apps/backend/src/utils/uruguayBounds.ts` con polígono simplificado de Uruguay (14 vértices) y función `isInUruguay(lat, lng)` usando ray-casting point-in-polygon — rechaza Buenos Aires y Argentina aunque compartan el bounding box con Uruguay.
- Agregó dos refiners Zod al `RegisterSchema` en `authController.ts`: uno que exige lat+lng juntos (o ninguno), y otro que valida `isInUruguay()` — devuelve error de campo con mensaje en español si las coords están fuera de Uruguay.
- Corrigió vía Supabase Management API los 10 clubes con coordenadas incorrectas (5 en Buenos Aires/Argentina → Montevideo, 3 con placeholder erróneo → coords reales en Montevideo, 2 TACUAREMBO → coords reales de la ciudad de Tacuarembó); cambió el centro del mapa de vuelta a Montevideo (-34.9011, -56.1645).
