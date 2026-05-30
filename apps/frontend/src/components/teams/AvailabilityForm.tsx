/**
 * AvailabilityForm — permite al jugador configurar su disponibilidad horaria en el equipo.
 *
 * Decision Context:
 * - Carga la disponibilidad actual via MY_TEAM_AVAILABILITY al montar.
 * - El modelo de datos es reemplazante: SET_MY_AVAILABILITY borra todos los slots
 *   previos e inserta los nuevos, de modo que el form siempre refleja el estado real.
 * - Se usa selección de día + hora inicio + hora fin (no grilla de celdas) por simplicidad
 *   en mobile y porque los rangos son más expresivos que franjas fijas de 1h.
 * - La validación de solapamiento está en el backend; el frontend solo evita start >= end.
 * - Previously fixed bugs: none relevant.
 */

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Loader2, Clock } from 'lucide-react';
import type { PlayerAvailabilitySlotData } from '../../graphql/operations/teams';
import { MY_TEAM_AVAILABILITY, SET_MY_AVAILABILITY } from '../../graphql/operations/teams';

interface Props {
  teamId: string;
}

interface Slot { dayOfWeek: number; startTime: string; endTime: string }

const DAYS = [
  { v: 1, label: 'Lunes'     }, { v: 2, label: 'Martes'    },
  { v: 3, label: 'Miércoles' }, { v: 4, label: 'Jueves'    },
  { v: 5, label: 'Viernes'   }, { v: 6, label: 'Sábado'    },
  { v: 0, label: 'Domingo'   },
];

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

async function gqlAuthPost<T>(query: string, variables?: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch('/api/graphql-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json() as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) return { error: json.errors[0].message };
    return { data: json.data };
  } catch {
    return { error: 'Error de red' };
  }
}

function defaultSlot(): Slot { return { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }; }

