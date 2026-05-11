/**
 * MatchDetailModal — slide-over modal showing full match details
 *
 * Decision Context:
 * - Why modal instead of page navigation: keeps admin in context. Avoids a full
 *   page reload which would lose filter state. Pattern is a radix-free custom modal
 *   with focus-trap via ref so shadcn/Dialog is not needed (keeps bundle lean).
 * - Organizer link: uses a simple anchor to /perfil/:id if that route exists in the
 *   public frontend. Marked as external (target=_blank) so the admin panel doesn't
 *   navigate away.
 * - Participant avatars: graceful fallback to initials if avatarUrl is null.
 * - Close on Escape key and backdrop click (standard modal UX).
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useEffect, useRef } from 'react';
import { X, MapPin, Clock, Users, Calendar, User } from 'lucide-react';
import type { DashboardMatch } from '../../graphql/operations/club-dashboard';
import { FORMAT_LABELS, STATUS_LABELS } from '../../graphql/operations/club-dashboard';

interface Props {
  match: DashboardMatch | null;
  onClose: () => void;
}

function Avatar({ profile }: { profile: { id: string; displayName: string; avatarUrl: string | null } }) {
  const initials = profile.displayName.slice(0, 2).toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {profile.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt={profile.displayName}
          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)' }}
        />
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: 'rgba(246,164,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', fontWeight: 700, color: 'hsl(42 100% 65%)',
          fontFamily: 'Barlow Condensed, sans-serif',
        }}>
          {initials}
        </div>
      )}
      <span style={{ fontSize: '0.82rem', color: 'hsl(210 20% 80%)', fontFamily: 'Barlow, sans-serif' }}>
        {profile.displayName}
      </span>
    </div>
  );
}

function statusColor(s: DashboardMatch['status']) {
  const map: Record<string, string> = {
    OPEN: 'hsl(42 100% 65%)', FULL: 'hsl(30 100% 65%)',
    IN_PROGRESS: 'hsl(216 85% 70%)', COMPLETED: 'hsl(215 20% 55%)',
    CANCELLED: 'hsl(0 72% 60%)',
  };
  return map[s] ?? 'hsl(215 20% 55%)';
}

export default function MatchDetailModal({ match, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!match) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [match, onClose]);

  if (!match) return null;

  const dt = new Date(match.scheduledAt);
  const dateStr = dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Detalle del partido">
      <div
        ref={panelRef}
        className="modal-panel"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-label">PARTIDO</div>
            <div className="modal-title">{FORMAT_LABELS[match.format]}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Status badge */}
        <div className="modal-status" style={{ color: statusColor(match.status) }}>
          {STATUS_LABELS[match.status]} · {match.timeStatusLabel}
        </div>

        {/* Meta info */}
        <div className="modal-meta">
          <div className="meta-row">
            <Calendar size={14} strokeWidth={2} color="hsl(215 20% 45%)" aria-hidden="true" />
            <span>{dateStr}</span>
          </div>
          <div className="meta-row">
            <Clock size={14} strokeWidth={2} color="hsl(215 20% 45%)" aria-hidden="true" />
            <span>{timeStr}</span>
          </div>
          {match.courtName && (
            <div className="meta-row">
              <MapPin size={14} strokeWidth={2} color="hsl(215 20% 45%)" aria-hidden="true" />
              <span>{match.courtName}</span>
            </div>
          )}
          <div className="meta-row">
            <Users size={14} strokeWidth={2} color="hsl(215 20% 45%)" aria-hidden="true" />
            <span>{match.participantCount} / {match.capacity} jugadores · {match.spotsLeft} lugar{match.spotsLeft !== 1 ? 'es' : ''} libre{match.spotsLeft !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Capacity bar */}
        <div className="cap-wrap">
          <div className="cap-track">
            <div className="cap-fill" style={{
              width: `${match.capacity > 0 ? Math.min(100, (match.participantCount / match.capacity) * 100) : 0}%`,
              background: match.participantCount >= match.capacity ? '#ef4444' : match.participantCount >= match.capacity * 0.7 ? '#f6a400' : '#22c55e',
            }} />
          </div>
        </div>

        {/* Organizer */}
        <div className="modal-section">
          <div className="section-label">ORGANIZADOR</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Avatar profile={match.organizer} />
            <a
              href={`/perfil/${match.organizer.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="profile-link"
              aria-label="Ver perfil del organizador"
            >
              <User size={13} strokeWidth={2} aria-hidden="true" />
              Ver perfil
            </a>
          </div>
        </div>

        {/* Description */}
        {match.description && (
          <div className="modal-section">
            <div className="section-label">DESCRIPCIÓN</div>
            <p className="match-desc">{match.description}</p>
          </div>
        )}

        {/* Participants */}
        {match.participants.length > 0 && (
          <div className="modal-section">
            <div className="section-label">JUGADORES ({match.participantCount})</div>
            <div className="participant-list">
              {match.participants.map((p) => (
                <Avatar key={p.id} profile={p} />
              ))}
            </div>
          </div>
        )}

        <style>{`
          .modal-backdrop {
            position: fixed; inset: 0; z-index: 100;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
            display: flex; justify-content: flex-end; align-items: stretch;
          }
          .modal-panel {
            width: min(440px, 96vw); height: 100vh; overflow-y: auto;
            background: hsl(220 60% 9%); border-left: 1px solid rgba(255,255,255,0.08);
            display: flex; flex-direction: column; gap: 1.25rem;
            padding: 1.5rem; outline: none;
          }
          .modal-header { display: flex; justify-content: space-between; align-items: flex-start; }
          .modal-label {
            font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
            letter-spacing: 0.2em; color: hsl(42 100% 55%); text-transform: uppercase; margin-bottom: 4px;
          }
          .modal-title {
            font-family: 'Bebas Neue', sans-serif; font-size: 2rem; color: #fff;
            letter-spacing: 0.04em; line-height: 1;
          }
          .modal-close {
            background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px; padding: 0.4rem; cursor: pointer; color: hsl(215 20% 60%);
            display: inline-flex; transition: background 0.12s;
            min-width: 44px; min-height: 44px; /* iOS touch target */
            align-items: center; justify-content: center;
          }
          .modal-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
          /* On mobile, panel takes full width */
          @media (max-width: 480px) {
            .modal-panel { width: 100%; padding: 1.25rem 1rem; }
          }
          .modal-status {
            font-family: 'Barlow Condensed', sans-serif; font-size: 0.85rem;
            font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          }
          .modal-meta { display: flex; flex-direction: column; gap: 0.625rem; }
          .meta-row { display: flex; align-items: center; gap: 8px; font-family: 'Barlow', sans-serif; font-size: 0.875rem; color: hsl(215 20% 65%); }
          .cap-wrap { padding: 0 0 0.25rem; }
          .cap-track { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
          .cap-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
          .modal-section { display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1rem; }
          .section-label {
            font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
            letter-spacing: 0.18em; color: hsl(215 20% 40%); text-transform: uppercase;
          }
          .profile-link {
            display: flex; align-items: center; gap: 4px; font-size: 0.78rem;
            font-family: 'Barlow', sans-serif; color: hsl(216 85% 65%); text-decoration: none;
          }
          .profile-link:hover { color: hsl(216 85% 75%); }
          .match-desc { font-family: 'Barlow', sans-serif; font-size: 0.875rem; color: hsl(215 20% 60%); margin: 0; line-height: 1.5; }
          .participant-list { display: flex; flex-direction: column; gap: 0.5rem; }
        `}</style>
      </div>
    </div>
  );
}
