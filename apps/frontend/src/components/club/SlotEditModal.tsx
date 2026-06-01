/**
 * SlotEditModal — modal for creating, editing, and blocking a single slot
 *
 * Decision Context:
 * - Why tabs (Info/Edit/Block): separates read-only status display from write operations
 *   and block configuration. Avoids a cluttered single form.
 * - Create mode (slot=null): shows only the Edit tab with all required fields.
 * - Block tab (improvement 4): collects blockReason (textarea) and blockType (select)
 *   before calling onBlock. The parent handles impact preview / confirmForce flow.
 * - History tab (improvement 16): fetches slotAuditLog on demand when the tab is opened.
 *   Implemented via SlotHistoryTab (separate file to keep this file under the line limit).
 *   Shows chronological entries with action label, who changed it, relative date, and diff.
 * - dayOfWeek is not editable after creation (would require delete+create to avoid
 *   breaking existing bookings on that day).
 * - allowOnlineBooking toggle (improvement 15): controls player visibility.
 * - Court selector (bug fix): the original "ID de cancha" text input required the admin to
 *   manually type a UUID, which is both a security exposure and an unusable UX. Replaced
 *   with a <select> populated from courts derived from existing slots. The UUID stays as
 *   the internal value but is never shown to the user.
 * - Previously fixed bugs:
 *   - "ID de cancha" field exposed UUID to user and required manual UUID entry. Fixed by
 *     passing courts: CourtOption[] from SlotManager and rendering a named <select>.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import type { ManagedClubSlot, BlockSlotInput, CreateClubSlotInput, UpdateClubSlotInput, BlockType } from '../../graphql/operations/club-slots';
import { BLOCK_TYPE_LABELS, DAY_OF_WEEK_LABELS, DAY_ORDER } from '../../graphql/operations/club-slots';
import { SlotHistoryTab } from './SlotHistoryTab';

export interface CourtOption {
  id: string;
  name: string;
}

type Tab = 'info' | 'edit' | 'block' | 'history';

interface SlotEditModalProps {
  slot: ManagedClubSlot | null;
  courts: CourtOption[];
  accessToken: string;
  onClose: () => void;
  onSaveCreate: (input: CreateClubSlotInput) => Promise<{ success: boolean; message: string }>;
  onSaveUpdate: (input: UpdateClubSlotInput) => Promise<{ success: boolean; message: string }>;
  onBlock: (input: BlockSlotInput) => void;
  onDelete: (slotId: string) => void;
}

export function SlotEditModal({ slot, courts, accessToken, onClose, onSaveCreate, onSaveUpdate, onBlock }: SlotEditModalProps) {
  const isCreate = slot === null;
  const [tab, setTab] = useState<Tab>(isCreate ? 'edit' : 'info');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state — courtId defaults to the slot's existing court or the first available court.
  // UUID stays internal; the user only sees court names via the <select>.
  const [courtId, setCourtId] = useState(slot?.courtId ?? courts[0]?.id ?? '');
  const [dayOfWeek, setDayOfWeek] = useState(slot?.dayOfWeek ?? 'monday');
  const [startTime, setStartTime] = useState(slot?.startTime?.slice(0, 5) ?? '');
  const [endTime, setEndTime] = useState(slot?.endTime?.slice(0, 5) ?? '');
  const [duration, setDuration] = useState(String(slot?.duration ?? 60));
  const [priceArs, setPriceArs] = useState(slot?.priceArs != null ? String(slot.priceArs) : '');
  const [allowOnline, setAllowOnline] = useState(slot?.allowOnlineBooking ?? true);

  // Block form state
  const [blockReason, setBlockReason] = useState(slot?.blockReason ?? '');
  const [blockType, setBlockType] = useState(slot?.blockType ?? 'OTHER');

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      let result: { success: boolean; message: string };
      if (isCreate) {
        result = await onSaveCreate({
          courtId: courtId.trim(),
          dayOfWeek,
          startTime,
          endTime,
          duration: Number(duration),
          priceArs: priceArs ? Number(priceArs) : null,
          allowOnlineBooking: allowOnline,
        });
      } else {
        result = await onSaveUpdate({
          slotId: slot.id,
          startTime,
          endTime,
          duration: Number(duration),
          priceArs: priceArs ? Number(priceArs) : null,
          allowOnlineBooking: allowOnline,
        });
      }
      if (!result.success) setError(result.message);
    } catch {
      setError('Error inesperado al guardar');
    } finally {
      setSaving(false);
    }
  }

  function handleBlock() {
    if (!slot) return;
    onBlock({ slotId: slot.id, isBlocked: !slot.isBlocked, blockReason, blockType: blockType as never });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isCreate ? 'Nuevo Slot' : `Slot — ${slot.court.name}`}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {!isCreate && (
          <div className="tab-bar">
            {(['info', 'edit', 'block', 'history'] as Tab[]).map((t) => (
              <button
                key={t}
                className={`tab-btn${tab === t ? ' tab-btn--active' : ''}`}
                onClick={() => setTab(t)}
              >
                {{ info: 'Información', edit: 'Editar', block: 'Bloquear', history: 'Historial' }[t]}
              </button>
            ))}
          </div>
        )}

        <div className="modal-body">
          {tab === 'info' && slot && <SlotInfoTab slot={slot} />}
          {tab === 'edit' && (
            <SlotEditTab
              isCreate={isCreate}
              courts={courts}
              courtId={courtId} setCourtId={setCourtId}
              dayOfWeek={dayOfWeek} setDayOfWeek={setDayOfWeek}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime}
              duration={duration} setDuration={setDuration}
              priceArs={priceArs} setPriceArs={setPriceArs}
              allowOnline={allowOnline} setAllowOnline={setAllowOnline}
            />
          )}
          {tab === 'block' && slot && (
            <SlotBlockTab
              slot={slot}
              blockReason={blockReason} setBlockReason={setBlockReason}
              blockType={blockType} setBlockType={setBlockType}
            />
          )}
          {tab === 'history' && slot && <SlotHistoryTab slotId={slot.id} accessToken={accessToken} />}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          {tab === 'edit' && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
          {tab === 'block' && slot && (
            <button
              className={slot.isBlocked ? 'btn-primary' : 'btn-destructive'}
              onClick={handleBlock}
            >
              {slot.isBlocked ? 'Desbloquear' : 'Bloquear'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotInfoTab({ slot }: { slot: ManagedClubSlot }) {
  const rows = [
    ['Cancha', slot.court.name],
    ['Día', DAY_OF_WEEK_LABELS[slot.dayOfWeek] ?? slot.dayOfWeek],
    ['Horario', `${slot.startTime.slice(0,5)} – ${slot.endTime.slice(0,5)}`],
    ['Duración', `${slot.duration} min`],
    ['Precio', slot.priceArs != null ? `$U ${slot.priceArs}` : '—'],
    ['Reserva online', slot.allowOnlineBooking ? 'Habilitada' : 'Deshabilitada'],
    ['Estado', slot.isBlocked ? 'Bloqueado' : slot.isActive ? 'Activo' : 'Eliminado'],
  ];
  return (
    <dl className="info-list">
      {rows.map(([label, value]) => (
        <div key={label} className="info-row">
          <dt className="info-label">{label}</dt>
          <dd className="info-value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SlotEditTab(props: {
  isCreate: boolean;
  courts: CourtOption[];
  courtId: string; setCourtId: (v: string) => void;
  dayOfWeek: string; setDayOfWeek: (v: string) => void;
  startTime: string; setStartTime: (v: string) => void;
  endTime: string; setEndTime: (v: string) => void;
  duration: string; setDuration: (v: string) => void;
  priceArs: string; setPriceArs: (v: string) => void;
  allowOnline: boolean; setAllowOnline: (v: boolean) => void;
}) {
  return (
    <div className="form-grid">
      {props.isCreate && (
        <label className="form-field">
          <span className="form-label">Cancha</span>
          {props.courts.length > 0 ? (
            <select
              className="form-select"
              value={props.courtId}
              onChange={(e) => props.setCourtId(e.target.value)}
            >
              {props.courts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <p className="form-hint">No hay canchas configuradas. Creá canchas desde la sección Canchas antes de agregar horarios.</p>
          )}
        </label>
      )}
      {props.isCreate && (
        <label className="form-field">
          <span className="form-label">Día de la semana</span>
          <select className="form-select" value={props.dayOfWeek} onChange={(e) => props.setDayOfWeek(e.target.value)}>
            {DAY_ORDER.map((d) => <option key={d} value={d}>{DAY_OF_WEEK_LABELS[d]}</option>)}
          </select>
        </label>
      )}
      <label className="form-field">
        <span className="form-label">Hora inicio (HH:mm)</span>
        <input className="form-input" type="time" value={props.startTime} onChange={(e) => props.setStartTime(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="form-label">Hora fin (HH:mm)</span>
        <input className="form-input" type="time" value={props.endTime} onChange={(e) => props.setEndTime(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="form-label">Duración (min)</span>
        <input className="form-input" type="number" min="30" max="240" value={props.duration} onChange={(e) => props.setDuration(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="form-label">Precio ($U)</span>
        <input className="form-input" type="number" min="0" max="999999" value={props.priceArs} onChange={(e) => props.setPriceArs(e.target.value)} placeholder="Opcional" />
      </label>
      <label className="form-field form-field--toggle">
        <span className="form-label">Reserva online habilitada</span>
        <input type="checkbox" checked={props.allowOnline} onChange={(e) => props.setAllowOnline(e.target.checked)} />
      </label>
    </div>
  );
}

function SlotBlockTab(props: {
  slot: ManagedClubSlot;
  blockReason: string; setBlockReason: (v: string) => void;
  blockType: string; setBlockType: (v: BlockType) => void;
}) {
  return (
    <div className="form-grid">
      <div className="block-current-state">
        Estado actual: <strong>{props.slot.isBlocked ? 'Bloqueado' : 'Disponible'}</strong>
        {props.slot.isBlocked && props.slot.blockReason && <span> — {props.slot.blockReason}</span>}
      </div>
      <label className="form-field">
        <span className="form-label">Tipo de bloqueo</span>
        <select className="form-select" value={props.blockType} onChange={(e) => props.setBlockType(e.target.value as BlockType)}>
          {(Object.entries(BLOCK_TYPE_LABELS) as [BlockType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="form-field">
        <span className="form-label">Motivo (máx. 500 caracteres)</span>
        <textarea
          className="form-textarea"
          rows={3}
          maxLength={500}
          value={props.blockReason}
          onChange={(e) => props.setBlockReason(e.target.value)}
          placeholder="Motivo opcional visible para jugadores"
        />
      </label>
    </div>
  );
}
