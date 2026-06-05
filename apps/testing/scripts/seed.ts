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

// Tercer partido E3: terminado y con participantes reales. Dedicado al flujo de
// carga/votacion de resultados para que los specs no dependan de datos historicos.
const RESULT_VOTING_MATCH_ID = 'e1000000-0000-0000-0000-000000000003';
const RESULT_VOTING_MATCH_CAPACITY = 10;
const RESULT_VOTING_MATCH_FORMAT = '5v5';
const RESULT_VOTING_MATCH_DURATION_MIN = 60;
const RESULT_VOTING_MATCH_DAYS_AGO = 2;

// Cuarto partido E4: un solo participante. Dedicado al flujo donde leaveMatch deja
// el partido con 0 jugadores y debe auto-cancelarlo sin borrar el registro.
const EMPTY_AUTO_CANCEL_MATCH_ID = 'e1000000-0000-0000-0000-000000000004';
const EMPTY_AUTO_CANCEL_MATCH_CAPACITY = 10;
const EMPTY_AUTO_CANCEL_MATCH_FORMAT = '5v5';
const EMPTY_AUTO_CANCEL_MATCH_DURATION_MIN = 60;
const EMPTY_AUTO_CANCEL_MATCH_DAYS_AHEAD = 10;

const CLUB_DASHBOARD_FIXTURE = {
  clubId: 'b2000000-0000-0000-0000-000000000001',
  courtId: 'c2000000-0000-0000-0000-000000000001',
  freeSlotId: 'd2000000-0000-0000-0000-000000000001',
  matchSlotId: 'd2000000-0000-0000-0000-000000000002',
  blockedSlotId: 'd2000000-0000-0000-0000-000000000003',
  matchId: 'e2000000-0000-0000-0000-000000000001',
  clubName: 'Club Dashboard E2E',
  courtName: 'Cancha Dashboard 1',
} as const;

const DASHBOARD_SLOT_DAY = 'saturday';
const DASHBOARD_FREE_TIME = '10:00';
const DASHBOARD_MATCH_TIME = '11:00';
const DASHBOARD_BLOCKED_TIME = '12:00';

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

function buildUserClient(accessToken: string): SupabaseClient {
  const url = requiredEnv('SUPABASE_URL');
  const anonKey = requiredEnv('SUPABASE_ANON_KEY');
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function currentWeekSaturday(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sunday
  const monday = addDaysUTC(now, -((day + 6) % 7));
  return addDaysUTC(monday, 5);
}

function scheduledAtForDashboardMatch(): string {
  const saturday = currentWeekSaturday();
  return new Date(Date.UTC(
    saturday.getUTCFullYear(),
    saturday.getUTCMonth(),
    saturday.getUTCDate(),
    14,
    0,
    0,
  )).toISOString();
}

async function signInTestClubAdmin(): Promise<{ ownerId: string; accessToken: string }> {
  const email = process.env.TEST_CLUB_EMAIL ?? 'frantestsumateya@gmail.com';
  const password = process.env.TEST_CLUB_PASSWORD ?? 'aaaa1234';
  const authClient = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.user || !data.session) {
    throw new Error(
      `[seed] No se pudo autenticar el club_admin de testing (${email}): ${error?.message ?? 'sin usuario/sesion'}`,
    );
  }

  return { ownerId: data.user.id, accessToken: data.session.access_token };
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

async function ensureResultVotingMatchFixture(
  client: SupabaseClient,
  ricardoId: string,
): Promise<void> {
  const { data: club, error: clubError } = await client
    .from('clubs')
    .select('id')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clubError) {
    throw new Error(`[seed] Error consultando clubs (E3): ${clubError.message}`);
  }
  if (!club) {
    throw new Error('[seed] No hay clubes en la DB para crear el partido E3.');
  }

  const scheduledAt = new Date(
    Date.now() - RESULT_VOTING_MATCH_DAYS_AGO * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: upsertError } = await client.from('matches').upsert(
    {
      id: RESULT_VOTING_MATCH_ID,
      organizerId: TEST_USER_ID,
      clubId: club.id,
      format: RESULT_VOTING_MATCH_FORMAT,
      capacity: RESULT_VOTING_MATCH_CAPACITY,
      scheduledAt,
      durationMin: RESULT_VOTING_MATCH_DURATION_MIN,
      status: 'completed',
      resultStatus: 'pending',
      resultVotingClosesAt: null,
      scoreTeamA: null,
      scoreTeamB: null,
      winningTeam: null,
      description: 'Partido E3 (seed E2E) - terminado para cargar resultado.',
    },
    { onConflict: 'id' },
  );
  if (upsertError) {
    throw new Error(`[seed] No se pudo crear/ajustar el partido E3: ${upsertError.message}`);
  }

  // Reset de propuestas/votos para que el primer resultado de la corrida sea reproducible.
  // Los votos caen por ON DELETE CASCADE desde matchResultSubmissions.
  const { error: deleteSubmissionsError } = await client
    .from('matchResultSubmissions')
    .delete()
    .eq('matchId', RESULT_VOTING_MATCH_ID);
  if (deleteSubmissionsError) {
    throw new Error(
      `[seed] No se pudieron limpiar submissions del partido E3: ${deleteSubmissionsError.message}`,
    );
  }

  const { error: deleteParticipantsError } = await client
    .from('matchParticipants')
    .delete()
    .eq('matchId', RESULT_VOTING_MATCH_ID);
  if (deleteParticipantsError) {
    throw new Error(
      `[seed] No se pudieron limpiar participantes del partido E3: ${deleteParticipantsError.message}`,
    );
  }

  const { error: insertParticipantsError } = await client.from('matchParticipants').insert([
    { matchId: RESULT_VOTING_MATCH_ID, playerId: TEST_USER_ID, team: 'a' },
    { matchId: RESULT_VOTING_MATCH_ID, playerId: ricardoId, team: 'b' },
  ]);
  if (insertParticipantsError) {
    throw new Error(
      `[seed] No se pudieron crear participantes del partido E3: ${insertParticipantsError.message}`,
    );
  }
}

