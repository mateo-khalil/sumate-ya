import {
  test,
  expect,
  TEST_USERS,
  GRAPHQL_AUTH_ROUTE,
  mockGraphQLOperation,
  mockGraphQLOperations,
  type GraphQLRequest,
} from './support';

/**
 * Regression e2e — gestión de horarios de club (/panel-club/horarios).
 *
 * User Story: como administrador de club, quiero bloquear y liberar horarios de mis
 * canchas para controlar cuándo se pueden crear partidos.
 *
 * Decision Context:
 * - Auth: storage state de `clubAdmin` (único club_admin sembrado). El seed
 *   (`seedClubDashboard`) le crea slots, así que la vista Lista de SlotManager siempre
 *   tiene filas con acciones por slot.
 * - Boundary de mocking: la primera carga de slots es SSR (no interceptable). Pero las
 *   operaciones que dispara el browser DESPUÉS de hidratar —`toggleSlotBlock`,
 *   `bulkBlockSlots`, `slotAuditLog`— van por POST a `/api/graphql-auth`, y eso SÍ se
 *   intercepta con `page.route` (GRAPHQL_AUTH_ROUTE). Mockeamos esas ops para asertar el
 *   shape del request y el render del diálogo, sin depender de datos sembrados puntuales.
 * - Usamos la vista Lista (no calendario) para clickear acciones por fila: el calendario
 *   es semanal y un slot sembrado puede caer en "past day" y no ser clickeable.
 *
 * Bugs previos que estos specs protegen (encontrados y corregidos en E2E manual):
 *   1. Bloquear un slot INDIVIDUAL con partido enviaba `bulkBlockSlots(slotIds: [])`
 *      (perdía el id del slot porque el diálogo caía en el set de selección múltiple,
 *      vacío) → el backend rechazaba y nunca se cancelaba/bloqueaba. Fix: SlotManager
 *      transporta `slotId` en el estado del modal 'bulk'.
 *   2. La pestaña Historial siempre fallaba ("No se pudo cargar el historial"): la query
 *      `slotAuditLog` iba al proxy NO autenticado `/api/graphql` (no lee la cookie
 *      HttpOnly) → "Authentication required". Fix: SlotHistoryTab postea a
 *      `/api/graphql-auth` con Bearer token.
 *   3. El preview de impacto mostraba "0 jugador(es)" por partido
 *      (`matchDetails.participantCount` hardcodeado a 0). Fix: enriquecido en el backend;
 *      acá verificamos que el diálogo renderiza el conteo recibido.
 */

test.use({ storageState: TEST_USERS.clubAdmin.storageStatePath });

/** Impact-preview payload returned by a single-slot toggleSlotBlock when a match exists. */
const TOGGLE_WITH_MATCH = {
  data: {
    toggleSlotBlock: {
      success: false,
      message: 'Hay 1 partido(s) programado(s).',
      slot: null,
      impactPreview: {
        totalSlotsAffected: 1,
        matchesAffected: 1,
        playersToNotify: 2,
        matchDetails: [
          {
            matchId: 'm-e2e-0001',
            title: 'Partido E2E',
            scheduledAt: '2026-06-06T13:00:00.000Z',
            participantCount: 2,
          },
        ],
      },
      cancelledMatchesCount: 0,
      notifiedPlayersCount: 0,
    },
  },
};

const BULK_BLOCK_OK = {
  data: {
    bulkBlockSlots: {
      success: true,
      affectedCount: 1,
      skippedCount: 0,
      message: '1 slot(s) bloqueado(s).',
      impactPreview: null,
      cancelledMatchesCount: 1,
      notifiedPlayersCount: 2,
    },
  },
};

