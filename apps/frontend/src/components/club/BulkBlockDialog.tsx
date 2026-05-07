/**
 * BulkBlockDialog — confirmation dialog for bulk block/unblock with impact preview
 *
 * Decision Context:
 * - Why: destructive operations (cancelling matches) need an explicit confirmation step.
 *   The impact preview (improvement 11) surfaces the blast radius before committing.
 * - When matchesAffected > 0 and confirmForce was not set, the parent SlotManager
 *   passes the impact preview here. The admin must check a confirmation checkbox
 *   before "Bloquear y cancelar matches" is enabled.
 * - Used for both single-slot (from SlotEditModal block tab) and bulk operations
 *   (toolbar bulk block). The selectedCount prop shows context.
 * - BlockReason and blockType are collected here for the confirmForce path because the
 *   first toggleSlotBlock call (without confirmForce) did not apply them yet.
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import type { SlotImpactPreview } from '../../graphql/operations/club-slots';
import { BLOCK_TYPE_LABELS } from '../../graphql/operations/club-slots';

interface BulkBlockDialogProps {
  isBlocked: boolean;
  impactPreview: SlotImpactPreview | null;
  selectedCount: number;
  onConfirm: (reason: string, blockType: string) => Promise<void>;
  onClose: () => void;
}

export function BulkBlockDialog({
  isBlocked,
  impactPreview,
  selectedCount,
  onConfirm,
  onClose,
}: BulkBlockDialogProps) {
  const [reason, setReason] = useState('');
  const [blockType, setBlockType] = useState('ADMIN');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasMatches = (impactPreview?.matchesAffected ?? 0) > 0;
  const canSubmit = !hasMatches || confirmed;

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm(reason, blockType);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {isBlocked ? 'Bloquear slots' : 'Desbloquear slots'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          {/* Summary */}
          <div className="impact-summary">
            <div className="impact-row">
              <span className="impact-label">Slots seleccionados</span>
              <span className="impact-value">{selectedCount}</span>
            </div>
            {impactPreview && (
              <>
                <div className="impact-row">
                  <span className="impact-label">Partidos afectados</span>
                  <span className={`impact-value${impactPreview.matchesAffected > 0 ? ' impact-value--warn' : ''}`}>
                    {impactPreview.matchesAffected}
                  </span>
                </div>
                <div className="impact-row">
                  <span className="impact-label">Jugadores a notificar</span>
                  <span className="impact-value">{impactPreview.playersToNotify}</span>
                </div>
              </>
            )}
          </div>

          {/* Match list */}
          {impactPreview && impactPreview.matchDetails.length > 0 && (
            <div className="match-list">
              <p className="match-list-title">Partidos que se cancelarán:</p>
              {impactPreview.matchDetails.map((m) => (
                <div key={m.matchId} className="match-item">
                  <span className="match-title">{m.title}</span>
                  <span className="match-meta">{new Date(m.scheduledAt).toLocaleDateString('es-AR')} — {m.participantCount} jugador(es)</span>
                </div>
              ))}
            </div>
          )}

          {/* Warning banner */}
          {hasMatches && isBlocked && (
            <div className="warning-banner">
              <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
              <span>Esta acción cancelará matches con jugadores anotados.</span>
            </div>
          )}

          {/* Block reason and type (only when blocking) */}
          {isBlocked && (
            <>
              <label className="form-field">
                <span className="form-label">Tipo de bloqueo</span>
                <select className="form-select" value={blockType} onChange={(e) => setBlockType(e.target.value)}>
                  {Object.entries(BLOCK_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">Motivo (opcional)</span>
                <textarea
                  className="form-textarea"
                  rows={2}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo visible para jugadores"
                />
              </label>
            </>
          )}

          {/* Confirmation checkbox (only when matches would be cancelled) */}
          {hasMatches && isBlocked && (
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>Confirmo que se cancelarán los partidos y se notificará a los jugadores</span>
            </label>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            className={isBlocked && hasMatches ? 'btn-destructive' : 'btn-primary'}
            onClick={handleConfirm}
            disabled={!canSubmit || saving}
          >
            {saving ? 'Procesando...' : isBlocked ? (hasMatches ? 'Cancelar matches y bloquear' : 'Bloquear') : 'Desbloquear'}
          </button>
        </div>
      </div>
    </div>
  );
}