async function ensureEmptyAutoCancelMatchFixture(
  client: SupabaseClient,
  ricardoId: string,
): Promise<void> {
  const { data: club, error: clubError } = await client
    .from('clubs')
    .select('id')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clubError) {
    throw new Error(`[seed] Error consultando clubs (E4): ${clubError.message}`);
  }
  if (!club) {
    throw new Error('[seed] No hay clubes en la DB para crear el partido E4.');
  }

  const scheduledAt = new Date(
    Date.now() + EMPTY_AUTO_CANCEL_MATCH_DAYS_AHEAD * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: upsertError } = await client.from('matches').upsert(
    {
      id: EMPTY_AUTO_CANCEL_MATCH_ID,
      organizerId: TEST_USER_ID,
      clubId: club.id,
      format: EMPTY_AUTO_CANCEL_MATCH_FORMAT,
      capacity: EMPTY_AUTO_CANCEL_MATCH_CAPACITY,
      scheduledAt,
      durationMin: EMPTY_AUTO_CANCEL_MATCH_DURATION_MIN,
      status: 'open',
      resultStatus: 'pending',
      resultVotingClosesAt: null,
      cancellationReason: null,
      scoreTeamA: null,
      scoreTeamB: null,
      winningTeam: null,
      description: 'Partido E4 (seed E2E) - se autocancela al quedar vacio.',
    },
    { onConflict: 'id' },
  );
  if (upsertError) {
    throw new Error(`[seed] No se pudo crear/ajustar el partido E4: ${upsertError.message}`);
  }

  const { error: deleteSubmissionsError } = await client
    .from('matchResultSubmissions')
    .delete()
    .eq('matchId', EMPTY_AUTO_CANCEL_MATCH_ID);
  if (deleteSubmissionsError) {
    throw new Error(
      `[seed] No se pudieron limpiar submissions del partido E4: ${deleteSubmissionsError.message}`,
    );
  }

  const { error: deleteParticipantsError } = await client
    .from('matchParticipants')
    .delete()
    .eq('matchId', EMPTY_AUTO_CANCEL_MATCH_ID);
  if (deleteParticipantsError) {
    throw new Error(
      `[seed] No se pudieron limpiar participantes del partido E4: ${deleteParticipantsError.message}`,
    );
  }

  const { error: deleteNotificationsError } = await client
    .from('notifications')
    .delete()
    .eq('referenceId', EMPTY_AUTO_CANCEL_MATCH_ID)
    .eq('type', 'match_auto_cancelled');
  if (deleteNotificationsError) {
    throw new Error(
      `[seed] No se pudieron limpiar notificaciones del partido E4: ${deleteNotificationsError.message}`,
    );
  }

  const { error: insertParticipantsError } = await client.from('matchParticipants').insert({
    matchId: EMPTY_AUTO_CANCEL_MATCH_ID,
    playerId: ricardoId,
    team: 'a',
  });
  if (insertParticipantsError) {
    throw new Error(
      `[seed] No se pudo crear el participante unico del partido E4: ${insertParticipantsError.message}`,
    );
  }
}

