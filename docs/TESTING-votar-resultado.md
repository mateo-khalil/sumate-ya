# Testing Manual — User Story: Votar Resultado

## Contexto

Rama: `votar-resultado`  
Página de prueba: `/partidos/[id]` (un partido donde el usuario autenticado es participante y cuyo `scheduledAt` ya pasó)

Levantar backend (`pnpm dev` desde la raíz) y frontend antes de ejecutar estos tests.

---

## Prerequisitos

- Al menos 3 usuarios de prueba (jugadores) inscritos en el mismo partido
- El partido debe tener `scheduledAt` en el pasado (o status `completed`/`in_progress`)
- El partido debe tener status que no sea `cancelled`

---

## Casos de prueba

### TC-01: Participante propone primer resultado

**Actor:** Usuario A (participante del partido)

**Pasos:**
1. Ir a `/partidos/[id]` con el partido en el pasado
2. Verificar que aparece la sección "Resultado del partido"
3. Verificar que aparece el botón "+ Cargar resultado"
4. Hacer clic en "+ Cargar resultado"
5. Ingresar scoreA=3, scoreB=2
6. Verificar que el label "Gana Equipo A" aparece automáticamente
7. Hacer clic en "Enviar resultado"

**Resultado esperado:**
- Nueva submission aparece con estado `PENDIENTE` (badge naranja)
- Conteos muestran "0 aprobaciones / 0 rechazos"
- Botones "Aprobar" y "Rechazar" visibles para usuarios que no votaron

---

### TC-02: No participante no ve la sección de resultados

**Actor:** Usuario X (no participante del partido)

**Pasos:**
1. Ir a `/partidos/[id]` con un usuario que NO está en `matchParticipants`

**Resultado esperado:**
- La sección "Resultado del partido" NO aparece en la página

---

### TC-03: No participante intenta proponer via GraphQL directamente

**Pasos:**
1. Ejecutar `proposeMatchResult` mutation con el token de un usuario que NO es participante

**Resultado esperado:**
- Error GraphQL: "Solo los participantes del partido pueden proponer resultados"

---

### TC-04: Participante vota approve

**Actor:** Usuario B (participante, no propuso)

**Pasos:**
1. Ir a `/partidos/[id]`
2. Ver la submission pendiente de TC-01
3. Hacer clic en "✓ Aprobar"

**Resultado esperado:**
- Conteo actualiza a "1 aprobaciones / 0 rechazos"
- Botones desaparecen y aparece "Tu voto: Aprobado ✓"
- Opción "Cambiar voto" visible

---

### TC-05: Participante vota reject

**Actor:** Usuario C (participante, no propuso)

**Pasos:**
1. Ir a `/partidos/[id]`
2. Ver la submission pendiente
3. Hacer clic en "✗ Rechazar"

**Resultado esperado:**
- Conteo actualiza a "1 aprobaciones / 1 rechazos"
- Submission permanece en estado PENDIENTE

---

### TC-06: Mayoría aprueba — submission confirmada

**Setup:** Partido con 4 participantes, submission pendiente con 1 aprobación

**Actor:** Usuario D (participante, no votó)

**Pasos:**
1. El Usuario D vota "Aprobar" (llevando approveCount a 2 de 4)

**Resultado esperado:**
- Submission pasa a estado `CONFIRMADO` (badge verde "✓ Resultado oficial")
- Botones de voto desaparecen
- Si había otras submissions pendientes → aparecen como `RECHAZADO`
- El partido muestra status actualizado en MatchInfoCard si era open/full

---

### TC-07: Proponer resultado alternativo (coexistencia de submissions)

**Actor:** Usuario B (participante, no propuso el original)

**Pasos:**
1. Con una submission en estado PENDIENTE, hacer clic en "+ Proponer otro resultado"
2. Ingresar scoreA=1, scoreB=1 (Empate)
3. Enviar

**Resultado esperado:**
- Aparecen dos submissions PENDIENTE en la lista
- Ambas muestran sus propios botones de voto
- El resultado automático muestra "Empate"

---

### TC-08: Cambio de voto (UPSERT)

**Actor:** Usuario que votó "Rechazar" en TC-05

**Pasos:**
1. Ver la submission con "Tu voto: Rechazado ✗"
2. Hacer clic en "Cambiar voto"

**Resultado esperado:**
- El voto cambia a "Aprobado ✓"
- Conteos se recalculan inmediatamente
- Si el cambio genera mayoría → submission se confirma

---

### TC-09: Cuando submission B se confirma, submission A queda rechazada

**Setup:** Dos submissions pendientes A y B, B llega a mayoría primero

**Resultado esperado:**
- Submission B → badge "✓ Resultado oficial"
- Submission A → badge "Rechazado" (gris)
- `matches.scoreTeamA`, `matches.scoreTeamB`, `matches.winningTeam` actualizados en DB

---

### TC-10: Match status pasa a "completed" al confirmar resultado

**Pasos:**
1. Confirmar una submission (TC-06)
2. Recargar la página `/partidos/[id]`

