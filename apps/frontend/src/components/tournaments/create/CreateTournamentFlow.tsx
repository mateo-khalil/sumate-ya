/**
 * CreateTournamentFlow - single-page tournament creation form.
 *
 * Decision Context:
 * - Tournament creation is denser than match creation because the organizer must reserve
 *   every fixture slot needed by the round-robin. A single screen keeps the arithmetic
 *   visible while still behaving like a focused operational tool.
 * - Club and slot data reuse the existing public GraphQL operations from matches.ts.
 * - Submit goes through /api/graphql-auth so the HttpOnly auth cookie is forwarded.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarPlus,
  Check,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import {
  GET_CLUB_SLOTS,
  type ClubDetail,
  type ClubSlot,
  type MatchFormat,
} from '../../../graphql/operations/matches';
import {
  CREATE_TOURNAMENT,
  type CreateTournamentResult,
} from '../../../graphql/operations/tournaments';

interface Props {
  initialClubs: ClubDetail[];
  accessToken: string;
  userName: string;
  userRole: 'player' | 'club_admin';
}

interface SelectedFixtureSlot {
  slotId: string;
  date: string;
  courtId: string;
  courtName: string;
  startTime: string;
  endTime: string;
}

const FORMAT_LABEL: Record<MatchFormat, string> = {
  FIVE_VS_FIVE: '5v5',
  SEVEN_VS_SEVEN: '7v7',
  TEN_VS_TEN: '10v10',
  ELEVEN_VS_ELEVEN: '11v11',
};

const FORMAT_PLAYERS: Record<MatchFormat, number> = {
  FIVE_VS_FIVE: 5,
  SEVEN_VS_SEVEN: 7,
  TEN_VS_TEN: 10,
  ELEVEN_VS_ELEVEN: 11,
};

const ALL_FORMATS = Object.keys(FORMAT_LABEL) as MatchFormat[];

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundRobinShape(teamCount: number) {
  const matchesPerRound = Math.floor(teamCount / 2);
  const rounds = teamCount % 2 === 0 ? teamCount - 1 : teamCount;
  return {
    rounds,
    matchesPerRound,
    requiredMatches: rounds * matchesPerRound,
  };
}

function formatDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function sortSlots(slots: SelectedFixtureSlot[]) {
  return [...slots].sort((a, b) =>
    `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
  );
}

const today = toLocalDateString(new Date());

export default function CreateTournamentFlow({
  initialClubs,
  accessToken,
  userName,
  userRole,
}: Props) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<MatchFormat>('SEVEN_VS_SEVEN');
  const [teamCount, setTeamCount] = useState(4);
  const [playersPerTeam, setPlayersPerTeam] = useState(8);
  const [clubId, setClubId] = useState(initialClubs[0]?.id ?? '');
  const [description, setDescription] = useState('');

  const [slotDate, setSlotDate] = useState(today);
  const [availableSlots, setAvailableSlots] = useState<ClubSlot[]>([]);
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<SelectedFixtureSlot[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateTournamentResult | null>(null);

  const selectedClub = initialClubs.find((club) => club.id === clubId) ?? null;
  const shape = useMemo(() => roundRobinShape(teamCount), [teamCount]);
  const sortedSelected = useMemo(() => sortSlots(selectedSlots), [selectedSlots]);
  const remainingSlots = Math.max(0, shape.requiredMatches - selectedSlots.length);
  const completion = Math.min(100, Math.round((selectedSlots.length / shape.requiredMatches) * 100));

  useEffect(() => {
    setSelectedSlots((prev) => sortSlots(prev).slice(0, shape.requiredMatches));
  }, [shape.requiredMatches]);

  useEffect(() => {
    if (!clubId) {
      setAvailableSlots([]);
      return;
    }

    setSlotLoading(true);
    setSlotError(null);

    fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: GET_CLUB_SLOTS,
        variables: { clubId, date: slotDate },
      }),
    })
      .then((response) => response.json())
      .then((payload: { data?: { clubSlots: ClubSlot[] }; errors?: Array<{ message: string }> }) => {
        if (payload.errors?.length) {
          setSlotError(payload.errors[0].message);
          setAvailableSlots([]);
          return;
        }
        setAvailableSlots(payload.data?.clubSlots ?? []);
      })
      .catch(() => {
        setSlotError('No se pudieron cargar los horarios');
        setAvailableSlots([]);
      })
      .finally(() => setSlotLoading(false));
  }, [clubId, slotDate]);

  function handleFormatChange(nextFormat: MatchFormat) {
    setFormat(nextFormat);
    setPlayersPerTeam((current) => Math.max(current, FORMAT_PLAYERS[nextFormat]));
  }

  function handleClubChange(nextClubId: string) {
    setClubId(nextClubId);
    setSelectedSlots([]);
  }

  function addSlot(slot: ClubSlot) {
    if (selectedSlots.length >= shape.requiredMatches) return;

    const alreadySelected = selectedSlots.some(
      (selected) => selected.slotId === slot.id && selected.date === slotDate,
    );
    if (alreadySelected) return;

    setSelectedSlots((prev) =>
      sortSlots([
        ...prev,
        {
          slotId: slot.id,
          date: slotDate,
          courtId: slot.court.id,
          courtName: slot.court.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
        },
      ]),
    );
  }

  function removeSlot(slotId: string, date: string) {
    setSelectedSlots((prev) =>
      prev.filter((selected) => !(selected.slotId === slotId && selected.date === date)),
    );
  }

  const rounds = useMemo(() => {
    const groups: SelectedFixtureSlot[][] = [];
    for (let i = 0; i < shape.rounds; i++) {
      groups.push(
        sortedSelected.slice(i * shape.matchesPerRound, (i + 1) * shape.matchesPerRound),
      );
    }
    return groups;
  }, [shape.matchesPerRound, shape.rounds, sortedSelected]);

  const canSubmit =
    name.trim().length >= 3 &&
    !!clubId &&
    teamCount >= 2 &&
    playersPerTeam >= 1 &&
    selectedSlots.length === shape.requiredMatches &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/graphql-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          query: CREATE_TOURNAMENT,
          variables: {
            input: {
              clubId,
              name: name.trim(),
              format,
              teamCount,
              playersPerTeam,
              description: description.trim() || null,
              schedule: sortedSelected.map((slot) => ({ slotId: slot.slotId, date: slot.date })),
            },
          },
        }),
      });

      const payload = (await response.json()) as {
        data?: { createTournament?: CreateTournamentResult };
        errors?: Array<{ message: string }>;
      };

      if (payload.errors?.length) {
        throw new Error(payload.errors[0].message);
      }

      const result = payload.data?.createTournament;
      if (!result) throw new Error('Respuesta inesperada del servidor');
      if (!result.success) {
        throw new Error(result.message ?? 'No se pudo crear el torneo');
      }

      setCreated(result);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Error al crear el torneo');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setName('');
    setDescription('');
    setSelectedSlots([]);
    setCreated(null);
    setSubmitError(null);
  }

  if (created?.success) {
    return (
      <section className="tournament-shell">
        <div className="success-panel">
          <div className="success-mark">
            <Check size={30} strokeWidth={2.5} aria-hidden="true" />
          </div>
          <p className="eyebrow">TORNEO CREADO</p>
          <h2>{created.tournament?.name ?? 'Torneo'}</h2>
          <p className="success-copy">
            Se reservaron {created.tournament?.fixtureMatches.length ?? shape.requiredMatches} partidos del fixture.
          </p>
          <div className="success-actions">
            <button type="button" className="btn-primary" onClick={resetForm}>
              Crear otro torneo
            </button>
            <a className="btn-secondary" href={userRole === 'club_admin' ? '/panel-club/dashboard' : '/partidos'}>
              Volver
            </a>
          </div>
        </div>
        <style>{styles}</style>
      </section>
    );
  }

  return (
    <section className="tournament-shell">
      <div className="tournament-main">
        <div className="form-surface">
          <div className="surface-heading">
            <div>
              <p className="eyebrow">ORGANIZADOR</p>
              <h2>Nuevo torneo</h2>
            </div>
            <span className="organizer-pill">{userName}</span>
          </div>

          <div className="field-grid">
            <label className="field field-wide">
              <span>Nombre</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                placeholder="Copa nocturna"
              />
            </label>

            <label className="field field-wide">
              <span>Club</span>
              <select value={clubId} onChange={(event) => handleClubChange(event.target.value)}>
                {initialClubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="field field-wide">
              <span>Formato</span>
              <div className="format-row">
                {ALL_FORMATS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`format-chip${format === value ? ' format-chip--active' : ''}`}
                    onClick={() => handleFormatChange(value)}
                  >
                    {FORMAT_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span>Equipos</span>
              <input
                type="number"
                min={2}
                max={8}
                value={teamCount}
                onChange={(event) => setTeamCount(Math.max(2, Math.min(8, Number(event.target.value))))}
              />
            </label>

            <label className="field">
              <span>Jugadores por equipo</span>
              <input
                type="number"
                min={1}
                max={30}
                value={playersPerTeam}
                onChange={(event) => setPlayersPerTeam(Math.max(1, Math.min(30, Number(event.target.value))))}
              />
            </label>

            <label className="field field-wide">
              <span>Descripción</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={700}
                rows={3}
                placeholder="Premios, categoría, detalles de inscripción..."
              />
            </label>
          </div>

          <div className="metrics-row">
            <div className="metric">
              <Trophy size={17} strokeWidth={2} aria-hidden="true" />
              <strong>{shape.rounds}</strong>
              <span>jornadas</span>
            </div>
            <div className="metric">
              <Users size={17} strokeWidth={2} aria-hidden="true" />
              <strong>{shape.requiredMatches}</strong>
              <span>partidos</span>
            </div>
            <div className="metric">
              <Clock size={17} strokeWidth={2} aria-hidden="true" />
              <strong>{remainingSlots}</strong>
              <span>horarios faltan</span>
            </div>
          </div>
        </div>

        <div className="form-surface">
          <div className="surface-heading">
            <div>
              <p className="eyebrow">FIXTURE</p>
              <h2>Horarios</h2>
            </div>
            <span className="count-pill">{selectedSlots.length}/{shape.requiredMatches}</span>
          </div>

          <div className="slot-toolbar">
            <label className="field compact-date">
              <span>Fecha</span>
              <input
                type="date"
                value={slotDate}
                min={today}
                onChange={(event) => setSlotDate(event.target.value)}
              />
            </label>
            {selectedClub && (
              <div className="club-chip">
                <MapPin size={14} strokeWidth={2} aria-hidden="true" />
                {selectedClub.name}
              </div>
            )}
          </div>

          {slotLoading && (
            <div className="inline-state">
              <Loader2 className="spin" size={18} strokeWidth={2} aria-hidden="true" />
              Cargando horarios...
            </div>
          )}
          {slotError && (
            <div className="inline-state error" role="alert">
              <AlertCircle size={18} strokeWidth={2} aria-hidden="true" />
              {slotError}
            </div>
          )}
          {!slotLoading && !slotError && availableSlots.length === 0 && (
            <div className="inline-state">No hay horarios disponibles para esta fecha.</div>
          )}

          <div className="slot-grid">
            {availableSlots.map((slot) => {
              const selected = selectedSlots.some((item) => item.slotId === slot.id && item.date === slotDate);
              const full = selectedSlots.length >= shape.requiredMatches && !selected;
              return (
                <button
                  type="button"
                  key={slot.id}
                  className={`slot-option${selected ? ' slot-option--selected' : ''}`}
                  disabled={full}
                  onClick={() => addSlot(slot)}
                >
                  <span className="slot-time">{slot.startTime.slice(0, 5)}-{slot.endTime.slice(0, 5)}</span>
                  <span className="slot-court">{slot.court.name}</span>
                  <span className="slot-format">hasta {FORMAT_LABEL[slot.court.maxFormat]}</span>
                  {selected && <Check size={16} strokeWidth={2.5} aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="progress-wrap" aria-hidden="true">
            <div style={{ width: `${completion}%` }} />
          </div>

          <div className="rounds-list">
            {rounds.map((roundSlots, index) => (
              <div className="round-row" key={index}>
                <div className="round-title">Jornada {index + 1}</div>
                <div className="round-slots">
                  {roundSlots.length === 0 && <span className="empty-slot">Sin horarios</span>}
                  {roundSlots.map((slot) => (
                    <span className="selected-slot" key={`${slot.slotId}-${slot.date}`}>
                      <CalendarPlus size={13} strokeWidth={2} aria-hidden="true" />
                      {formatDate(slot.date)} {slot.startTime.slice(0, 5)}
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.slotId, slot.date)}
                        aria-label="Quitar horario"
                      >
                        <Trash2 size={12} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {submitError && (
            <div className="submit-error" role="alert">
              <AlertCircle size={17} strokeWidth={2} aria-hidden="true" />
              {submitError}
            </div>
          )}

          <div className="submit-row">
            <button type="button" className="btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="spin" size={16} strokeWidth={2} aria-hidden="true" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
                  Crear torneo
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{styles}</style>
    </section>
  );
}

const styles = `
  .tournament-shell { width: 100%; }
  .tournament-main {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(360px, 1.1fr);
    gap: 1.25rem;
    align-items: start;
  }
  .form-surface, .success-panel {
    background: hsl(220 55% 10%);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 8px 26px rgba(0,0,0,0.22);
  }
  .surface-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .eyebrow {
    margin: 0 0 0.2rem;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: hsl(42 100% 60%);
  }
  h2 {
    margin: 0;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.55rem;
    font-weight: 400;
    letter-spacing: 0.04em;
    color: #fff;
    line-height: 1;
  }
  .organizer-pill, .count-pill, .club-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(246,164,0,0.24);
    background: rgba(246,164,0,0.1);
    color: hsl(42 100% 65%);
    padding: 0.25rem 0.7rem;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
  }
  .field { display: flex; flex-direction: column; gap: 0.32rem; }
  .field-wide { grid-column: 1 / -1; }
  .field span {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: hsl(215 20% 52%);
  }
  .field input, .field select, .field textarea {
    width: 100%;
    background: hsl(220 35% 14%);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: hsl(210 20% 92%);
    font-family: 'Barlow', sans-serif;
    font-size: 0.9rem;
    padding: 0.58rem 0.72rem;
    outline: none;
    transition: border-color 0.12s, background 0.12s;
  }
  .field textarea { resize: vertical; min-height: 84px; }
  .field input:focus, .field select:focus, .field textarea:focus {
    border-color: rgba(246,164,0,0.48);
    background: hsl(220 35% 16%);
  }
  .field select option { background: hsl(220 55% 10%); }
  .format-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.45rem; }
  .format-chip {
    min-height: 40px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: hsl(215 20% 64%);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .format-chip--active {
    background: rgba(246,164,0,0.14);
    border-color: rgba(246,164,0,0.38);
    color: hsl(42 100% 66%);
  }
  .metrics-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    margin-top: 1rem;
  }
  .metric {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.05rem 0.45rem;
    align-items: center;
    background: rgba(255,255,255,0.035);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px;
    padding: 0.7rem;
    color: hsl(42 100% 62%);
  }
  .metric strong {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.35rem;
    color: #fff;
    line-height: 1;
  }
  .metric span {
    grid-column: 1 / -1;
    color: hsl(215 20% 50%);
    font-family: 'Barlow', sans-serif;
    font-size: 0.76rem;
  }
  .slot-toolbar {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.8rem;
  }
  .compact-date { max-width: 180px; }
  .inline-state {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    color: hsl(215 20% 55%);
    font-family: 'Barlow', sans-serif;
    font-size: 0.88rem;
  }
  .inline-state.error { color: hsl(0 72% 66%); }
  .slot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
    gap: 0.55rem;
  }
  .slot-option {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.1rem 0.4rem;
    text-align: left;
    min-height: 74px;
    border-radius: 9px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.035);
    padding: 0.65rem 0.72rem;
    color: hsl(210 20% 86%);
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s;
  }
  .slot-option:hover:not(:disabled) {
    border-color: rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.06);
  }
  .slot-option:disabled { opacity: 0.42; cursor: not-allowed; }
  .slot-option--selected {
    border-color: rgba(246,164,0,0.5);
    background: rgba(246,164,0,0.11);
  }
  .slot-time {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 1.22rem;
    letter-spacing: 0.04em;
    color: #fff;
  }
  .slot-court {
    grid-column: 1 / -1;
    font-family: 'Barlow', sans-serif;
    font-size: 0.82rem;
    color: hsl(215 20% 66%);
  }
  .slot-format {
    grid-column: 1 / -1;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: hsl(216 85% 66%);
    text-transform: uppercase;
  }
  .progress-wrap {
    height: 6px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    overflow: hidden;
    margin: 1rem 0;
  }
  .progress-wrap div {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, hsl(35 100% 48%), hsl(142 70% 45%));
    transition: width 0.18s ease;
  }
  .rounds-list { display: flex; flex-direction: column; gap: 0.45rem; }
  .round-row {
    display: grid;
    grid-template-columns: 88px 1fr;
    gap: 0.65rem;
    align-items: start;
    padding: 0.55rem 0;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .round-title {
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: hsl(42 100% 62%);
    text-transform: uppercase;
  }
  .round-slots { display: flex; flex-wrap: wrap; gap: 0.38rem; }
  .empty-slot {
    color: hsl(215 20% 38%);
    font-family: 'Barlow', sans-serif;
    font-size: 0.8rem;
  }
  .selected-slot {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    border-radius: 999px;
    background: rgba(255,255,255,0.055);
    border: 1px solid rgba(255,255,255,0.08);
    color: hsl(210 20% 78%);
    padding: 0.24rem 0.34rem 0.24rem 0.55rem;
    font-family: 'Barlow', sans-serif;
    font-size: 0.78rem;
  }
  .selected-slot button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: hsl(215 20% 50%);
    cursor: pointer;
  }
  .selected-slot button:hover {
    background: rgba(239,68,68,0.12);
    color: hsl(0 72% 65%);
  }
  .submit-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.9rem;
    border: 1px solid rgba(239,68,68,0.24);
    background: rgba(239,68,68,0.1);
    color: hsl(0 72% 68%);
    border-radius: 9px;
    padding: 0.7rem 0.85rem;
    font-family: 'Barlow', sans-serif;
    font-size: 0.86rem;
  }
  .submit-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
  .btn-primary, .btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.42rem;
    min-height: 42px;
    border-radius: 8px;
    padding: 0.62rem 1.15rem;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
  }
  .btn-primary {
    border: 0;
    background: hsl(35 100% 48%);
    color: hsl(220 72% 7%);
  }
  .btn-primary:hover:not(:disabled) { background: hsl(35 100% 55%); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn-secondary {
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.05);
    color: hsl(210 20% 82%);
  }
  .spin { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .success-panel {
    max-width: 560px;
    margin: 0 auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.85rem;
  }
  .success-mark {
    display: inline-flex;
    width: 64px;
    height: 64px;
    border-radius: 999px;
    align-items: center;
    justify-content: center;
    color: hsl(142 70% 52%);
    background: rgba(34,197,94,0.14);
    border: 1px solid rgba(34,197,94,0.28);
  }
  .success-panel h2 { font-size: 2rem; }
  .success-copy {
    margin: 0;
    color: hsl(215 20% 58%);
    font-family: 'Barlow', sans-serif;
  }
  .success-actions { display: flex; gap: 0.65rem; flex-wrap: wrap; justify-content: center; }
  @media (max-width: 920px) {
    .tournament-main { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .form-surface { padding: 1rem; border-radius: 10px; }
    .field-grid, .metrics-row { grid-template-columns: 1fr; }
    .format-row { grid-template-columns: repeat(2, 1fr); }
    .slot-toolbar { align-items: stretch; flex-direction: column; }
    .compact-date { max-width: 100%; }
    .round-row { grid-template-columns: 1fr; gap: 0.35rem; }
    .submit-row, .btn-primary, .btn-secondary { width: 100%; }
    .success-actions { width: 100%; flex-direction: column; }
  }
`;