async function ensureClubAdminProfile(client: SupabaseClient, ownerId: string): Promise<void> {
  const { data: profile, error: selectError } = await client
    .from('profiles')
    .select('id, role')
    .eq('id', ownerId)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando perfil club_admin: ${selectError.message}`);
  }

  if (!profile) {
    const { error: insertError } = await client.from('profiles').insert({
      id: ownerId,
      displayName: 'Admin Club E2E',
      role: 'club_admin',
      division: 1,
      matchesPlayed: 0,
      matchesWon: 0,
    });
    if (insertError) {
      throw new Error(`[seed] No se pudo crear perfil club_admin: ${insertError.message}`);
    }
    return;
  }

  if (profile.role !== 'club_admin') {
    const { error: updateError } = await client
      .from('profiles')
      .update({ role: 'club_admin' })
      .eq('id', ownerId);
    if (updateError) {
      throw new Error(`[seed] No se pudo ajustar rol club_admin: ${updateError.message}`);
    }
  }
}

async function ensureDashboardClub(client: SupabaseClient, ownerId: string): Promise<string> {
  const { data: existing, error: selectError } = await client
    .from('clubs')
    .select('id')
    .eq('ownerId', ownerId)
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando club del admin E2E: ${selectError.message}`);
  }

  const payload = {
    ownerId,
    name: CLUB_DASHBOARD_FIXTURE.clubName,
    address: 'Av. Dashboard 1234',
    zone: 'E2E',
    lat: -34.9011,
    lng: -56.1645,
    phone: '+598 99 123 456',
    description: 'Club seed para tests E2E de dashboard.',
  };

  if (existing) {
    const { error: updateError } = await client
      .from('clubs')
      .update(payload)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(`[seed] No se pudo ajustar club dashboard: ${updateError.message}`);
    }
    return existing.id as string;
  }

  const { error: insertError } = await client
    .from('clubs')
    .insert({ id: CLUB_DASHBOARD_FIXTURE.clubId, ...payload });
  if (insertError) {
    throw new Error(`[seed] No se pudo crear club dashboard: ${insertError.message}`);
  }

  return CLUB_DASHBOARD_FIXTURE.clubId;
}

