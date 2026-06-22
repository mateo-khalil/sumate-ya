/**
 * SlotManager — Horarios island. Leads with the simple per-court schedule configurator and
 * keeps the powerful per-slot calendar behind a collapsible "Vista avanzada".
 *
 * Decision Context:
 * - Why the redesign: club owners found the old screen (a 245-cell weekly grid with bulk
 *   checkboxes, a separate Precios panel, and a per-slot create/block/audit modal) impossible
 *   to map onto "set my hours and prices". This island now leads with ScheduleConfigurator —
 *   one court at a time, open days + hours + base/peak price — and relegates the grid to an
 *   advanced panel for exceptions (one-off blocks / odd slots).
 * - Single data owner: useClubSlots lives here so the configurator and the advanced panel
 *   share one slot list. Applying a schedule refetches, so the advanced calendar updates too.
 * - Courts come from SSR `initialCourts` (myClubCourts — includes courts with zero slots so a
 *   brand-new court can still be configured); we fall back to deriving them from slots if the
 *   prop is empty. Court tabs switch the configurator's target.
 * - accessToken is forwarded for client-side mutations (the HttpOnly cookie can't be read from
 *   JS, so the SSR page passes the token in as a prop on this auth-protected page only).
 * - Previously fixed bugs:
 *   - Initial GraphQL query returned "Authentication required" because the /api/graphql proxy
 *     could not reliably read the HttpOnly cookie. Fix: SSR-hydrated initialSlots.
 *   - Create Slot form required a raw court UUID. Fixed by deriving named CourtOption[].
 */

import { useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { useClubSlots } from './useClubSlots';
import { ScheduleConfigurator } from './ScheduleConfigurator';
import { SlotsAdvancedPanel } from './SlotsAdvancedPanel';
import type { CourtOption } from './SlotEditModal';
import type { ManagedClubSlot } from '../../graphql/operations/club-slots';
import type { ManagedCourt } from '../../graphql/operations/courts';

interface SlotManagerProps {
  initialSlots?: ManagedClubSlot[];
  initialCourts?: ManagedCourt[];
  initialError?: string | null;
  accessToken?: string;
}

export default function SlotManager({
  initialSlots = [], initialCourts = [], initialError = null, accessToken = '',
}: SlotManagerProps) {
  const { slots, loading, error, refetch, createSlot, updateSlot, deleteSlot, toggleBlock, bulkBlock, applyCourtSchedule } =
    useClubSlots({ initialSlots, initialError, accessToken });

  // Courts: prefer the SSR myClubCourts list (covers courts with no slots yet); otherwise
  // derive from the slots we have. Sorted alphabetically for a stable tab order.
  const courts = useMemo((): CourtOption[] => {
    if (initialCourts.length) {
      return [...initialCourts].map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
    }
    const seen = new Set<string>();
    const result: CourtOption[] = [];
    for (const slot of slots) {
      if (!seen.has(slot.courtId)) { seen.add(slot.courtId); result.push({ id: slot.courtId, name: slot.court.name }); }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [initialCourts, slots]);

  const [selectedCourtId, setSelectedCourtId] = useState<string>(courts[0]?.id ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showMsg = useCallback((msg: string, isError = false) => {
    if (isError) { setActionError(msg); setSuccessMsg(null); }
    else { setSuccessMsg(msg); setActionError(null); }
    setTimeout(() => { setActionError(null); setSuccessMsg(null); }, 5000);
  }, []);

  // Keep a valid selected court if the list changes.
  const activeCourtId = courts.some((c) => c.id === selectedCourtId) ? selectedCourtId : (courts[0]?.id ?? '');
  const activeCourt = courts.find((c) => c.id === activeCourtId) ?? null;
  const courtSlots = useMemo(() => slots.filter((s) => s.courtId === activeCourtId), [slots, activeCourtId]);

  const handleApply = useCallback(
    async (input: Parameters<typeof applyCourtSchedule>[0]) => {
      const res = await applyCourtSchedule(input);
      showMsg(res.message, !res.success);
      return res;
    },
    [applyCourtSchedule, showMsg],
  );

  if (loading) return <div className="state-card"><p className="state-text">Cargando horarios...</p></div>;
  if (error) {
    return (
      <div className="state-card state-card--error">
        <p className="state-text">{error}</p>
        <button className="btn-secondary" onClick={refetch}>Reintentar</button>
      </div>
    );
  }

  if (!courts.length) {
    return (
      <div className="state-card">
        <p className="state-text">Todavía no tenés canchas. Creá una cancha para configurar sus horarios.</p>
        <a className="btn-primary" href="/panel-club/canchas">Ir a Canchas</a>
      </div>
    );
  }

  return (
    <div className="slot-manager">
      {/* Feedback banners */}
      {actionError && <div className="banner banner--error">{actionError}</div>}
      {successMsg && <div className="banner banner--success">{successMsg}</div>}

      {/* Court tabs (hidden when there is a single court) */}
      {courts.length > 1 && (
        <div className="court-tabs" role="tablist" aria-label="Canchas">
          {courts.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === activeCourtId}
              className={`court-tab${c.id === activeCourtId ? ' court-tab--active' : ''}`}
              onClick={() => setSelectedCourtId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Primary: the simple configurator for the selected court */}
      {activeCourt && (
        <ScheduleConfigurator
          key={activeCourt.id}
          court={activeCourt}
          courtSlots={courtSlots}
          accessToken={accessToken}
          onApply={handleApply}
        />
      )}

      {/* Advanced: per-slot calendar / blocks, collapsed by default */}
      <div className="adv-wrap">
        <button
          className="adv-toggle"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
          Vista avanzada y bloqueos puntuales
          {advancedOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {advancedOpen && (
          <SlotsAdvancedPanel
            slots={courtSlots}
            courts={courts}
            accessToken={accessToken}
            createSlot={createSlot}
            updateSlot={updateSlot}
            deleteSlot={deleteSlot}
            toggleBlock={toggleBlock}
            bulkBlock={bulkBlock}
            onMessage={showMsg}
          />
        )}
      </div>
    </div>
  );
}
