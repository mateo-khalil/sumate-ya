/**
 * ClubScheduleView — weekly calendar grid for club slot/match visualization
 *
 * Decision Context:
 * - Why weekly grid: 7-column × N-row layout lets the admin see all courts' slots
 *   across the week at a glance. Columns = days of the week within the filter range,
 *   rows = unique slots grouped by court.
 * - Slot status colors match horarios.astro palette (same CSS var names, same palette):
 *   green (available), yellow (open/full), blue (in_progress), gray (completed/past),
 *   red (blocked), dark gray (inactive).
 * - Click on a slot with a match calls onMatchClick to open the detail modal.
 * - No drag-select: that complexity is in Phase 2 (quick-block from calendar).
 * - Capacity bar: simple width-based bar, color from occupancy level.
 * - Previously fixed bugs: none relevant (new feature).
 */

import { Lock, Activity, CheckCircle, X } from 'lucide-react';
import type { ScheduleSlot, DashboardMatch } from '../../graphql/operations/club-dashboard';
import { SLOT_STATUS_LABELS } from '../../graphql/operations/club-dashboard';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Lun', tuesday: 'Mar', wednesday: 'Mié',
  thursday: 'Jue', friday: 'Vie', saturday: 'Sáb', sunday: 'Dom',
};

interface Props {
  slots: ScheduleSlot[];
  onMatchClick: (match: DashboardMatch) => void;
}

function statusCssClass(s: ScheduleSlot['status']): string {
  const map: Record<string, string> = {
    AVAILABLE: 'slot-avail',
    MATCH_OPEN: 'slot-open',
    MATCH_FULL: 'slot-full',
    MATCH_IN_PROGRESS: 'slot-inprog',
    MATCH_COMPLETED: 'slot-compl',
    BLOCKED: 'slot-blocked',
    INACTIVE: 'slot-inactive',
    PAST: 'slot-past',
  };
  return map[s] ?? 'slot-avail';
}

function CapacityBar({ count, capacity }: { count: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, (count / capacity) * 100) : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f6a400' : '#22c55e';
  return (
    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ flex: 1, height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
      </div>
      <span style={{ fontSize: '0.65rem', color: 'hsl(215 20% 55%)', fontFamily: 'Barlow Condensed,sans-serif' }}>
        {count}/{capacity}
      </span>
    </div>
  );
}

function SlotCell({ slot, onMatchClick }: { slot: ScheduleSlot; onMatchClick: Props['onMatchClick'] }) {
  const cssClass = statusCssClass(slot.status);
  const hasMatch = !!slot.match;
  const label = SLOT_STATUS_LABELS[slot.status];

  return (
    <div
      className={`slot-cell ${cssClass} ${hasMatch ? 'slot-clickable' : ''}`}
      role={hasMatch ? 'button' : undefined}
      tabIndex={hasMatch ? 0 : undefined}
      aria-label={hasMatch ? `Ver partido de ${slot.courtName} a las ${slot.startTime}` : undefined}
      onClick={hasMatch ? () => onMatchClick(slot.match!) : undefined}
      onKeyDown={hasMatch ? (e) => e.key === 'Enter' && onMatchClick(slot.match!) : undefined}
    >
      <div className="slot-time">{slot.startTime} – {slot.endTime}</div>

      {slot.status === 'BLOCKED' && (
        <div className="slot-blocked-info">
          <Lock size={10} strokeWidth={2} aria-hidden="true" />
          <span>{slot.blockReason ? slot.blockReason.slice(0, 20) : 'Bloqueado'}</span>
        </div>
      )}

      {slot.status === 'MATCH_IN_PROGRESS' && (
        <div className="slot-badge-inprog">
          <Activity size={9} strokeWidth={2} aria-hidden="true" />
          <span>En curso</span>
        </div>
      )}

      {slot.status === 'MATCH_COMPLETED' && (
        <div className="slot-badge-compl">
          <CheckCircle size={9} strokeWidth={2} aria-hidden="true" />
          <span>Finalizado</span>
        </div>
      )}

      {slot.status === 'MATCH_IN_PROGRESS' || slot.status === 'MATCH_OPEN' || slot.status === 'MATCH_FULL' ? (
        slot.match && (
          <>
            <div className="slot-organizer">{slot.match.organizer.displayName}</div>
            <CapacityBar count={slot.match.participantCount} capacity={slot.match.capacity} />
            <div className="slot-time-status">{slot.match.timeStatusLabel}</div>
          </>
        )
      ) : null}

      {!hasMatch && slot.status === 'AVAILABLE' && (
        <div className="slot-empty-label">{label}</div>
      )}

      <style>{`
        .slot-cell {
          border-radius: 6px; padding: 6px 8px; font-size: 0.72rem;
          font-family: 'Barlow', sans-serif; border: 1px solid transparent;
          cursor: default; user-select: none; transition: opacity 0.12s;
        }
        .slot-clickable { cursor: pointer; }
        .slot-clickable:hover { opacity: 0.85; }
        .slot-avail   { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.25); color: hsl(142 70% 65%); }
        .slot-open    { background: rgba(246,164,0,0.12); border-color: rgba(246,164,0,0.28); color: hsl(42 100% 65%); }
        .slot-full    { background: rgba(246,120,0,0.14); border-color: rgba(246,120,0,0.3); color: hsl(30 100% 65%); }
        .slot-inprog  { background: rgba(59,130,246,0.14); border-color: rgba(59,130,246,0.3); color: hsl(216 85% 70%); }
        .slot-compl   { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); color: hsl(215 20% 45%); }
        .slot-blocked { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.25); color: hsl(0 72% 65%); }
        .slot-inactive,.slot-past { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.06); color: hsl(215 20% 35%); }
        .slot-time { font-weight: 600; margin-bottom: 2px; }
        .slot-organizer { font-size: 0.7rem; opacity: 0.9; }
        .slot-time-status { font-size: 0.65rem; margin-top: 3px; opacity: 0.75; }
        .slot-empty-label { font-size: 0.68rem; opacity: 0.6; }
        .slot-blocked-info,.slot-badge-inprog,.slot-badge-compl {
          display: flex; align-items: center; gap: 3px; font-size: 0.67rem; margin-top: 2px;
        }
      `}</style>
    </div>
  );
}