async function ensureDashboardCourt(client: SupabaseClient, clubId: string): Promise<string> {
  const { data: existing, error: selectError } = await client
    .from('courts')
    .select('id')
    .eq('clubId', clubId)
    .eq('name', CLUB_DASHBOARD_FIXTURE.courtName)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando cancha dashboard: ${selectError.message}`);
  }

  const payload = {
    clubId,
    name: CLUB_DASHBOARD_FIXTURE.courtName,
    surface: 'synthetic',
    isIndoor: false,
    maxFormat: '5v5',
  };

  if (existing) {
    const { error: updateError } = await client
      .from('courts')
      .update(payload)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(`[seed] No se pudo ajustar cancha dashboard: ${updateError.message}`);
    }
    return existing.id as string;
  }

  // Some shared cloud DBs already provision a court for the club_admin account
  // but do not allow direct court INSERT through the testing key. Reuse that
  // court so the dashboard seed can stay idempotent without needing schema
  // admin privileges.
  const { data: reusable, error: reusableError } = await client
    .from('courts')
    .select('id')
    .eq('clubId', clubId)
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (reusableError) {
    throw new Error(`[seed] Error buscando cancha reutilizable dashboard: ${reusableError.message}`);
  }
  if (reusable) {
    return reusable.id as string;
  }

  const { error: insertError } = await client
    .from('courts')
    .insert({ id: CLUB_DASHBOARD_FIXTURE.courtId, ...payload });
  if (insertError) {
    throw new Error(`[seed] No se pudo crear cancha dashboard: ${insertError.message}`);
  }

  return CLUB_DASHBOARD_FIXTURE.courtId;
}

async function ensureDashboardSlot(
  client: SupabaseClient,
  input: {
    id: string;
    clubId: string;
    courtId: string;
    startTime: string;
    isBlocked: boolean;
    blockReason: string | null;
    blockType: string | null;
    priceArs: number;
  },
): Promise<string> {
  const { data: existing, error: selectError } = await client
    .from('clubSlots')
    .select('id')
    .eq('courtId', input.courtId)
    .eq('dayOfWeek', DASHBOARD_SLOT_DAY)
    .eq('startTime', input.startTime)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando slot dashboard: ${selectError.message}`);
  }

  const payload = {
    clubId: input.clubId,
    courtId: input.courtId,
    dayOfWeek: DASHBOARD_SLOT_DAY,
    startTime: input.startTime,
    endTime: `${String(Number(input.startTime.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    duration: 60,
    priceArs: input.priceArs,
    isBlocked: input.isBlocked,
    blockReason: input.blockReason,
    blockType: input.blockType,
    isActive: true,
    allowOnlineBooking: true,
  };

  if (existing) {
    const { error: updateError } = await client
      .from('clubSlots')
      .update(payload)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(`[seed] No se pudo ajustar slot dashboard: ${updateError.message}`);
    }
    return existing.id as string;
  }

  const { error: insertError } = await client
    .from('clubSlots')
    .insert({ id: input.id, ...payload });
  if (insertError) {
    throw new Error(`[seed] No se pudo crear slot dashboard: ${insertError.message}`);
  }

  return input.id;
}

async function seedClubDashboard(client: SupabaseClient): Promise<void> {
  const { ownerId, accessToken } = await signInTestClubAdmin();
  const clubAdminClient = buildUserClient(accessToken);
  await ensureClubAdminProfile(client, ownerId);
  const clubId = await ensureDashboardClub(client, ownerId);
  const courtId = await ensureDashboardCourt(client, clubId);

  await ensureDashboardSlot(client, {
    id: CLUB_DASHBOARD_FIXTURE.freeSlotId,
    clubId,
    courtId,
    startTime: DASHBOARD_FREE_TIME,
    isBlocked: false,
    blockReason: null,
    blockType: null,
    priceArs: 24000,
  });

  const matchSlotId = await ensureDashboardSlot(client, {
    id: CLUB_DASHBOARD_FIXTURE.matchSlotId,
    clubId,
    courtId,
    startTime: DASHBOARD_MATCH_TIME,
    isBlocked: false,
    blockReason: null,
    blockType: null,
    priceArs: 30000,
  });

  await ensureDashboardSlot(client, {
    id: CLUB_DASHBOARD_FIXTURE.blockedSlotId,
    clubId,
    courtId,
    startTime: DASHBOARD_BLOCKED_TIME,
    isBlocked: true,
    blockReason: 'Mantenimiento E2E',
    blockType: 'maintenance',
    priceArs: 26000,
  });

  const { error: matchError } = await clubAdminClient.from('matches').upsert(
    {
      id: CLUB_DASHBOARD_FIXTURE.matchId,
      organizerId: ownerId,
      clubId,
      courtId,
      clubSlotId: matchSlotId,
      format: '5v5',
      capacity: 10,
      scheduledAt: scheduledAtForDashboardMatch(),
      durationMin: 60,
      status: 'open',
      description: 'Partido dashboard E2E',
      resultStatus: 'pending',
      winningTeam: null,
      scoreTeamA: null,
      scoreTeamB: null,
    },
    { onConflict: 'id' },
  );
  if (matchError) {
    throw new Error(`[seed] No se pudo crear/actualizar partido dashboard: ${matchError.message}`);
  }
}

/**
 * Tournament seeds — US #39 (unirse a torneo).
 *
 * Decision Context:
 * - Two tournaments with stable UUIDs are seeded so specs can navigate to real
 *   URLs on /torneos/[id] — the SSR fetch is server-side and cannot be mocked
 *   with page.route(), so real data is required.
 * - T1 (SEED_TOURNAMENTS.open): always has status=REGISTRATION and zero teams.
 *   Used by inscription tests that navigate to the page and see the join form.
 * - T2 (SEED_TOURNAMENTS.withCaptainLucas): status=REGISTRATION with Lucas's
 *   team pre-registered. Used by captain-panel tests that need captainId to
 *   match the authenticated user so TournamentRegistrationForm shows the
 *   management UI instead of the registration form.
 * - Lucas's user ID is looked up dynamically by email using the admin auth API
 *   so the seed does not hardcode a UUID that could change between environments.
 * - Tournament FK to club: we reuse the first available club (same pattern as
 *   the match seeds above).
 * - Idempotency: each operation uses upsert / ON CONFLICT DO NOTHING semantics.
 *   Tournaments are inserted only if the ID does not already exist; teams are
 *   deleted and re-inserted on each seed run to guarantee a clean captain state.
 * - Previously fixed bugs: none relevant.
 */

const SEED_TOURNAMENT_OPEN_ID = 'c0000000-0000-0000-0000-000000000001';
const SEED_TOURNAMENT_WITH_CAPTAIN_ID = 'c0000000-0000-0000-0000-000000000002';
const SEED_TOURNAMENT_WITH_FIXTURE_ID = 'c0000000-0000-0000-0000-000000000003';

/**
 * Captain UUID for the pre-registered team in T2.
 *
 * Decision Context:
 * - We reuse TEST_USER_ID (playerMateo) instead of a new test account.
 *   Reason: two new accounts (playerLucas / playerMichel) caused auth.setup.ts
 *   to run 5 parallel logins, which saturated the dev server and made the club-
 *   admin login exceed actionTimeout: 15s. Going back to 3 auth setups (Mateo,
 *   Ricardo, clubAdmin) keeps the setup phase within the server's capacity.
 * - lucas@test.com was also rejected by the DB with "Email o contraseña
 *   incorrectos" — the account does not exist in the dev environment.
 * - TEST_USER_ID is hardcoded (Mateo's UUID is stable and known), so no
 *   signInWithPassword or auth.admin.listUsers() call is needed at all.
 * - Previously fixed bugs:
 *   1. auth.admin.listUsers() threw "Database error finding users" — replaced
 *      with signInWithPassword approach, then removed entirely in favour of the
 *      known UUID.
 *   2. lucas@test.com / Test1234! returned "Email o contraseña incorrectos" in
 *      auth.setup.ts — the account does not exist in this dev DB.
 */
const CAPTAIN_USER_ID = TEST_USER_ID; // playerMateo (mateoduran2010@gmail.com)

const SEED_PERMANENT_TEAMS = {
  captainTeamId: 'a3000000-0000-0000-0000-000000000001',
  claimableTeamId: 'a3000000-0000-0000-0000-000000000002',
  pendingInvitationId: 'a3000000-0000-0000-0000-000000000101',
} as const;

async function signInTestPlayerRicardo(): Promise<{ userId: string }> {
  const email = process.env.TEST_PLAYER_RICARDO_EMAIL ?? 'ricardo@gmail.com';
  const password = process.env.TEST_PLAYER_RICARDO_PASSWORD ?? 'bbbb1234';
  const authClient = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new Error(
      `[seed] No se pudo autenticar playerRicardo (${email}): ${error?.message ?? 'sin usuario'}`,
    );
  }

  return { userId: data.user.id };
}

async function ensureProfileDisplayName(
  client: SupabaseClient,
  userId: string,
  displayName: string,
  role = 'player',
): Promise<void> {
  const { data: profile, error: selectError } = await client
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando profile ${userId}: ${selectError.message}`);
  }

  if (!profile) {
    const { error: insertError } = await client.from('profiles').insert({
      id: userId,
      displayName,
      role,
      division: 1,
      matchesPlayed: 0,
      matchesWon: 0,
    });
    if (insertError) {
      throw new Error(`[seed] No se pudo crear profile ${userId}: ${insertError.message}`);
    }
    return;
  }

  const { error: updateError } = await client
    .from('profiles')
    .update({ displayName, role })
    .eq('id', userId);
  if (updateError) {
    throw new Error(`[seed] No se pudo ajustar profile ${userId}: ${updateError.message}`);
  }
}

