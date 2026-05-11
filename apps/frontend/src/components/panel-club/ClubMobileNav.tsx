/**
 * ClubMobileNav — hamburger button + slide-in drawer for mobile navigation
 *
 * Decision Context:
 * - ClubSidebar hides via CSS on mobile (max-width: 768px) leaving zero navigation
 *   access on small screens. This component fills that gap with a hamburger button
 *   visible only on mobile that opens a full-height slide-in drawer.
 * - Pattern: hamburger button is in the topbar (right of brand), drawer slides in
 *   from the left replicating the sidebar links + user info + logout.
 * - Backdrop click closes the drawer; same nav links as ClubSidebar to stay in sync.
 * - Touch targets: all interactive elements are min 48px tall to meet Apple HIG.
 * - currentPath prop drives active link detection (strict equality, same as ClubSidebar).
 * - Logout uses a native <form method="POST"> so it works without JS on the action.
 * - Previously fixed bugs: none relevant (new component for responsive epic).
 */

import { useState } from 'react';
import {
  Menu, X, LayoutDashboard, Calendar, Plus,
  Volleyball, Users, Settings, BarChart3, LogOut, Trophy,
} from 'lucide-react';

interface Props {
  currentPath: string;
  userName: string;
}

const NAV_LINKS = [
  { href: '/panel-club/dashboard', icon: LayoutDashboard, label: 'Dashboard', highlight: false },
  { href: '/panel-club/crear-partido', icon: Plus, label: 'Crear partido', highlight: true },
  { href: '/panel-club/horarios', icon: Calendar, label: 'Horarios', highlight: false },
  { href: '/torneos/crear', icon: Trophy, label: 'Crear torneo', highlight: false },
];

const PLACEHOLDER_LINKS = [
  { icon: Volleyball, label: 'Canchas' },
  { icon: Users, label: 'Reservas' },
  { icon: Settings, label: 'Configuración' },
  { icon: BarChart3, label: 'Estadísticas' },
];

export default function ClubMobileNav({ currentPath, userName }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Hamburger — visible only on mobile, hidden md+ via CSS */}
      <button
        className="mob-toggle"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir menú de navegación"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Menu size={22} strokeWidth={2} aria-hidden="true" />
      </button>

      {/* Backdrop + Drawer */}
      {isOpen && (
        <div
          className="mob-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          onClick={() => setIsOpen(false)}
        >
          <nav className="mob-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="mob-header">
              <div className="mob-brand">
                <span className="mob-brand-name">SUMATE YA</span>
                <span className="mob-role-pill">CLUB</span>
              </div>
              <button
                className="mob-close"
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar menú"
              >
                <X size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            {/* User */}
            <div className="mob-user">
              <span className="mob-user-dot" aria-hidden="true" />
              <span className="mob-user-name">{userName}</span>
            </div>

            {/* Nav links */}
            <div className="mob-section">
              <div className="mob-section-label">GESTIÓN</div>
              {NAV_LINKS.map(({ href, icon: Icon, label, highlight }) => {
                const active = currentPath === href;
                return (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={[
                      'mob-link',
                      active && 'mob-link--active',
                      highlight && !active && 'mob-link--highlight',
                    ].filter(Boolean).join(' ')}
                  >
                    <Icon size={18} strokeWidth={2} aria-hidden="true" />
                    {label}
                  </a>
                );
              })}
              {PLACEHOLDER_LINKS.map(({ icon: Icon, label }) => (
                <span key={label} className="mob-link mob-link--placeholder" aria-disabled="true">
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>

            {/* Logout */}
            <form method="POST" action="/api/auth/logout" className="mob-footer">
              <button type="submit" className="mob-logout">
                <LogOut size={16} strokeWidth={2} aria-hidden="true" />
                Salir de la cuenta
              </button>
            </form>
          </nav>
        </div>
      )}

      <style>{`
        /* ── Hamburger button ─────────────────────── */
        .mob-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px; height: 44px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: hsl(210 20% 80%);
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.12s;
        }
        .mob-toggle:hover { background: rgba(255,255,255,0.12); }
        @media (min-width: 768px) { .mob-toggle { display: none; } }

        /* ── Backdrop ─────────────────────────────── */
        .mob-backdrop {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(3px);
        }

        /* ── Drawer ───────────────────────────────── */
        .mob-drawer {
          position: absolute; top: 0; left: 0; bottom: 0;
          width: min(288px, 85vw);
          background: hsl(220 72% 7%);
          border-right: 1px solid rgba(255,255,255,0.08);
          display: flex; flex-direction: column;
          overflow-y: auto;
          overscroll-behavior: contain;
          animation: slideInLeft 0.2s ease;
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }

        /* ── Header ───────────────────────────────── */
        .mob-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.125rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .mob-brand { display: flex; align-items: center; gap: 0.5rem; }
        .mob-brand-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.25rem; letter-spacing: 0.1em; color: #fff;
        }
        .mob-role-pill {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase;
          background: rgba(246,164,0,0.15); border: 1px solid rgba(246,164,0,0.35);
          color: hsl(42 100% 60%); border-radius: 4px; padding: 0.1rem 0.4rem;
        }
        .mob-close {
          width: 40px; height: 40px;
          display: inline-flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: hsl(215 20% 60%); cursor: pointer;
          transition: background 0.12s;
        }
        .mob-close:hover { background: rgba(255,255,255,0.12); color: #fff; }

        /* ── User ─────────────────────────────────── */
        .mob-user {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.75rem 1.125rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.85rem; font-weight: 600;
          color: hsl(42 100% 65%);
          flex-shrink: 0;
        }
        .mob-user-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
          background: hsl(42 100% 58%); box-shadow: 0 0 4px hsl(42 100% 58%);
        }
        .mob-user-name {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* ── Nav ──────────────────────────────────── */
        .mob-section {
          display: flex; flex-direction: column; gap: 2px;
          padding: 0.875rem 0.75rem;
          flex: 1;
        }
        .mob-section-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em;
          color: hsl(215 20% 40%); text-transform: uppercase;
          padding: 0 0.5rem; margin-bottom: 0.25rem;
        }
        .mob-link {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.75rem 0.875rem; min-height: 48px;
          border-radius: 10px;
          font-size: 0.9375rem; font-family: 'Barlow', sans-serif; font-weight: 500;
          color: hsl(215 20% 55%); text-decoration: none;
          border: 1px solid transparent;
          transition: background 0.12s, color 0.12s;
        }
        .mob-link:hover { background: rgba(255,255,255,0.05); color: hsl(210 20% 85%); }
        .mob-link--active {
          background: rgba(246,164,0,0.1); color: hsl(42 100% 65%);
          border-color: rgba(246,164,0,0.18);
        }
        .mob-link--highlight {
          color: hsl(35 100% 58%); border-color: rgba(246,120,0,0.22);
        }
        .mob-link--highlight:hover { background: rgba(246,120,0,0.08); }
        .mob-link--placeholder { opacity: 0.4; cursor: not-allowed; }
        .mob-link--placeholder:hover { background: transparent; opacity: 0.4; }

        /* ── Footer / Logout ──────────────────────── */
        .mob-footer {
          padding: 1rem 1.125rem;
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .mob-logout {
          display: flex; align-items: center; gap: 0.5rem;
          width: 100%; min-height: 48px;
          padding: 0.75rem 1rem; border-radius: 8px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          font-family: 'Barlow', sans-serif; font-size: 0.875rem; font-weight: 500;
          color: hsl(215 20% 60%); cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        .mob-logout:hover { background: rgba(239,68,68,0.1); color: hsl(0 72% 65%); }
      `}</style>
    </>
  );
}
