/**
 * SlotManager — main React island for club slot management
 *
 * Decision Context:
 * - Why island with client:load: the admin needs immediate interactivity (create, edit,
 *   block slots). client:load ensures the component hydrates as soon as the page loads.
 * - State split: slots live in the useClubSlots hook; UI state (selected, modals) lives here.
 * - SSR-hydrated initial state: horarios.astro fetches slots server-side using the HttpOnly
 *   cookie and passes them as initialSlots. The hook uses these as initial state so the UI
 *   renders immediately without a client-side query (which previously failed on auth).
 * - accessToken prop: forwarded to the hook so mutation calls include Authorization
 *   explicitly. The HttpOnly cookie cannot be read from JS, so we receive it via SSR prop.
 *   Trade-off: token is exposed to JS on this auth-protected page only.
 * - BulkBlockDialog shows a consolidated impact preview before confirming destructive ops.
 * - When toggleSlotBlock returns impactPreview (matches exist, no confirmForce), the UI
 *   transitions to the BulkBlockDialog for the single-slot case too, reusing the same flow.
 * - Semantic color classes: available=green, hasMatch=yellow, blocked=red, inactive=gray.
 * - Previously fixed bugs:
 *   - Initial GraphQL query returned "Authentication required" because the /api/graphql
 *     proxy could not reliably read the HttpOnly cookie. Fix: SSR-hydrated initialSlots.
 */

import { useState, useCallback } from 'react';
import { Plus, List, CalendarDays, DollarSign } from 'lucide-react';
import { useClubSlots } from './useClubSlots';
import { SlotListView } from './SlotListView';
import { SlotCalendarView } from './SlotCalendarView';
import { CourtPricingPanel } from './CourtPricingPanel';
import { SlotEditModal } from './SlotEditModal';
import { BulkBlockDialog } from './BulkBlockDialog';
import type { ManagedClubSlot, BlockSlotInput, SlotImpactPreview } from '../../graphql/operations/club-slots';

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; slot: ManagedClubSlot }
  | { type: 'bulk'; isBlocked: boolean; impactPreview: SlotImpactPreview | null };

interface SlotManagerProps {
  initialSlots?: ManagedClubSlot[];
  initialError?: string | null;
  accessToken?: string;
}