async function seedPermanentTeams(client: SupabaseClient, ricardoId: string): Promise<void> {
  /*
   * Permanent teams for issue #137 E2E coverage.
   *
   * T1: Mateo is captain, Ricardo is member. Used for dashboard, invitations,
   * availability, tournament enrollment, config, navbar and non-captain gates.
   * T2: Mateo is a member but captainId=null. Used to verify claimCaptain.
   */
  await ensureProfileDisplayName(client, TEST_USER_ID, 'Mateo Duran E2E');
  await ensureProfileDisplayName(client, ricardoId, 'Ricardo E2E');

  const teamIds = [
    SEED_PERMANENT_TEAMS.captainTeamId,
    SEED_PERMANENT_TEAMS.claimableTeamId,
  ];

  await client
    .from('playerAvailability')
    .delete()
    .in('teamId', teamIds);
  await client
    .from('teamInvitations')
    .delete()
    .in('teamId', teamIds);

  const { data: tournamentTeamRows } = await client
    .from('tournamentTeams')
    .select('id')
    .in('permanentTeamId', teamIds);
  if (tournamentTeamRows && tournamentTeamRows.length > 0) {
    const tournamentTeamIds = tournamentTeamRows.map((row: { id: string }) => row.id);
    await client
      .from('tournamentTeamMembers')
      .delete()
      .in('teamId', tournamentTeamIds);
    await client
      .from('tournamentTeams')
      .delete()
      .in('id', tournamentTeamIds);
  }

  await client
    .from('teamMembers')
    .delete()
    .in('teamId', teamIds);

  const now = new Date().toISOString();
  const teamPayloads = [
    {
      id: SEED_PERMANENT_TEAMS.captainTeamId,
      name: 'Equipo Capitan Permanente E2E',
      captainId: TEST_USER_ID,
      logoUrl: null,
      format: '7v7',
      description: 'Equipo permanente para pruebas E2E de capitan y administrador.',
      isActive: true,
      createdBy: TEST_USER_ID,
      updatedAt: now,
    },
    {
      id: SEED_PERMANENT_TEAMS.claimableTeamId,
      name: 'Equipo Sin Capitan E2E',
      captainId: null,
      logoUrl: null,
      format: '5v5',
      description: 'Equipo sin capitan para probar reclamo de capitania.',
      isActive: true,
      createdBy: TEST_USER_ID,
      updatedAt: now,
    },
  ];

  const { error: teamError } = await client
    .from('teams')
    .upsert(teamPayloads, { onConflict: 'id' });
  if (teamError) {
    throw new Error(`[seed] No se pudieron crear equipos permanentes: ${teamError.message}`);
  }

  const memberPayloads = [
    {
      teamId: SEED_PERMANENT_TEAMS.captainTeamId,
      playerId: TEST_USER_ID,
      role: 'captain',
    },
    {
      teamId: SEED_PERMANENT_TEAMS.captainTeamId,
      playerId: ricardoId,
      role: 'member',
    },
    {
      teamId: SEED_PERMANENT_TEAMS.claimableTeamId,
      playerId: TEST_USER_ID,
      role: 'member',
    },
  ];
  const { error: memberError } = await client
    .from('teamMembers')
    .insert(memberPayloads);
  if (memberError) {
    throw new Error(`[seed] No se pudieron crear miembros de equipos permanentes: ${memberError.message}`);
  }

  const { error: availabilityError } = await client.from('playerAvailability').insert([
    {
      teamId: SEED_PERMANENT_TEAMS.captainTeamId,
      playerId: TEST_USER_ID,
      dayOfWeek: 1,
      startTime: '19:00',
      endTime: '21:00',
      isRecurrent: true,
    },
    {
      teamId: SEED_PERMANENT_TEAMS.captainTeamId,
      playerId: ricardoId,
      dayOfWeek: 1,
      startTime: '19:00',
      endTime: '20:00',
      isRecurrent: true,
    },
    {
      teamId: SEED_PERMANENT_TEAMS.captainTeamId,
      playerId: ricardoId,
      dayOfWeek: 3,
      startTime: '20:00',
      endTime: '22:00',
      isRecurrent: true,
    },
  ]);
  if (availabilityError) {
    throw new Error(`[seed] No se pudo crear disponibilidad permanente: ${availabilityError.message}`);
  }
}

