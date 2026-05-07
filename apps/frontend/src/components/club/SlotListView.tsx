/**
 * SlotListView — table view of managed club slots
 *
 * Decision Context:
 * - Semantic color coding (improvement 8): available=green, hasMatch=yellow,
 *   blocked=red, inactive=gray. Applied via CSS class on the status badge.
 * - DAY_ORDER ensures consistent display order (Mon→Sun) regardless of DB order.
 * - Checkbox per row enables bulk select; onSelectAll toggles all active slots.
 * - Actions: edit opens SlotEditModal; block/unblock calls toggleSlotBlock directly
 *   (impact preview is handled by the parent SlotManager, not here).
 * - Inactive (soft-deleted) slots are shown with reduced opacity and no action buttons,
 *   preserving history visibility for admins (improvement 17).
 * - Previously fixed bugs: none relevant.
 */

import { Pencil, Lock, Unlock, Trash2 } from 'lucide-react';
import type { ManagedClubSlot, BlockSlotInput } from '../../graphql/operations/club-slots';
import { DAY_OF_WEEK_LABELS, DAY_ORDER, BLOCK_TYPE_LABELS } from '../../graphql/operations/club-slots';

interface SlotListViewProps {
  slots: ManagedClubSlot[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onEdit: (slot: ManagedClubSlot) => void;
  onBlock: (input: BlockSlotInput) => void;
  onDelete: (slotId: string) => void;
}

function getSlotStatus(slot: ManagedClubSlot): { label: string; className: string } {
  if (!slot.isActive) return { label: 'Eliminado', className: 'badge badge--inactive' };
  if (slot.isBlocked) return { label: 'Bloqueado', className: 'badge badge--blocked' };
  if (slot.hasScheduledMatch) return { label: 'Con partido', className: 'badge badge--match' };
  return { label: 'Disponible', className: 'badge badge--available' };
}

function formatTime(time: string) {
  return time.slice(0, 5);
}

export function SlotListView({
  slots,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onEdit,
  onBlock,
  onDelete,
}: SlotListViewProps) {
  const sorted = [...slots].sort((a, b) => {
    const dA = DAY_ORDER.indexOf(a.dayOfWeek);
    const dB = DAY_ORDER.indexOf(b.dayOfWeek);
    if (dA !== dB) return dA - dB;
    return a.startTime.localeCompare(b.startTime);
  });

  const activeSlots = slots.filter((s) => s.isActive);

  if (sorted.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-text">No hay slots configurados. Creá el primero con el botón "Nuevo slot".</p>
      </div>
    );
  }

  return (
    <div className="list-wrap">
      <table className="slot-table">
        <thead>
          <tr>
            <th className="col-check">
              <input
                type="checkbox"
                checked={selectedIds.size === activeSlots.length && activeSlots.length > 0}
                onChange={onSelectAll}
                aria-label="Seleccionar todos"
              />
            </th>
            <th>Día</th>
            <th>Horario</th>
            <th>Cancha</th>
            <th>Duración</th>
            <th>Precio</th>
            <th>Estado</th>
            <th>Motivo bloqueo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((slot) => {
            const status = getSlotStatus(slot);
            const isSelected = selectedIds.has(slot.id);
            return (
              <tr key={slot.id} className={`slot-row${!slot.isActive ? ' slot-row--inactive' : ''}${isSelected ? ' slot-row--selected' : ''}`}>
                <td className="col-check">
                  {slot.isActive && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(slot.id)}
                      aria-label={`Seleccionar slot ${slot.dayOfWeek} ${slot.startTime}`}
                    />
                  )}
                </td>
                <td className="col-day">{DAY_OF_WEEK_LABELS[slot.dayOfWeek] ?? slot.dayOfWeek}</td>
                <td className="col-time">{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</td>
                <td className="col-court">{slot.court.name}</td>
                <td className="col-duration">{slot.duration} min</td>
                <td className="col-price">{slot.priceArs != null ? `$U ${slot.priceArs}` : '—'}</td>
                <td><span className={status.className}>{status.label}</span></td>
                <td className="col-reason">
                  {slot.isBlocked && slot.blockReason ? (
                    <span className="block-reason" title={slot.blockReason}>
                      {slot.blockType ? BLOCK_TYPE_LABELS[slot.blockType] : ''}{slot.blockType && slot.blockReason ? ' — ' : ''}{slot.blockReason}
                    </span>
                  ) : '—'}
                </td>
                <td className="col-actions">
                  {slot.isActive && (
                    <>
                      <button className="icon-btn" onClick={() => onEdit(slot)} title="Editar">
                        <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                      {slot.isBlocked ? (
                        <button
                          className="icon-btn icon-btn--success"
                          onClick={() => onBlock({ slotId: slot.id, isBlocked: false })}
                          title="Desbloquear"
                        >
                          <Unlock size={14} strokeWidth={2} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          className="icon-btn icon-btn--warn"
                          onClick={() => onBlock({ slotId: slot.id, isBlocked: true })}
                          title="Bloquear"
                        >
                          <Lock size={14} strokeWidth={2} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        className="icon-btn icon-btn--danger"
                        onClick={() => onDelete(slot.id)}
                        title="Eliminar"
                      >
                        <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
