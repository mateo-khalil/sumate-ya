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
}

async function seed(): Promise<void> {
  const client = buildAdminClient();
  await ensureMatchExists(client);
  await ensureMatchFullWithTestUser(client);
  await ensureOpenMatchExists(client);
  await ensureTestUserNotInOpenMatch(client);
  await seedClubDashboard(client);
  await seedTournaments(client);
  // eslint-disable-next-line no-console
  console.log(
    '[seed] Fixtures listas: E1 lleno, E2 abierto, dashboard club, T1 torneo abierto, T2 torneo con capitan.',
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