async function ensureTournamentExists(
  client: SupabaseClient,
  id: string,
  clubId: string,
  clubOwnerId: string,
  opts: { description: string },
): Promise<void> {
  const { data: existing, error: selectError } = await client
    .from('tournaments')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (selectError) {
    throw new Error(`[seed] Error consultando tournament ${id}: ${selectError.message}`);
  }

  if (!existing) {
    const startDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { error: insertError } = await client.from('tournaments').insert({
      id,
      organizerId: clubOwnerId,
      clubId,
      name: `Torneo E2E Seed ${id.slice(-4)}`,
      format: '7v7',
      teamCount: 4,
      playersPerTeam: 7,
      status: 'registration',
      description: opts.description,
      startDate,
      endDate,
    });
    if (insertError) {
      throw new Error(
        `[seed] No se pudo crear tournament ${id}: ${insertError.message}`,
      );
    }
  } else if (existing.status !== 'registration') {
    // Reset to registration so tests can see the join form
    const { error: updateError } = await client
      .from('tournaments')
      .update({ status: 'registration' })
      .eq('id', id);
    if (updateError) {
      throw new Error(
        `[seed] No se pudo resetear status del tournament ${id}: ${updateError.message}`,
      );
    }
  }
}

async function ensureCaptainTeamExists(
  client: SupabaseClient,
  tournamentId: string,
  captainId: string,
): Promise<void> {
  /*
   * Decision Context:
   * - FK constraint: tournamentTeamMembers.teamId → tournamentTeams.id (no cascade).
   *   Deleting directly from tournamentTeams fails silently when member rows exist.
   *   Fix: look up the captain's existing team ID first, delete its members, then
   *   delete the team row. Without this, the team persists across runs, the seed
   *   loses idempotency and subsequent insert errors out on duplicate captainId.
   * - Previously fixed bugs: delete without pre-clearing members caused FK violation
   *   that Supabase JS surfaced as a silent no-op (no rows deleted), leaving stale
   *   team data in T2 across runs.
   */
  const { data: existingTeam } = await client
    .from('tournamentTeams')
    .select('id')
    .eq('tournamentId', tournamentId)
    .eq('captainId', captainId)
    .maybeSingle();

  if (existingTeam) {
    await client
      .from('tournamentTeamMembers')
      .delete()
      .eq('teamId', existingTeam.id);

    await client
      .from('tournamentTeams')
      .delete()
      .eq('id', existingTeam.id);
  }

  const { error: insertError } = await client.from('tournamentTeams').insert({
    tournamentId,
    name: 'Equipo Capitan E2E',
    captainId,
  });
  if (insertError) {
    throw new Error(
      `[seed] No se pudo crear el equipo del capitan en tournament ${tournamentId}: ${insertError.message}`,
    );
  }

  // Also ensure the captain appears in tournamentTeamMembers
  const { data: team, error: teamSelectError } = await client
    .from('tournamentTeams')
    .select('id')
    .eq('tournamentId', tournamentId)
    .eq('captainId', captainId)
    .maybeSingle();
  if (teamSelectError || !team) {
    throw new Error('[seed] No se pudo recuperar el equipo recien creado.');
  }

  const { error: memberError } = await client.from('tournamentTeamMembers').insert({
    teamId: team.id,
    playerId: captainId,
  });
  if (memberError && !memberError.message.includes('duplicate')) {
    throw new Error(
      `[seed] No se pudo agregar al capitan como miembro: ${memberError.message}`,
    );
  }
}

