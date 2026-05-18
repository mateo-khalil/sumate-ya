/**
 * ProfilePreviewModal — shows how your profile looks to other players
 *
 * Decision Context:
 * - Why: Allows users to preview privacy settings effects before saving (mejora 3).
 * - The preview applies the *current local settings* (not yet saved) so users can
 *   make informed decisions without having to save first.
 * - Fetches the profile data from the backend using the user's own token — the same
 *   data that other users would see — and applies the local settings overlay for
 *   fields that would be hidden.
 * - Mobile: renders full-screen on small screens to maximize preview area.
 * - Previously fixed bugs: none relevant.
 */

import { X, User } from 'lucide-react';
import type { PrivacySettings, Profile } from '../../graphql/operations/profile';
import { getDivisionMeta } from '../../lib/division';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: PrivacySettings;
  profile: Profile | null;
}

const POSITION_LABEL: Record<string, string> = {
  GOALKEEPER: 'Arquero',
  DEFENDER: 'Defensor',
  MIDFIELDER: 'Mediocampista',
  FORWARD: 'Delantero',
};

function PreviewCard({ profile, settings }: { profile: Profile; settings: PrivacySettings }) {
  const showStats = settings.isPublic && settings.showStats;
  const showPosition = settings.isPublic && settings.showPosition;
  const showDivision = settings.isPublic && settings.showDivision;

  const positionLabel = showPosition && profile.preferredPosition
    ? (POSITION_LABEL[profile.preferredPosition] ?? null)
    : null;

  const winrate =
    showStats && profile.matchesPlayed && profile.matchesPlayed > 0
      ? ((profile.matchesWon ?? 0) / profile.matchesPlayed) * 100
      : null;
  const division = getDivisionMeta(profile.division);

  return (
    <article className="preview-card">
      <div className="preview-card-header">
        {showDivision && (
          <span className={`preview-div-badge ${division.className}`}>
            D{division.level} {division.name}
          </span>
        )}
        <span className="preview-role-badge">Jugador</span>
      </div>

      <div className="preview-avatar-ring">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={`Foto de ${profile.displayName}`}
            className="preview-avatar-img"
            width="100"
            height="100"
          />
        ) : (
          <div className="preview-avatar-placeholder" aria-label="Sin foto">
            <User size={40} strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="preview-identity">
        <h3 className="preview-name">{profile.displayName}</h3>
        {positionLabel && (
          <span className="preview-position">{positionLabel}</span>
        )}
        {!settings.isPublic && (
          <span className="preview-private-badge">Perfil privado</span>
        )}
      </div>

      {showStats ? (
        <div className="preview-stats">
          <div className="preview-stat">
            <span className="preview-stat-value">{profile.matchesPlayed ?? 0}</span>
            <span className="preview-stat-label">Partidos</span>
          </div>
          <div className="preview-stat preview-stat--mid">
            <span className="preview-stat-value">{profile.matchesWon ?? 0}</span>
            <span className="preview-stat-label">Victorias</span>
          </div>
          <div className="preview-stat">
            <span className="preview-stat-value preview-stat-value--orange">
              {winrate !== null ? `${winrate.toFixed(1)}%` : '—'}
            </span>
            <span className="preview-stat-label">Efectividad</span>
          </div>
        </div>
      ) : (
        <div className="preview-stats-hidden">
          <span className="preview-stats-hidden-label">Estadísticas ocultas</span>
        </div>
      )}

      <style>{`
        .preview-card {
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 1rem;
          overflow: hidden;
          width: 100%;
          max-width: 300px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .preview-card-header {
          width: 100%;
          padding: 0.6rem 1rem;
          background: linear-gradient(135deg, hsl(216 85% 22%), hsl(220 72% 15%));
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .preview-div-badge {
          --division-accent: hsl(35 100% 65%);
          --division-bg: rgba(246,164,0,0.12);
          --division-border: rgba(246,164,0,0.25);
          font-family: 'Bebas Neue', sans-serif;
          font-size: 0.85rem;
          letter-spacing: 0.1em;
          color: var(--division-accent);
          background: var(--division-bg);
          border: 1px solid var(--division-border);
          padding: 0.1rem 0.5rem;
          border-radius: 4px;
        }
        .preview-div-badge.division-bronze {
          --division-accent: hsl(24 78% 64%);
          --division-bg: hsl(24 78% 45% / 0.13);
          --division-border: hsl(24 78% 52% / 0.34);
        }
        .preview-div-badge.division-silver {
          --division-accent: hsl(205 18% 82%);
          --division-bg: hsl(205 18% 64% / 0.12);
          --division-border: hsl(205 18% 76% / 0.34);
        }
        .preview-div-badge.division-gold {
          --division-accent: hsl(44 100% 62%);
          --division-bg: hsl(44 100% 50% / 0.13);
          --division-border: hsl(44 100% 54% / 0.36);
        }
        .preview-div-badge.division-diamond {
          --division-accent: hsl(184 86% 66%);
          --division-bg: hsl(184 86% 46% / 0.13);
          --division-border: hsl(184 86% 58% / 0.38);
        }
        .preview-role-badge {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: hsl(215 20% 60%);
        }
        .preview-avatar-ring {
          margin-top: 1.5rem;
          width: 100px;
          height: 100px;
          border-radius: 50%;
          padding: 3px;
          background: linear-gradient(135deg, hsl(35 100% 48%), hsl(216 85% 45%));
          box-shadow: 0 0 16px rgba(246,164,0,0.15);
          flex-shrink: 0;
        }
        .preview-avatar-img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          background: hsl(220 40% 16%);
          display: block;
        }
        .preview-avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: hsl(220 40% 16%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: hsl(215 20% 40%);
        }
        .preview-identity {
          margin-top: 0.875rem;
          text-align: center;
          padding: 0 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
        }
        .preview-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.6rem;
          font-weight: 400;
          letter-spacing: 0.05em;
          color: #fff;
          margin: 0;
          line-height: 1;
        }
        .preview-position {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: hsl(35 100% 55%);
          background: rgba(246,164,0,0.1);
          border: 1px solid rgba(246,164,0,0.2);
          padding: 0.15rem 0.6rem;
          border-radius: 20px;
        }
        .preview-private-badge {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: hsl(215 20% 55%);
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          padding: 0.15rem 0.6rem;
          border-radius: 20px;
        }
        .preview-stats {
          width: 100%;
          margin-top: 1.25rem;
          padding: 1rem 0;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .preview-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          padding: 0.2rem 0.4rem;
        }
        .preview-stat--mid {
          border-left: 1px solid rgba(255,255,255,0.06);
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .preview-stat-value {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.4rem;
          color: #fff;
          line-height: 1;
        }
        .preview-stat-value--orange { color: hsl(35 100% 55%); }
        .preview-stat-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.62rem;
          font-weight: 600;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: hsl(215 20% 50%);
        }
        .preview-stats-hidden {
          width: 100%;
          margin-top: 1.25rem;
          padding: 0.875rem 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .preview-stats-hidden-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: hsl(215 20% 40%);
        }
      `}</style>
    </article>
  );
}