export function AvailabilityForm({ teamId }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    gqlAuthPost<{ myTeamAvailability: PlayerAvailabilitySlotData[] }>(
      MY_TEAM_AVAILABILITY, { teamId }
    ).then(({ data }) => {
      if (data?.myTeamAvailability) {
        setSlots(data.myTeamAvailability.map(s => ({
          dayOfWeek: s.dayOfWeek, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5),
        })));
      }
      setLoading(false);
    });
  }, [teamId]);

  function addSlot() { setSlots(prev => [...prev, defaultSlot()]); }
  function removeSlot(i: number) { setSlots(prev => prev.filter((_, idx) => idx !== i)); }

  function updateSlot(i: number, field: keyof Slot, value: string | number) {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);

    // Validación client-side básica
    for (const s of slots) {
      if (s.startTime >= s.endTime) {
        setMsg({ ok: false, text: 'La hora de inicio debe ser anterior a la hora de fin' });
        setSaving(false);
        return;
      }
    }

    const { data, error } = await gqlAuthPost<{ setMyAvailability: { success: boolean; message: string } }>(
      SET_MY_AVAILABILITY,
      { input: { teamId, slots } },
    );

    if (error || !data?.setMyAvailability.success) {
      setMsg({ ok: false, text: error ?? data?.setMyAvailability.message ?? 'Error al guardar' });
    } else {
      setMsg({ ok: true, text: 'Disponibilidad guardada correctamente' });
    }
    setSaving(false);
  }

  const DAY_LABEL: Record<number, string> = Object.fromEntries(DAYS.map(d => [d.v, d.label]));

  if (loading) {
    return (
      <div className="avail-loading">
        <Loader2 size={20} strokeWidth={2} aria-hidden="true" className="spin" />
        <span>Cargando disponibilidad...</span>
        <style>{`.avail-loading{display:flex;align-items:center;gap:.6rem;color:var(--color-muted-foreground);padding:2rem 0}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div className="avail-form">
      <div className="form-header">
        <div className="form-title">
          <Clock size={16} strokeWidth={2} aria-hidden="true" />
          <span>Mi disponibilidad semanal</span>
        </div>
        <p className="form-hint">Indicá cuándo podés entrenar o jugar. El capitán verá la disponibilidad de todo el equipo.</p>
      </div>

      {slots.length === 0 && (
        <p className="empty-hint">No configuraste ningún horario todavía.</p>
      )}

      <div className="slots-list">
        {slots.map((slot, i) => (
          <div key={i} className="slot-row">
            <select
              className="slot-select slot-day"
              value={slot.dayOfWeek}
              onChange={e => updateSlot(i, 'dayOfWeek', Number(e.target.value))}
              aria-label="Día"
            >
              {DAYS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>

            <select
              className="slot-select slot-time"
              value={slot.startTime}
              onChange={e => updateSlot(i, 'startTime', e.target.value)}
              aria-label="Hora inicio"
            >
              {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>

            <span className="slot-sep">→</span>

            <select
              className="slot-select slot-time"
              value={slot.endTime}
              onChange={e => updateSlot(i, 'endTime', e.target.value)}
              aria-label="Hora fin"
            >
              {HOURS.filter(h => h > slot.startTime).map(h => <option key={h} value={h}>{h}</option>)}
            </select>

            <button className="remove-slot-btn" onClick={() => removeSlot(i)} aria-label={`Eliminar ${DAY_LABEL[slot.dayOfWeek]}`}>
              <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <button className="add-slot-btn" onClick={addSlot}>
        <Plus size={15} strokeWidth={2.5} aria-hidden="true" /> Agregar horario
      </button>

      {msg && (
        <div className={`save-msg ${msg.ok ? 'save-msg--ok' : 'save-msg--err'}`} role="alert">{msg.text}</div>
      )}

      <button className="save-btn" onClick={handleSave} disabled={saving}>
        {saving
          ? <><Loader2 size={15} strokeWidth={2} aria-hidden="true" className="spin" /> Guardando...</>
          : <><Save size={15} strokeWidth={2} aria-hidden="true" /> Guardar disponibilidad</>
        }
      </button>

      <style>{`
        .avail-form { display: flex; flex-direction: column; gap: 1rem; max-width: 540px; }
        .form-header { display: flex; flex-direction: column; gap: 0.3rem; }
        .form-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; font-weight: 600; }
        .form-hint { font-size: 0.8rem; color: var(--color-muted-foreground); margin: 0; }
        .empty-hint { font-size: 0.85rem; color: var(--color-muted-foreground); }
        .slots-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .slot-row {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
          background: var(--color-card); border: 1px solid var(--color-border);
          border-radius: 8px; padding: 0.6rem 0.75rem;
        }
        .slot-select {
          background: var(--color-input); border: 1px solid var(--color-border);
          color: var(--color-foreground); border-radius: 6px; padding: 0.35rem 0.5rem;
          font-size: 0.85rem; outline: none; cursor: pointer;
        }
        .slot-select:focus { border-color: var(--color-primary); }
        .slot-day { flex: 1; min-width: 110px; }
        .slot-time { width: 80px; }
        .slot-sep { color: var(--color-muted-foreground); font-size: 0.85rem; }
        .remove-slot-btn {
          width: 28px; height: 28px; border-radius: 6px; border: none; margin-left: auto;
          background: hsl(0 50% 18%); color: hsl(0 70% 55%); cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .add-slot-btn {
          display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem;
          background: var(--color-muted); color: var(--color-foreground);
          border: 1px solid var(--color-border); border-radius: 8px;
          font-size: 0.85rem; font-weight: 500; cursor: pointer; width: fit-content;
          transition: border-color 0.15s;
        }
        .add-slot-btn:hover { border-color: var(--color-primary); }
        .save-msg { padding: 0.6rem 0.8rem; border-radius: 8px; font-size: 0.85rem; }
        .save-msg--ok { background: hsl(140 60% 12%); color: hsl(140 70% 55%); }
        .save-msg--err { background: hsl(0 60% 15%); color: hsl(0 80% 65%); }
        .save-btn {
          display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.1rem;
          background: var(--color-primary); color: hsl(0 0% 5%);
          border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600;
          cursor: pointer; width: fit-content; transition: opacity 0.15s;
        }
        .save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
