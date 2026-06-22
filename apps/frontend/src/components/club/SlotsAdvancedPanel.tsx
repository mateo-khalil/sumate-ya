/**
 * SlotsAdvancedPanel — power-user surface for one-off slot edits and blocks.
 *
 * Decision Context:
 * - Why split out of SlotManager: the simplified Horarios screen leads with the
 *   ScheduleConfigurator (open hours + price). The old per-slot calendar/list, bulk block
 *   flow and edit modal are still valuable for exceptions (block a single night for
 *   maintenance, add an odd slot), so they live here behind a collapsible "Vista avanzada".
 * - Presentational: this panel no longer owns the data hook. SlotManager owns useClubSlots
 *   and threads slots + mutation callbacks down, so the configurator and this panel always
 *   share one source of truth (apply a schedule → this calendar refreshes too).
 * - Pricing was removed from this toolbar: prices are set in the configurator now, so the
 *   old "Precios" panel here would be a confusing second place to edit the same thing.
 * - Slots are pre-filtered to the selected court by the parent, so the calendar is scoped.
 * - Single-slot block that hits a scheduled match routes through BulkBlockDialog carrying the
 *   one slotId (so the force-cancel targets THAT slot, not the empty multi-select set).
 * - Previously fixed bugs: single-slot force-block fell back to an empty selectedIds set and
 *   silently did nothing — fixed by threading slotId through the 'bulk' ModalState.
 */

import { useState, useCallback } from 'react';
import { Plus, List, CalendarDays } from 'lucide-react';
import { SlotListView } from './SlotListView';
import { SlotCalendarView } from './SlotCalendarView';
import { SlotEditModal } from './SlotEditModal';
import type { CourtOption } from './SlotEditModal';
import { BulkBlockDialog } from './BulkBlockDialog';
import type {
  ManagedClubSlot,
  BlockSlotInput,
  BulkBlockSlotsInput,
  CreateClubSlotInput,
  UpdateClubSlotInput,
  SlotImpactPreview,
} from '../../graphql/operations/club-slots';

type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; slot: ManagedClubSlot }
  | { type: 'bulk'; isBlocked: boolean; impactPreview: SlotImpactPreview | null; slotId?: string };

interface Props {
  slots: ManagedClubSlot[];
  courts: CourtOption[];
  accessToken: string;
  createSlot: (input: CreateClubSlotInput) => Promise<{ success: boolean; message: string }>;
  updateSlot: (input: UpdateClubSlotInput) => Promise<{ success: boolean; message: string }>;
  deleteSlot: (slotId: string) => Promise<{ success: boolean; message: string }>;
  toggleBlock: (input: BlockSlotInput) => Promise<{ success: boolean; message: string; impactPreview: SlotImpactPreview | null }>;
  bulkBlock: (input: BulkBlockSlotsInput) => Promise<{ success: boolean; message: string; affectedCount: number; impactPreview: SlotImpactPreview | null }>;
  onMessage: (msg: string, isError?: boolean) => void;
}

export function SlotsAdvancedPanel({
  slots, courts, accessToken, createSlot, updateSlot, deleteSlot, toggleBlock, bulkBlock, onMessage,
}: Props) {
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>({ type: 'none' });

  const closeModal = useCallback(() => setModal({ type: 'none' }), []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const activeIds = slots.filter((s) => s.isActive).map((s) => s.id);
    setSelectedIds((prev) => (prev.size === activeIds.length ? new Set() : new Set(activeIds)));
  }, [slots]);

  const handleSingleBlock = useCallback(
    async (input: BlockSlotInput) => {
      const result = await toggleBlock(input);
      if (result.impactPreview && !input.confirmForce) {
        setModal({ type: 'bulk', isBlocked: input.isBlocked, impactPreview: result.impactPreview, slotId: input.slotId });
      } else if (result.success) {
        onMessage(input.isBlocked ? 'Turno bloqueado' : 'Turno desbloqueado');
        closeModal();
      } else {
        onMessage(result.message || 'Error al cambiar estado del turno', true);
      }
    },
    [toggleBlock, closeModal, onMessage],
  );

  const handleBulkAction = useCallback(
    async (isBlocked: boolean) => {
      if (selectedIds.size === 0) return;
      const slotIds = Array.from(selectedIds);
      const result = await bulkBlock({ slotIds, isBlocked, confirmForce: false });
      if (result.impactPreview && result.affectedCount === 0) {
        setModal({ type: 'bulk', isBlocked, impactPreview: result.impactPreview });
      } else if (result.success) {
        onMessage(`${result.affectedCount} turno(s) procesado(s)`);
        setSelectedIds(new Set());
      } else {
        onMessage(result.message || 'Error en operación masiva', true);
      }
    },
    [selectedIds, bulkBlock, onMessage],
  );

  const handleBulkConfirm = useCallback(
    async (reason: string, blockType: string) => {
      if (modal.type !== 'bulk') return;
      const slotIds = modal.slotId ? [modal.slotId] : Array.from(selectedIds);
      const result = await bulkBlock({
        slotIds, isBlocked: modal.isBlocked,
        blockReason: reason || undefined, blockType: blockType as never, confirmForce: true,
      });
      if (result.success) {
        onMessage(`${result.affectedCount} turno(s) ${modal.isBlocked ? 'bloqueado(s)' : 'desbloqueado(s)'}`);
        setSelectedIds(new Set());
        closeModal();
      } else {
        onMessage(result.message || 'Error al procesar', true);
      }
    },
    [modal, selectedIds, bulkBlock, closeModal, onMessage],
  );

  const handleDelete = useCallback(
    async (slotId: string) => {
      const result = await deleteSlot(slotId);
      if (result.success) { onMessage('Turno eliminado'); closeModal(); }
      else onMessage(result.message || 'Error al eliminar', true);
    },
    [deleteSlot, closeModal, onMessage],
  );

  return (
    <div className="adv-panel">
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="view-toggle" role="group" aria-label="Vista">
            <button
              className={`view-btn${view === 'calendar' ? ' view-btn--active' : ''}`}
              onClick={() => setView('calendar')}
              aria-pressed={view === 'calendar'}
            >
              <CalendarDays size={15} strokeWidth={2} aria-hidden="true" /> Calendario
            </button>
            <button
              className={`view-btn${view === 'list' ? ' view-btn--active' : ''}`}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              <List size={15} strokeWidth={2} aria-hidden="true" /> Lista
            </button>
          </div>
          <span className="slots-count">{slots.filter((s) => s.isActive).length} turnos</span>
          {selectedIds.size > 0 && <span className="selection-badge">{selectedIds.size} sel.</span>}
        </div>
        <div className="toolbar-right">
          {selectedIds.size > 0 && (
            <>
              <button className="btn-secondary" onClick={() => handleBulkAction(true)}>Bloquear sel.</button>
              <button className="btn-secondary" onClick={() => handleBulkAction(false)}>Desbloquear sel.</button>
            </>
          )}
          <button className="btn-secondary" onClick={() => setModal({ type: 'create' })}>
            <Plus size={14} aria-hidden="true" /> Turno suelto
          </button>
        </div>
      </div>

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

      {(modal.type === 'create' || modal.type === 'edit') && (
        <SlotEditModal
          slot={modal.type === 'edit' ? modal.slot : null}
          courts={courts}
          accessToken={accessToken}
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
          selectedCount={modal.slotId ? 1 : selectedIds.size}
          onConfirm={handleBulkConfirm}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