async function seedTournaments(client: SupabaseClient): Promise<void> {
  const { data: club, error: clubError } = await client
    .from('clubs')
    .select('id, ownerId')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clubError || !club) {
    // eslint-disable-next-line no-console
    console.warn('[seed] No hay clubes — saltando seed de torneos.');
    return;
  }

  // T1: open registration, no teams — for inscription tests
  await ensureTournamentExists(client, SEED_TOURNAMENT_OPEN_ID, club.id, club.ownerId, {
    description: 'Torneo T1 seed E2E — inscripcion abierta sin equipos.',
  });

  /*
   * Clear T1 so inscription tests always see the registration form.
   * Delete members BEFORE teams: tournamentTeamMembers.teamId has a FK constraint
   * to tournamentTeams.id (no ON DELETE CASCADE). Deleting teams first causes a FK
   * violation that Supabase JS silently ignores (0 rows deleted), leaving stale
   * team data that causes subsequent tests to show the captain panel instead of the
   * registration form. Fix: look up T1 team IDs, delete their members, then teams.
   * Previously fixed bugs: stale T1 data caused "inscribir equipo con nombre
   * duplicado" to time out on teamNameInput.fill() because waitForFormHydrated()
   * resolved seeing the captain panel (not the submit button).
   */
  const { data: t1Teams } = await client
    .from('tournamentTeams')
    .select('id')
    .eq('tournamentId', SEED_TOURNAMENT_OPEN_ID);

  if (t1Teams && t1Teams.length > 0) {
    await client
      .from('tournamentTeamMembers')
      .delete()
      .in('teamId', t1Teams.map((t: { id: string }) => t.id));
  }

  await client
    .from('tournamentTeams')
    .delete()
    .eq('tournamentId', SEED_TOURNAMENT_OPEN_ID);

  // T2: open registration with Lucas's team — for captain panel tests
  await ensureTournamentExists(
    client,
    SEED_TOURNAMENT_WITH_CAPTAIN_ID,
    club.id,
    club.ownerId,
    { description: 'Torneo T2 seed E2E — con equipo del capitan Lucas.' },
  );

  await ensureCaptainTeamExists(client, SEED_TOURNAMENT_WITH_CAPTAIN_ID, CAPTAIN_USER_ID);

  // T3: in_progress tournament with 2 teams + fixture — for US #35 fixture-display tests
  await ensureFixtureTournament(client, club.id, club.ownerId);
}

/**
 * T3 — fixture tournament for US #35 detalle-torneo tests.
 *
 * Decision Context:
 * - US #35 tests need a tournament with fixtureMatches to cover the "fixture display"
 *   section of /torneos/[id]. T1 and T2 have no fixtureMatches; adding T3 avoids
 *   changing the expectations of the existing unirse-torneo.spec.ts suite.
 * - Two teams: "Alfa E2E" (captained by club.ownerId) and "Beta E2E" (captained by
 *   TEST_USER_ID = Mateo). captainId values differ across environments so we use
 *   club.ownerId + TEST_USER_ID which are both guaranteed to exist.
 * - If club.ownerId === TEST_USER_ID (same person owns the first club AND is the test
 *   player), only Team Alfa is inserted — the seed logs a warning and continues.
 * - fixtureMatches: 1 COMPLETED (round=1, score 3-1), 1 SCHEDULED (round=2, no score).
 *   This gives the tests one "played" match with a visible score and one "pending" match.
 * - status='in_progress': prevents the registration form from showing (no free slots to
 *   join). The fixture section is always rendered regardless of status.
 * - Full teardown each run: delete fixtureMatches → members → teams before re-inserting
 *   so the seed is idempotent and scores stay predictable.
 * - Previously fixed bugs: none relevant (new seed section).
 */