const AUDIT_LOG_ONE_ENTRY = {
  data: {
    slotAuditLog: [
      {
        id: 'audit-e2e-1',
        slotId: 'slot-e2e-1',
        action: 'BLOCKED',
        previousValue: JSON.stringify({ isBlocked: false }),
        newValue: JSON.stringify({ isBlocked: true, blockType: 'maintenance' }),
        changedBy: { id: 'admin-e2e', displayName: 'Club Owner', avatarUrl: null, __typename: 'AuditProfile' },
        reason: 'Mantenimiento E2E',
        createdAt: '2026-06-01T12:00:00.000Z',
        __typename: 'SlotAuditLog',
      },
    ],
  },
};

function findOp(payloads: GraphQLRequest[], marker: string): GraphQLRequest | undefined {
  return payloads.find((p) => p.query?.includes(marker));
}

test.describe('Gestión de horarios — bloqueo de slots', () => {
  test('bloquear un slot individual con partido envía su slotId (no un array vacío) y muestra el impacto por partido', async ({
    page,
    horariosPage,
  }) => {
    // Both ops share /api/graphql-auth → one handler (route.continue terminates routing,
    // so two separate mocks on the same route can't both win).
    const { payloads } = await mockGraphQLOperations(page, GRAPHQL_AUTH_ROUTE, [
      { marker: 'toggleSlotBlock', body: TOGGLE_WITH_MATCH },
      { marker: 'bulkBlockSlots', body: BULK_BLOCK_OK },
    ]);

    await horariosPage.goto();
    await horariosPage.switchToList();
    await horariosPage.blockFirstSlot();

    // Impact preview surfaced: 1 slot, and the per-match player count renders (bug #3).
    await expect(horariosPage.blockDialog).toBeVisible();
    const selectedCount = horariosPage.blockDialog
      .locator('.impact-row', { hasText: 'Slots seleccionados' })
      .locator('.impact-value');
    await expect(selectedCount).toHaveText('1');
    await expect(horariosPage.playersPerMatch(2)).toBeVisible();

    await horariosPage.confirmForceBlock();

    // The confirm must call bulkBlockSlots carrying THIS slot's id (bug #1).
    await expect.poll(() => Boolean(findOp(payloads, 'bulkBlockSlots'))).toBe(true);

    const toggle = findOp(payloads, 'toggleSlotBlock');
    const bulk = findOp(payloads, 'bulkBlockSlots');
    const clickedSlotId = (toggle?.variables as { input?: { slotId?: string } })?.input?.slotId;
    const sentSlotIds = (bulk?.variables as { input?: { slotIds?: string[] } })?.input?.slotIds;

    expect(clickedSlotId, 'toggleSlotBlock should carry the clicked slot id').toBeTruthy();
    expect(sentSlotIds, 'bulkBlockSlots.slotIds must not be empty').toEqual([clickedSlotId]);

    // Dialog closes on success.
    await expect(horariosPage.blockDialog).toBeHidden();
  });

  test('la pestaña Historial carga la auditoría desde el proxy autenticado', async ({
    page,
    horariosPage,
  }) => {
    // Mock ONLY slotAuditLog on the AUTHENTICATED route. If the code regresses to the
    // unauthenticated /api/graphql proxy, this mock never fires (payloads stays empty)
    // and the real backend 401s → the error state shows and entries never render.
    const { payloads } = await mockGraphQLOperation(
      page,
      GRAPHQL_AUTH_ROUTE,
      'slotAuditLog',
      AUDIT_LOG_ONE_ENTRY,
    );

    await horariosPage.goto();
    await horariosPage.switchToList();
    await horariosPage.openFirstSlotDetail();
    await horariosPage.openHistoryTab();

    // Entry renders, no error banner — proves the request reached an authenticated endpoint.
    await expect(horariosPage.historyEntries.first()).toBeVisible();
    await expect(horariosPage.historyError).toHaveCount(0);
    await expect(horariosPage.historyEntries.first()).toContainText('Club Owner');

    // And it specifically went to /api/graphql-auth (the mock is registered only there).
    expect(payloads.length, 'slotAuditLog must hit /api/graphql-auth').toBe(1);
  });
});