**Resultado esperado:**
- Banner "✅ Este partido ya finalizó" visible
- Status del partido = COMPLETED

---

### TC-11: Historial muestra el resultado correcto post-confirmación

**Pasos:**
1. Ir a `/historial` (myMatches) con el usuario participante
2. Verificar la entrada del partido donde se confirmó el resultado

**Resultado esperado:**
- `scoreA` y `scoreB` muestran los valores confirmados (ej: "3 — 2")
- `userResult` muestra WON/LOST/DRAW según el equipo del usuario

---

### TC-12: RLS — usuario no participante no ve submissions via API

**Pasos:**
1. Llamar `matchResultSubmissions(matchId)` con token de usuario que NO participó

**Resultado esperado:**
- Error GraphQL: "Solo los participantes del partido pueden ver los resultados propuestos"

---

### TC-13: Validación de scores inválidos

**Pasos:**
1. Intentar proponer scoreA=-1 o scoreA=100

**Resultado esperado (cliente):**
- El input tiene `min=0, max=99` — el browser bloquea el envío
- Backend también rechaza con Zod: "El marcador no puede ser negativo" / "Marcador demasiado alto"

---

### TC-14: Partido aún no empezado — sin sección de resultados

**Pasos:**
1. Ir a un partido con `scheduledAt` en el futuro y status `open`

**Resultado esperado:**
- La sección "Resultado del partido" NO aparece, aunque el usuario sea participante

---

### TC-15: Cache Redis invalidada al confirmar resultado (si Redis está activo)

**Pasos:**
1. Hacer GET `match:participants:{matchId}` en Redis antes del voto confirmatorio
2. Confirmar resultado
3. Verificar que la key fue eliminada

**Resultado esperado:**
- La key `match:participants:{matchId}` ya no existe en Redis
- El historial del usuario (`user:matches:{userId}*`) también fue invalidado
- La próxima carga de la página de detalle trae datos frescos de la DB

---

### TC-16: Match cancelled — no permite proposals ni votos

**Pre-condición:** Match con `status = 'cancelled'` cuyo `scheduledAt` ya pasó, con al menos un usuario participante.

**Pasos:**
1. Autenticarse como un participante del match cancelado
2. Ir a `/partidos/[id]` — verificar que la sección "Resultado del partido" **NO** se renderiza
   (el guard `!matchCancelled` en `[id].astro` lo impide en la UI)
3. Intentar directamente via API GraphQL:
   ```graphql
   mutation {
     proposeMatchResult(input: { matchId: "<id>", scoreA: 1, scoreB: 0 }) { id }
   }
   ```
4. Intentar votar sobre una submission existente (si existe alguna del partido):
   ```graphql
   mutation {
     voteMatchResult(input: { submissionId: "<id>", vote: APPROVE }) { statusChanged }
   }
   ```

**Resultado esperado:**
- Paso 2: la sección de votación NO aparece en el frontend (guard en `[id].astro`)
- Paso 3: error GraphQL `"El partido fue cancelado, no se pueden proponer ni votar resultados"`
- Paso 4: mismo error que paso 3

---

### TC-17: Race condition — dos votos simultáneos al último faltante para mayoría

**Pre-condición:** Match con 4 participantes (A, B, C, D). Submission S1 con 1 approve (de A). Mayoría requiere > 2 votos (es decir, 3 de 4). Setup: A ya aprobó, B y C envían approve simultáneamente.

**Setup reproducible:**
- Partido con 4 participantes inscritos
- Una submission pending con 1 approve ya registrado
- Tener listos dos tokens válidos para usuarios B y C

**Pasos:**
1. Enviar dos requests `voteMatchResult(APPROVE)` en paralelo:
   - Request 1: token de usuario B, submissionId = S1
   - Request 2: token de usuario C, submissionId = S1
2. Esperar a que ambos completen
3. Verificar la submission S1 en la DB (GET matchResultSubmissions)
4. Verificar el match en la DB

**Resultado esperado:**
- Ambas requests completan sin error (HTTP 200, sin `errors[]` en respuesta GraphQL)
- S1 tiene `status = CONFIRMED`
- `matches.status = 'completed'`
- El count de approves en S1 es exactamente 3 (no 4 ni más)
- Al menos una respuesta tiene `statusChanged: true`; la otra puede tener `statusChanged: true` también (race condition documentada — `confirmSubmission` es idempotente, el segundo `true` es un falso positivo benigno)
- No hay submissions duplicadas ni votos duplicados (UNIQUE constraint previene doble-insert del mismo votador)

**Nota:** Para simular requests simultáneas usar `Promise.all` en un script de test o `curl &` en paralelo.

---

## Notas de implementación

- `winningTeam` en DB: `'a'` | `'b'` | `'draw'` (lowercase)
- `winningTeam` en GraphQL: `'A'` | `'B'` | `'DRAW'` (uppercase)
- Confirmación usa service-role (bypass RLS) porque la política UPDATE en matches solo permite al organizador
- El UPSERT de votos usa `onConflict: 'submissionId,voterId'` — la restricción UNIQUE ya existe en la DB