export default function SlotManager({ initialSlots = [], initialError = null, accessToken = '' }: SlotManagerProps) {
  const { slots, loading, error, refetch, createSlot, updateSlot, deleteSlot, toggleBlock, bulkBlock } =
    useClubSlots({ initialSlots, initialError, accessToken });

  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [showPricing, setShowPricing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const closeModal = useCallback(() => setModal({ type: 'none' }), []);

  function showMsg(msg: string, isError = false) {
    if (isError) { setActionError(msg); setSuccessMsg(null); }
    else { setSuccessMsg(msg); setActionError(null); }
    setTimeout(() => { setActionError(null); setSuccessMsg(null); }, 4000);
  }

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const activeIds = slots.filter((s) => s.isActive).map((s) => s.id);
    setSelectedIds((prev) =>
      prev.size === activeIds.length ? new Set() : new Set(activeIds),
    );
  }, [slots]);

  const handleSingleBlock = useCallback(
    async (input: BlockSlotInput) => {
      const result = await toggleBlock(input);
      if (result.impactPreview && !input.confirmForce) {
        // Matches exist — show confirmation dialog
        setModal({ type: 'bulk', isBlocked: input.isBlocked, impactPreview: result.impactPreview });
      } else if (result.success) {
        showMsg(input.isBlocked ? 'Slot bloqueado' : 'Slot desbloqueado');
        closeModal();
      } else {
        showMsg(result.message || 'Error al cambiar estado del slot', true);
      }
    },
    [toggleBlock, closeModal],
  );

  const handleBulkAction = useCallback(
    async (isBlocked: boolean) => {
      if (selectedIds.size === 0) return;
      const slotIds = Array.from(selectedIds);
      const result = await bulkBlock({ slotIds, isBlocked, confirmForce: false });
      if (result.impactPreview && result.affectedCount === 0) {
        setModal({ type: 'bulk', isBlocked, impactPreview: result.impactPreview });
      } else if (result.success) {
        showMsg(`${result.affectedCount} slot(s) procesado(s)`);
        setSelectedIds(new Set());
      } else {
        showMsg(result.message || 'Error en operación masiva', true);
      }
    },
    [selectedIds, bulkBlock],
  );

  const handleBulkConfirm = useCallback(
    async (reason: string, blockType: string) => {
      if (modal.type !== 'bulk') return;
      const slotIds = selectedIds.size > 0 ? Array.from(selectedIds) : [];
      const result = await bulkBlock({
        slotIds,
        isBlocked: modal.isBlocked,
        blockReason: reason || undefined,
        blockType: blockType as never,
        confirmForce: true,
      });
      if (result.success) {
        showMsg(`${result.affectedCount} slot(s) ${modal.isBlocked ? 'bloqueado(s)' : 'desbloqueado(s)'}`);
        setSelectedIds(new Set());
        closeModal();
      } else {
        showMsg(result.message || 'Error al procesar', true);
      }
    },
    [modal, selectedIds, bulkBlock, closeModal],
  );

  const handleDelete = useCallback(
    async (slotId: string) => {
      const result = await deleteSlot(slotId);
      if (result.success) { showMsg('Slot eliminado'); closeModal(); }
      else showMsg(result.message || 'Error al eliminar', true);
    },
    [deleteSlot, closeModal],
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="slot-manager">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          {/* View toggle */}
          <div className="view-toggle" role="group" aria-label="Vista">
            <button
              className={`view-btn${view === 'calendar' ? ' view-btn--active' : ''}`}
              onClick={() => setView('calendar')}
              aria-pressed={view === 'calendar'}
              title="Vista calendario"
            >
              <CalendarDays size={15} strokeWidth={2} aria-hidden="true" />
              Calendario
            </button>
            <button
              className={`view-btn${view === 'list' ? ' view-btn--active' : ''}`}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              title="Vista lista"
            >
              <List size={15} strokeWidth={2} aria-hidden="true" />
              Lista
            </button>
          </div>

          <span className="slots-count">{slots.filter((s) => s.isActive).length} activos</span>
          {selectedIds.size > 0 && (
            <span className="selection-badge">{selectedIds.size} sel.</span>
          )}
        </div>
        <div className="toolbar-right">
          {selectedIds.size > 0 && (
            <>
              <button className="btn-secondary" onClick={() => handleBulkAction(true)}>
                Bloquear sel.
              </button>
              <button className="btn-secondary" onClick={() => handleBulkAction(false)}>
                Desbloquear sel.
              </button>
            </>
          )}
          <button
            className={`btn-secondary${showPricing ? ' btn-secondary--active' : ''}`}
            onClick={() => setShowPricing((v) => !v)}
            title="Configurar precios"
          >
            <DollarSign size={14} aria-hidden="true" /> Precios
          </button>
          <button className="btn-primary" onClick={() => setModal({ type: 'create' })}>
            <Plus size={14} aria-hidden="true" /> Nuevo slot
          </button>
        </div>
      </div>

      {/* Feedback banners */}
      {actionError && <div className="banner banner--error">{actionError}</div>}
      {successMsg && <div className="banner banner--success">{successMsg}</div>}

      {/* Pricing panel — collapsible */}
      {showPricing && (
        <CourtPricingPanel slots={slots} accessToken={accessToken} />
      )}

      {/* Slot view — calendar (default) or list */}
      {view === 'calendar' ? (
        <SlotCalendarView
          slots={slots}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onEdit={(slot) => setModal({ type: 'edit', slot })}
          onBlock={handleSingleBlock}
        />
      ) : (
        <SlotListView
          slots={slots}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onEdit={(slot) => setModal({ type: 'edit', slot })}
          onBlock={handleSingleBlock}
          onDelete={handleDelete}
        />
      )}

      {/* Modals */}
      {(modal.type === 'create' || modal.type === 'edit') && (
        <SlotEditModal
          slot={modal.type === 'edit' ? modal.slot : null}
          onClose={closeModal}
          onSaveCreate={createSlot}
          onSaveUpdate={updateSlot}
          onBlock={handleSingleBlock}
          onDelete={handleDelete}
        />
      )}
      {modal.type === 'bulk' && (
        <BulkBlockDialog
          isBlocked={modal.isBlocked}
          impactPreview={modal.impactPreview}
          selectedCount={selectedIds.size}
          onConfirm={handleBulkConfirm}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="state-card">
      <p className="state-text">Cargando horarios...</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="state-card state-card--error">
      <p className="state-text">{error}</p>
      <button className="btn-secondary" onClick={onRetry}>Reintentar</button>
    </div>
  );
}