async function ensureFixtureTournament(
  client: SupabaseClient,
  clubId: string,
  clubOwnerId: string,
): Promise<void> {
  const id = SEED_TOURNAMENT_WITH_FIXTURE_ID;

  // Upsert the tournament
  const { data: existing, error: selectError } = await client
    .from('tournaments')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (selectError) throw new Error(`[seed] Error consultando T3: ${selectError.message}`);

  const startDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (!existing) {
    const { error: insertError } = await client.from('tournaments').insert({
      id,
      organizerId: clubOwnerId,
      clubId,
      name: 'Torneo E2E Con Fixture',
      format: '7v7',
      teamCount: 2,
      playersPerTeam: 7,
      status: 'in_progress',
      description: 'Torneo T3 seed E2E — con fixture generado para tests de visualizacion.',
      startDate,
      endDate,
    });
    if (insertError) throw new Error(`[seed] No se pudo crear T3: ${insertError.message}`);
  } else if (existing.status !== 'in_progress') {
    const { error: updateError } = await client
      .from('tournaments')
      .update({ status: 'in_progress' })
      .eq('id', id);
    if (updateError) throw new Error(`[seed] No se pudo ajustar status T3: ${updateError.message}`);
  }

  // Teardown existing fixture + teams for idempotency
  const { data: existingTeams } = await client
    .from('tournamentTeams')
    .select('id')
    .eq('tournamentId', id);

  if (existingTeams && existingTeams.length > 0) {
    const teamIds = existingTeams.map((t: { id: string }) => t.id);
    await client.from('tournamentTeamMembers').delete().in('teamId', teamIds);
  }

  await client.from('fixtureMatches').delete().eq('tournamentId', id);
  await client.from('tournamentTeams').delete().eq('tournamentId', id);

  // Insert Team A (captained by club owner)
  const { data: teamA, error: teamAError } = await client
    .from('tournamentTeams')
    .insert({ tournamentId: id, name: 'Alfa E2E', captainId: clubOwnerId })
    .select('id')
    .single();
  if (teamAError) throw new Error(`[seed] No se pudo crear Team A en T3: ${teamAError.message}`);

  await client
    .from('tournamentTeamMembers')
    .insert({ teamId: teamA.id, playerId: clubOwnerId })
    .then(({ error }) => {
      if (error && !error.message.includes('duplicate')) {
        throw new Error(`[seed] No se pudo agregar miembro Team A T3: ${error.message}`);
      }
    });

  // Insert Team B (captained by TEST_USER_ID = Mateo) only if different captain
  let teamBId: string | null = null;
  if (clubOwnerId !== TEST_USER_ID) {
    const { data: teamB, error: teamBError } = await client
      .from('tournamentTeams')
      .insert({ tournamentId: id, name: 'Beta E2E', captainId: TEST_USER_ID })
      .select('id')
      .single();
    if (teamBError) {
      // eslint-disable-next-line no-console
      console.warn(`[seed] No se pudo crear Team B en T3 (continuando con solo 1 equipo): ${teamBError.message}`);
    } else {
      teamBId = teamB.id as string;
      await client
        .from('tournamentTeamMembers')
        .insert({ teamId: teamBId, playerId: TEST_USER_ID })
        .then(({ error }) => {
          if (error && !error.message.includes('duplicate')) {
            // eslint-disable-next-line no-console
            console.warn(`[seed] No se pudo agregar miembro Team B T3: ${error.message}`);
          }
        });
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('[seed] T3: club.ownerId === TEST_USER_ID — solo se crea un equipo en el torneo fixture.');
  }

  // Insert fixture matches
  const pastTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const futureTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { error: fm1Error } = await client.from('fixtureMatches').insert({
    tournamentId: id,
    round: 1,
    homeTeamId: teamA.id,
    awayTeamId: teamBId,
    scheduledAt: pastTime,
    status: 'completed',
    scoreHome: 3,
    scoreAway: 1,
  });
  if (fm1Error) throw new Error(`[seed] No se pudo crear fixture match COMPLETED T3: ${fm1Error.message}`);

  const { error: fm2Error } = await client.from('fixtureMatches').insert({
    tournamentId: id,
    round: 2,
    homeTeamId: teamA.id,
    awayTeamId: teamBId,
    scheduledAt: futureTime,
    status: 'scheduled',
    scoreHome: null,
    scoreAway: null,
  });
  if (fm2Error) throw new Error(`[seed] No se pudo crear fixture match SCHEDULED T3: ${fm2Error.message}`);
}

async function seed(): Promise<void> {
  const client = buildAdminClient();
  const { userId: ricardoId } = await signInTestPlayerRicardo();
  await ensureProfileDisplayName(client, TEST_USER_ID, 'Mateo Duran E2E');
  await ensureProfileDisplayName(client, ricardoId, 'Ricardo E2E');
  await ensureMatchExists(client);
  await ensureMatchFullWithTestUser(client);
  await ensureOpenMatchExists(client);
  await ensureTestUserNotInOpenMatch(client);
  await ensureResultVotingMatchFixture(client, ricardoId);
  await ensureEmptyAutoCancelMatchFixture(client, ricardoId);
  await seedClubDashboard(client);
  await seedTournaments(client);
  await seedPermanentTeams(client, ricardoId);
  // eslint-disable-next-line no-console
  console.log(
    '[seed] Fixtures listas: E1 lleno, E2 abierto, E3 resultado, E4 auto-cancel, dashboard club, T1 torneo abierto, T2 torneo con capitan, T3 torneo con fixture, equipos permanentes.',
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
