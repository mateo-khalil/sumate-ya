/**
 * ReservationFormModal — create/edit form for a club reservation (Reservas)
 *
 * Decision Context:
 * - The booker is EITHER an app user OR manual contact data (product decision: "el club manager
 *   puede seleccionar un usuario de la app o poner datos manuales"). A segmented toggle switches
 *   between the two modes; the app mode reuses searchPlayers (same backend as team invitations).
 * - Date + time are separate inputs combined into a local "YYYY-MM-DDTHH:MM" string; the backend
 *   normalises it to UTC. Edit mode prefills both from the stored ISO reservedAt (local view).
 * - Styles are defined by ReservationManager (rm- classes) so this modal stays presentation-only;
 *   the <style> block is rendered once on the page by the manager.
 * - Submit gating: the button is disabled ONLY while `busy` (in-flight request). Field validation
 *   runs on submit and surfaces a SPECIFIC error message instead of silently greying out the
 *   button — see validate(). A silently-disabled button gave the club zero feedback about what was
 *   missing, which read as "no me deja crear la reserva aunque tengo todo pronto".
 * - New reservations pre-fill date + the next half hour (defaultDateTime) so the form opens in a
 *   ready-to-submit state; the empty <input type="time"> was the usual culprit behind the
 *   disabled button (the field looked filled but `time` was '').
 * - Previously fixed bugs: "Crear reserva" stayed disabled with no explanation when the time field
 *   was empty (no default + no validation feedback). Do NOT regress to disabling the button on
 *   `!canSubmit`; keep the explicit validate() + error banner path.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, Check, X, Search, UserRound, AlertTriangle } from 'lucide-react';
import type { ManagedCourt } from '../../graphql/operations/courts';
import type { TeamProfile } from '../../graphql/operations/teams';
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  type Reservation,
  type ReservationStatus,
} from '../../graphql/operations/reservations';

export interface ReservationFormValues {
  courtId: string;
  reservedAt: string;
  durationMin: number;
  playerId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  priceArs: number | null;
  notes: string | null;
  status?: ReservationStatus;
}

interface Props {
  reservation: Reservation | null;
  courts: ManagedCourt[];
  busy: boolean;
  searchPlayers: (term: string) => Promise<TeamProfile[]>;
  /** Precio sugerido según las reglas de precio de la cancha (base + pico). Opcional. */
  suggestPrice?: (courtId: string, reservedAtISO: string, durationMin: number) => Promise<number | null>;
  onClose: () => void;
  onSubmit: (values: ReservationFormValues) => void;
}

function isoToLocalInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// Para reservas nuevas pre-cargamos fecha de hoy y la próxima media hora (redondeo hacia arriba)
// para que el form abra listo para enviar. Antes `time` arrancaba en '' y el botón quedaba
// deshabilitado aunque el resto estuviera completo.
function defaultDateTime(): { date: string; time: string } {
  const HALF_HOUR = 30 * 60 * 1000;
  const d = new Date(Math.ceil(Date.now() / HALF_HOUR) * HALF_HOUR);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export default function ReservationFormModal({
  reservation,
  courts,
  busy,
  searchPlayers,
  suggestPrice,
  onClose,
  onSubmit,
}: Props) {
  const initial = reservation ? isoToLocalInputs(reservation.reservedAt) : defaultDateTime();

  const [courtId, setCourtId] = useState(reservation?.courtId ?? courts[0]?.id ?? '');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [durationMin, setDurationMin] = useState(reservation?.durationMin ?? 60);
  const [mode, setMode] = useState<'app' | 'manual'>(reservation?.player ? 'app' : 'manual');
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; displayName: string } | null>(
    reservation?.player ? { id: reservation.player.id, displayName: reservation.player.displayName } : null,
  );
  const [contactName, setContactName] = useState(reservation?.contactName ?? '');
  const [contactPhone, setContactPhone] = useState(reservation?.contactPhone ?? '');
  const [priceArs, setPriceArs] = useState<string>(reservation?.priceArs != null ? String(reservation.priceArs) : '');
  // priceTouched: el club editó el precio manualmente → no lo auto-sobreescribimos. En modo
  // edición arranca "touched" para respetar el precio guardado. priceAuto: el valor actual fue
  // autocompletado desde las reglas de precio (sólo para el rótulo "· automático").
  const [priceTouched, setPriceTouched] = useState<boolean>(!!reservation);
  const [priceAuto, setPriceAuto] = useState(false);
  const [notes, setNotes] = useState(reservation?.notes ?? '');
  const [status, setStatus] = useState<ReservationStatus>(reservation?.status ?? 'CONFIRMED');
  // Mensaje de validación mostrado al intentar enviar con datos faltantes (en vez de deshabilitar
  // el botón sin explicación). Se limpia en cuanto el envío es válido.
  const [formError, setFormError] = useState<string | null>(null);

  // Player search
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<TeamProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (mode !== 'app' || selectedPlayer) return;
    window.clearTimeout(debounce.current);
    if (term.trim().length < 2) { setResults([]); return; }
    debounce.current = window.setTimeout(async () => {
      setSearching(true);
      const found = await searchPlayers(term);
      setResults(found);
      setSearching(false);
    }, 280);
    return () => window.clearTimeout(debounce.current);
  }, [term, mode, selectedPlayer, searchPlayers]);

  // Auto-precio: cuando hay cancha + fecha + hora (+ duración) y el club no tocó el precio a
  // mano, consultamos las reglas de precio de la cancha y precargamos el valor sugerido.
  useEffect(() => {
    if (!suggestPrice || priceTouched) return;
    if (!courtId || !date || !time) return;
    let cancelled = false;
    (async () => {
      const suggested = await suggestPrice(courtId, `${date}T${time}`, durationMin);
      if (cancelled || suggested == null) return;
      setPriceArs(String(suggested));
      setPriceAuto(true);
    })();
    return () => { cancelled = true; };
  }, [suggestPrice, priceTouched, courtId, date, time, durationMin]);

  // Validación explícita: devuelve el primer campo faltante como mensaje accionable, o null si
  // está todo pronto. Reemplaza al viejo `canSubmit` que sólo deshabilitaba el botón en silencio.
  const validate = (): string | null => {
    if (!courtId) return 'Elegí una cancha.';
    if (!date) return 'Elegí la fecha de la reserva.';
    if (!time) return 'Ingresá la hora de la reserva.';
    if (!(durationMin > 0)) return 'La duración debe ser mayor a 0 minutos.';
    if (mode === 'app' && !selectedPlayer) return 'Buscá y elegí el jugador de la app.';
    if (mode === 'manual' && contactName.trim().length === 0) return 'Ingresá el nombre de contacto.';
    return null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError(null);
    const parsedPrice = priceArs.trim() === '' ? null : Number(priceArs);
    onSubmit({
      courtId,
      reservedAt: `${date}T${time}`,
      durationMin,
      playerId: mode === 'app' ? selectedPlayer!.id : null,
      contactName: mode === 'manual' ? contactName.trim() : null,
      contactPhone: mode === 'manual' ? (contactPhone.trim() || null) : null,
      priceArs: parsedPrice != null && Number.isFinite(parsedPrice) ? parsedPrice : null,
      notes: notes.trim() || null,
      ...(reservation ? { status } : {}),
    });
  };

  return (
    <div className="rm-overlay" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="rm-dialog rm-dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="rm-dialog-head">
          <h3 className="rm-dialog-title">{reservation ? 'Editar reserva' : 'Nueva reserva'}</h3>
          <button className="rm-icon-btn" aria-label="Cerrar" onClick={onClose} disabled={busy}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form className="rm-form" onSubmit={submit}>
          <div className="rm-row">
            <label className="rm-field">
              <span>Cancha</span>
              <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
                {courts.length === 0 && <option value="">Sin canchas</option>}
                {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="rm-field">
              <span>Duración (min)</span>
              <input type="number" min={15} max={600} step={15} value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))} />
            </label>
          </div>

          <div className="rm-row">
            <label className="rm-field">
              <span>Fecha</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="rm-field">
              <span>Hora</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>

          {/* Booker mode toggle */}
          <div className="rm-segment" role="tablist" aria-label="Tipo de reserva">
            <button type="button" role="tab" aria-selected={mode === 'app'}
              className={`rm-seg ${mode === 'app' ? 'is-active' : ''}`}
              onClick={() => setMode('app')}>
              Usuario de la app
            </button>
            <button type="button" role="tab" aria-selected={mode === 'manual'}
              className={`rm-seg ${mode === 'manual' ? 'is-active' : ''}`}
              onClick={() => setMode('manual')}>
              Datos manuales
            </button>
          </div>

          {mode === 'app' ? (
            <div className="rm-field">
              <span>Jugador</span>
              {selectedPlayer ? (
                <div className="rm-chip">
                  <UserRound size={15} aria-hidden="true" />
                  <span>{selectedPlayer.displayName}</span>
                  <button type="button" aria-label="Quitar jugador" onClick={() => { setSelectedPlayer(null); setTerm(''); }}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="rm-search">
                  <span className="rm-search-icon">
                    {searching ? <Loader2 className="rm-spin" size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
                  </span>
                  <input
                    type="text" value={term} placeholder="Buscá por nombre (mín. 2 letras)"
                    onChange={(e) => setTerm(e.target.value)}
                  />
                  {results.length > 0 && (
                    <ul className="rm-results">
                      {results.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => { setSelectedPlayer({ id: p.id, displayName: p.displayName }); setResults([]); }}>
                            <UserRound size={14} aria-hidden="true" />
                            {p.displayName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rm-row">
              <label className="rm-field">
                <span>Nombre de contacto</span>
                <input type="text" value={contactName} maxLength={120} placeholder="Ej. Juan Pérez"
                  onChange={(e) => setContactName(e.target.value)} />
              </label>
              <label className="rm-field">
                <span>Teléfono (opcional)</span>
                <input type="tel" value={contactPhone} maxLength={40} placeholder="Ej. 11 5555 5555"
                  onChange={(e) => setContactPhone(e.target.value)} />
              </label>
            </div>
          )}

          <div className="rm-row">
            <label className="rm-field">
              <span>Precio ($U){priceAuto ? ' · automático' : ' (opcional)'}</span>
              <input type="number" min={0} step={100} value={priceArs} placeholder="0"
                onChange={(e) => { setPriceTouched(true); setPriceArs(e.target.value); }} />
            </label>
            {reservation && (
              <label className="rm-field">
                <span>Estado</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as ReservationStatus)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </label>
            )}
          </div>

          <label className="rm-field">
            <span>Notas (opcional)</span>
            <textarea value={notes} maxLength={500} rows={2} placeholder="Detalles de la reserva"
              onChange={(e) => setNotes(e.target.value)} />
          </label>

          {formError && (
            <div className="rm-banner rm-banner--error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <div className="rm-dialog-actions">
            <button type="button" className="rm-btn rm-btn--ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="rm-btn rm-btn--primary" disabled={busy}>
              {busy ? <Loader2 className="rm-spin" size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              {reservation ? 'Guardar' : 'Crear reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