export default function ClubScheduleView({ slots, onMatchClick }: Props) {
  // Group slots by court
  const courtSlots = new Map<string, { name: string; slots: ScheduleSlot[] }>();
  for (const s of slots) {
    if (!courtSlots.has(s.courtId)) {
      courtSlots.set(s.courtId, { name: s.courtName, slots: [] });
    }
    courtSlots.get(s.courtId)!.slots.push(s);
  }

  // Determine which days appear in the data
  const daysPresent = [...new Set(slots.map((s) => s.dayOfWeek))];
  const orderedDays = DAY_ORDER.filter((d) => daysPresent.includes(d));
  if (!orderedDays.length) {
    return (
      <div className="empty-schedule">
        <X size={28} strokeWidth={1.5} aria-hidden="true" />
        <p>No hay slots para el rango seleccionado</p>
        <style>{`.empty-schedule{display:flex;flex-direction:column;align-items:center;gap:.75rem;padding:3rem 0;color:hsl(215 20% 40%);font-family:'Barlow',sans-serif;}`}</style>
      </div>
    );
  }

  return (
    <div className="schedule-wrap">
      <div className="schedule-grid" style={{ gridTemplateColumns: `140px repeat(${orderedDays.length}, 1fr)` }}>
        {/* Header row */}
        <div className="grid-corner" />
        {orderedDays.map((d) => (
          <div key={d} className="day-header">{DAY_LABELS[d] ?? d}</div>
        ))}

        {/* Court rows */}
        {[...courtSlots.values()].map((court) => (
          <>
            <div key={`label-${court.name}`} className="court-label">{court.name}</div>
            {orderedDays.map((d) => {
              const daySlots = court.slots.filter((s) => s.dayOfWeek === d);
              return (
                <div key={`${court.name}-${d}`} className="day-col">
                  {daySlots.length ? (
                    daySlots.map((slot) => (
                      <SlotCell key={slot.slotId} slot={slot} onMatchClick={onMatchClick} />
                    ))
                  ) : (
                    <div className="no-slot-cell" />
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>

      <style>{`
        .schedule-wrap { overflow-x: auto; }
        .schedule-grid { display: grid; gap: 6px; min-width: 600px; }
        .grid-corner { }
        .day-header {
          text-align: center; font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em;
          color: hsl(215 20% 50%); text-transform: uppercase; padding: 4px 0;
        }
        .court-label {
          font-family: 'Barlow Condensed', sans-serif; font-size: 0.8rem;
          font-weight: 700; letter-spacing: 0.06em; color: hsl(42 100% 60%);
          text-transform: uppercase; padding: 4px 0; display: flex;
          align-items: flex-start; padding-right: 8px;
        }
        .day-col { display: flex; flex-direction: column; gap: 4px; }
        .no-slot-cell {
          height: 36px; border-radius: 6px;
          background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  );
}