export default function ProfilePreviewModal({ isOpen, onClose, settings, profile }: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa de tu perfil"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="preview-modal">
        <div className="preview-modal-header">
          <div>
            <p className="preview-modal-eyebrow">Vista previa</p>
            <h2 className="preview-modal-title">Así te ven otros jugadores</h2>
          </div>
          <button
            type="button"
            className="preview-close-btn"
            aria-label="Cerrar vista previa"
            onClick={onClose}
          >
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="preview-modal-body">
          {profile ? (
            <PreviewCard profile={profile} settings={settings} />
          ) : (
            <p className="preview-no-data">No se pudo cargar el perfil</p>
          )}
        </div>

        <p className="preview-modal-note">
          Los cambios no están guardados. Usa "Guardar cambios" para aplicarlos.
        </p>
      </div>

      <style>{`
        .preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(7, 15, 31, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .preview-modal {
          background: hsl(220 55% 11%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 1rem;
          width: 100%;
          max-width: 400px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .preview-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 1.25rem 1.25rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          gap: 1rem;
        }
        .preview-modal-eyebrow {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: hsl(35 100% 55%);
          margin: 0 0 0.2rem;
        }
        .preview-modal-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.4rem;
          letter-spacing: 0.04em;
          color: #fff;
          margin: 0;
          line-height: 1;
        }
        .preview-close-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: hsl(215 20% 65%);
          cursor: pointer;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .preview-close-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }
        .preview-modal-body {
          padding: 1.25rem;
        }
        .preview-modal-note {
          padding: 0.75rem 1.25rem;
          border-top: 1px solid rgba(255,255,255,0.06);
          font-family: 'Barlow', sans-serif;
          font-size: 0.8rem;
          color: hsl(215 20% 45%);
          margin: 0;
          text-align: center;
        }
        .preview-no-data {
          text-align: center;
          color: hsl(215 20% 50%);
          font-family: 'Barlow', sans-serif;
          padding: 2rem 0;
        }

        @media (max-width: 480px) {
          .preview-overlay { padding: 0; align-items: flex-end; }
          .preview-modal {
            border-radius: 1rem 1rem 0 0;
            max-width: 100%;
            border-left: none;
            border-right: none;
            border-bottom: none;
          }
        }
      `}</style>
    </div>
  );
}
