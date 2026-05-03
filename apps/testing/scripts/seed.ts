import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

/**
 * Seed de datos para los tests E2E.
 *
 * Decision Context:
 * - Por que existe: varios tests del detalle de partido (match-detail.spec.ts) usaban
 *   `test.skip` cuando no encontraban un partido en estado FULL, o cuando el usuario de
 *   prueba (`mateoduran2010@gmail.com`) no estaba inscripto en ningun partido. Eso hacia
 *   que la suite reportara tests "skipped" en CI/local en vez de fallar/pasar de forma
 *   determinista. Con un seed idempotente garantizamos las precondiciones antes de cada
 *   corrida sin acoplarnos al estado historico de la DB.
 * - Idempotencia: cada operacion checkea primero (SELECT) o usa upsert/ON CONFLICT, asi
 *   correr el seed N veces siempre deja el mismo estado final. Esto es importante porque
 *   se ejecuta en `globalSetup` de Playwright en cada `pnpm test`.
 * - Acceso: usamos `PRIVATE_SUPABASE_SECRET_KEY` (service role) para saltarnos RLS y
 *   poder armar las fixtures con seguridad. La key se lee del `.env` del backend
 *   (apps/backend/.env), que es donde el resto del monorepo la mantiene.
 * - Que se garantiza:
 *   1. El partido E1 existe en la DB con capacity=10, format='5v5' y status='open'
 *      (referenciando un club ya creado). Antes asumiamos que `apps/backend/supabase/seed.sql`
 *      lo dejaba listo, pero en entornos donde ese SQL nunca corrio el FK
 *      `matchParticipants_matchId_fkey` reventaba al intentar agregar participantes.
 *   2. El usuario de prueba esta inscripto en el partido E1 con team='b'
 *      (fixtures de "ya inscripto" + "salir del partido").
 *   3. El partido E1 queda con 10 participantes en total — asi `availableSlots === 0`
 *      y status='open' — satisface el predicate del test "partido completo" sin sacarlo
 *      del listado `matches` (que filtra por OPEN). El frontend deriva `matchFull` desde
 *      availableSlots para mostrar el badge "Completo" aunque el status DB siga 'open'.
 *   4. El partido E2 existe con capacity=10, status='open', SIN participantes y SIN el
 *      usuario de prueba inscripto. Garantiza un partido compatible con los predicates
 *      de "CTA login para sumarse" y "Sumarme por equipo" (que antes hacian test.skip
 *      cuando la DB del entorno no tenia un partido abierto con cupos).
 * - Por que NO mockear el SSR de Astro: el detalle de partido se renderiza server-side,
 *   asi que `page.route()` de Playwright (que solo intercepta requests del browser) no
 *   alcanza. Tener data real seedeada es mas robusto que inventar mocks SSR.
 * - Previously fixed bugs:
 *   - FK violation `matchParticipants_matchId_fkey` cuando el partido E1 no existia en
 *     la DB de destino. Solucion: el seed ahora hace upsert del match antes de tocar
 *     participantes, usando un club existente como FK.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_ENV = path.resolve(REPO_ROOT, 'apps', 'backend', '.env');

dotenv.config({ path: BACKEND_ENV });

const TEST_USER_ID = 'f43d137c-9367-47f8-99e1-0e7a2130cc1d'; // mateoduran2010@gmail.com
const FULL_MATCH_ID = 'e1000000-0000-0000-0000-000000000001';
const FULL_MATCH_CAPACITY = 10;
const FULL_MATCH_FORMAT = '5v5'; // 5+5 = capacity 10
const FULL_MATCH_DURATION_MIN = 60;
const FULL_MATCH_DAYS_AHEAD = 7;

// Segundo partido E2: queda OPEN con cupos disponibles y SIN el usuario de prueba
// inscripto. Garantiza que los tests "CTA login para sumarse" y "Sumarme por equipo"
// del detalle de partido encuentren un partido compatible con sus predicates y no
// caigan en `test.skip`.
const OPEN_MATCH_ID = 'e1000000-0000-0000-0000-000000000002';
const OPEN_MATCH_CAPACITY = 10;
const OPEN_MATCH_FORMAT = '5v5';
const OPEN_MATCH_DURATION_MIN = 60;
const OPEN_MATCH_DAYS_AHEAD = 14;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[seed] Falta la variable de entorno ${name} (esperada en ${BACKEND_ENV}).`,
    );
  }
  return value;
}

function buildAdminClient(): SupabaseClient {
  const url = requiredEnv('SUPABASE_URL');
  const serviceKey = requiredEnv('PRIVATE_SUPABASE_SECRET_KEY');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function ensureMatchExists(client: SupabaseClient): Promise<void> {
  const { data: existing, error: selectError } = await client
    .from('matches')
    .select('id, capacity, status, format')
    .eq('id', FULL_MATCH_ID)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando matches: ${selectError.message}`);
  }

  // Si ya existe, solo nos aseguramos de capacity/status/format esperados.
  if (existing) {
    const needsUpdate =
      existing.capacity !== FULL_MATCH_CAPACITY ||
      existing.status !== 'open' ||
      existing.format !== FULL_MATCH_FORMAT;
    if (!needsUpdate) {
      return;
    }
    const { error: updateError } = await client
      .from('matches')
      .update({
        capacity: FULL_MATCH_CAPACITY,
        status: 'open',
        format: FULL_MATCH_FORMAT,
      })
      .eq('id', FULL_MATCH_ID);
    if (updateError) {
      throw new Error(`[seed] No se pudo ajustar el partido E1: ${updateError.message}`);
    }
    return;
  }

  // No existe: necesitamos un club como FK. Tomamos cualquiera ya creado.
  const { data: club, error: clubError } = await client
    .from('clubs')
    .select('id, ownerId')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clubError) {
    throw new Error(`[seed] Error consultando clubs: ${clubError.message}`);
  }
  if (!club) {
    throw new Error(
      '[seed] No hay clubes en la DB. Cargá las fixtures base (apps/backend/supabase/seed.sql) o creá un club antes de correr los tests.',
    );
  }

  const scheduledAt = new Date(
    Date.now() + FULL_MATCH_DAYS_AHEAD * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error: insertError } = await client.from('matches').insert({
    id: FULL_MATCH_ID,
    organizerId: club.ownerId,
    clubId: club.id,
    format: FULL_MATCH_FORMAT,
    capacity: FULL_MATCH_CAPACITY,
    scheduledAt,
    durationMin: FULL_MATCH_DURATION_MIN,
    status: 'open',
    description: 'Partido E1 (seed E2E) — usado por tests de detalle de partido lleno.',
  });
  if (insertError) {
    throw new Error(`[seed] No se pudo crear el partido E1: ${insertError.message}`);
  }
}

async function ensureMatchFullWithTestUser(client: SupabaseClient): Promise<void> {
  const { data: rows, error: selectError } = await client
    .from('matchParticipants')
    .select('playerId, team')
    .eq('matchId', FULL_MATCH_ID);
  if (selectError) {
    throw new Error(
      `[seed] Error consultando matchParticipants: ${selectError.message}`,
    );
  }

  const currentIds = new Set<string>((rows ?? []).map((r) => r.playerId as string));

  // 1. Test user siempre presente (en team='b').
  if (!currentIds.has(TEST_USER_ID)) {
    const { error: insertUserError } = await client
      .from('matchParticipants')
      .insert({ matchId: FULL_MATCH_ID, playerId: TEST_USER_ID, team: 'b' });
    if (insertUserError) {
      throw new Error(
        `[seed] No se pudo agregar al usuario de prueba al partido E1: ${insertUserError.message}`,
      );
    }
    currentIds.add(TEST_USER_ID);
  }

  // 2. Si ya esta lleno (o pasado), no agregamos mas.
  if (currentIds.size >= FULL_MATCH_CAPACITY) {
    return;
  }

  // 3. Buscamos profiles existentes para llenar los slots faltantes.
  const needed = FULL_MATCH_CAPACITY - currentIds.size;
  const { data: candidates, error: profilesError } = await client
    .from('profiles')
    .select('id')
    .neq('id', TEST_USER_ID)
    .limit(needed + currentIds.size + 5); // margen para descartar duplicados ya inscriptos
  if (profilesError) {
    throw new Error(
      `[seed] Error consultando profiles para llenar el partido E1: ${profilesError.message}`,
    );
  }

  const fillers = (candidates ?? [])
    .map((c) => c.id as string)
    .filter((id) => !currentIds.has(id))
    .slice(0, needed);

  if (fillers.length < needed) {
    throw new Error(
      `[seed] No hay suficientes profiles distintos para llenar el partido E1 (necesitamos ${needed}, encontramos ${fillers.length}).`,
    );
  }

  // Repartimos team A/B alternando para que ambos lados queden poblados.
  const inserts = fillers.map((playerId, index) => ({
    matchId: FULL_MATCH_ID,
    playerId,
    team: index % 2 === 0 ? 'a' : 'b',
  }));

  const { error: insertFillersError } = await client
    .from('matchParticipants')
    .insert(inserts);
  if (insertFillersError) {
    throw new Error(
      `[seed] No se pudieron agregar participantes de relleno al partido E1: ${insertFillersError.message}`,
    );
  }
}

async function ensureOpenMatchExists(client: SupabaseClient): Promise<void> {
  const { data: existing, error: selectError } = await client
    .from('matches')
    .select('id, capacity, status, format')
    .eq('id', OPEN_MATCH_ID)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando matches (E2): ${selectError.message}`);
  }

  if (existing) {
    const needsUpdate =
      existing.capacity !== OPEN_MATCH_CAPACITY ||
      existing.status !== 'open' ||
      existing.format !== OPEN_MATCH_FORMAT;
    if (needsUpdate) {
      const { error: updateError } = await client
        .from('matches')
        .update({
          capacity: OPEN_MATCH_CAPACITY,
          status: 'open',
          format: OPEN_MATCH_FORMAT,
        })
        .eq('id', OPEN_MATCH_ID);
      if (updateError) {
        throw new Error(`[seed] No se pudo ajustar el partido E2: ${updateError.message}`);
      }
    }
    return;
  }

  const { data: club, error: clubError } = await client
    .from('clubs')
    .select('id, ownerId')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clubError) {
    throw new Error(`[seed] Error consultando clubs (E2): ${clubError.message}`);
  }
  if (!club) {
    throw new Error('[seed] No hay clubes en la DB para crear el partido E2.');
  }

  const scheduledAt = new Date(
    Date.now() + OPEN_MATCH_DAYS_AHEAD * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error: insertError } = await client.from('matches').insert({
    id: OPEN_MATCH_ID,
    organizerId: club.ownerId,
    clubId: club.id,
    format: OPEN_MATCH_FORMAT,
    capacity: OPEN_MATCH_CAPACITY,
    scheduledAt,
    durationMin: OPEN_MATCH_DURATION_MIN,
    status: 'open',
    description: 'Partido E2 (seed E2E) — abierto y con cupos para tests de detalle.',
  });
  if (insertError) {
    throw new Error(`[seed] No se pudo crear el partido E2: ${insertError.message}`);
  }
}

async function ensureTestUserNotInOpenMatch(client: SupabaseClient): Promise<void> {
  // Garantiza que el usuario de prueba NO esta inscripto en E2 (el predicate del test
  // "Sumarme por equipo" filtra por isCurrentUserJoined === false). Es el inverso de
  // lo que hace ensureMatchFullWithTestUser para E1.
  const { error } = await client
    .from('matchParticipants')
    .delete()
    .eq('matchId', OPEN_MATCH_ID)
    .eq('playerId', TEST_USER_ID);
  if (error) {
    throw new Error(
      `[seed] No se pudo limpiar la inscripcion del usuario de prueba en E2: ${error.message}`,
    );
  }
}

async function seed(): Promise<void> {
  const client = buildAdminClient();
  await ensureMatchExists(client);
  await ensureMatchFullWithTestUser(client);
  await ensureOpenMatchExists(client);
  await ensureTestUserNotInOpenMatch(client);
  // eslint-disable-next-line no-console
  console.log(
    '[seed] Fixtures listas: E1 lleno con usuario inscripto, E2 abierto sin usuario.',
  );
}

export default async function globalSetup(): Promise<void> {
  await seed();
}

if (require.main === module) {
  seed().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
