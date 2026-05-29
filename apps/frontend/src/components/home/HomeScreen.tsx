import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Users,
  Trophy,
  MapPin,
  Zap,
  Shield,
  ArrowRight,
  UserCircle,
  Flame,
} from 'lucide-react';
import { MatchList } from '@/components/matches';
import { TournamentList } from '@/components/tournaments/TournamentList';

/**
 * HomeScreen Component
 *
 * Decision Context:
 * - Why: Primary entry point for the platform. The previous hero was a flat
 *   navy background with grid overlay; the brand needed a much more
 *   "futbolera" stadium feel to match the FIFA-inspired design system.
 * - Approach: Hero now layers a darkened pitch photo (`/court.jpg`) under a
 *   navy gradient veil, with the orange `/ball.webp` bouncing DVD-screensaver
 *   style inside the right sector of the hero. The path is a single linear
 *   keyframe set (`ballDvd`) computed by simulating constant-velocity motion
 *   with axis reflection on each of 4 imaginary walls — the cycle visits all
 *   bounce points and returns exactly to the origin so the loop is seamless.
 *   Travel and rotation are split across independent CSS properties
 *   (`translate` + `rotate`) instead of a combined `transform`: a previous
 *   version chained two animations on `transform` and they overwrote each
 *   other, producing a deformed, stuttering ball. Splitting lets each
 *   keyframe set drive its own property without conflict.
 *   `object-contain` on the `<img>` prevents the source aspect ratio from
 *   being squashed by the explicit h/w utilities. A SVG corner-arc +
 *   center-circle evoke pitch markings without needing extra raster assets.
 *   A "MATCH DAY" pulse badge and a scoreline-style ticker reinforce the
 *   live-football identity.
 * - Token discipline: every color is sourced from the FIFA design tokens in
 *   `globals.css` (no raw hex). Background images sit in /public so Astro
 *   serves them statically; the hero remains SSR-friendly because all motion
 *   is pure CSS.
 * - Sections (unchanged structure): Hero (animated stadium) → Partidos
 *   Disponibles (MatchList) → Stats (glass cards) → How it Works (step
 *   cards) → Bottom CTA (gradient panel).
 * - Authenticated CTA cluster: "Explorar Partidos" (primary) → "Mi Perfil"
 *   (secondary) → "Cerrar Sesión" (outline). Profile entry stays here
 *   because the home page has no topbar — without it, signed-in users had no
 *   discoverable entry point to /perfil.
 * - Previously fixed bugs: none relevant.
 */

interface HomeScreenProps {
  isAuthenticated?: boolean;
  userName?: string;
}

const STATS = [
  { value: '500+', label: 'Jugadores', icon: Users },
  { value: '120+', label: 'Partidos activos', icon: Trophy },
  { value: '30+', label: 'Clubes', icon: MapPin },
];

const STEPS = [
  {
    number: '01',
    title: 'Crea tu perfil',
    description: 'Contanos tus posiciones, habilidades y disponibilidad horaria.',
    icon: Shield,
  },
  {
    number: '02',
    title: 'Encontrá partidos',
    description: 'Filtrá partidos y torneos cerca tuyo, con el formato que más te guste.',
    icon: MapPin,
  },
  {
    number: '03',
    title: 'Sumate al equipo',
    description: 'Confirmá tu lugar, coordiná con los jugadores y a la cancha.',
    icon: Zap,
  },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  isAuthenticated = false,
  userName,
}) => {
  return (
    <main className="overflow-x-hidden">
      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[100svh] items-center px-4 sm:px-6 lg:px-8">
        {/* Pitch photo backdrop (heavily veiled) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <img
            src="/court.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-25"
            style={{ animation: 'courtZoom 24s ease-in-out infinite alternate' }}
          />
          {/* Navy veil — keeps text contrast strong */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, hsl(220 72% 7% / 0.55) 0%, hsl(220 72% 7% / 0.78) 55%, hsl(220 72% 7%) 100%)',
            }}
          />
          {/* Lateral blue glow */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 65% 55% at 22% 45%, hsl(216 85% 28% / 0.45), transparent 70%)',
            }}
          />
          {/* Orange rim glow on the right where the ball lives */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle 380px at 82% 32%, hsl(35 100% 48% / 0.18), transparent 70%)',
            }}
          />
        </div>

        {/* Decorative pitch corner arc (bottom-left) */}
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          className="pointer-events-none absolute bottom-0 left-0 -z-10 h-80 w-80 opacity-[0.12] sm:h-96 sm:w-96"
        >
          <path
            d="M0 200 L0 110 A 90 90 0 0 1 90 200 Z"
            fill="none"
            stroke="hsl(210 20% 94%)"
            strokeWidth="1.2"
          />
          <circle cx="0" cy="200" r="30" fill="none" stroke="hsl(210 20% 94%)" strokeWidth="1" />
        </svg>

        {/* Center-circle hint (top-right) */}
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          className="pointer-events-none absolute -right-32 top-12 -z-10 h-[28rem] w-[28rem] opacity-[0.08]"
        >
          <circle cx="100" cy="100" r="80" fill="none" stroke="hsl(210 20% 94%)" strokeWidth="1" />
          <circle cx="100" cy="100" r="2" fill="hsl(210 20% 94%)" />
        </svg>

        {/* Ball bouncing DVD-style inside the right sector of the hero */}
        <img
          src="/ball.webp"
          alt=""
          aria-hidden
          className="ball-anim pointer-events-none absolute -z-10 h-28 w-28 select-none object-contain sm:h-40 sm:w-40 lg:h-56 lg:w-56"
          style={{
            top: '6vh',
            right: '4vw',
            filter:
              'drop-shadow(0 30px 50px hsl(35 100% 48% / 0.35)) drop-shadow(0 0 80px hsl(35 100% 48% / 0.18))',
          }}
        />

        <div className="mx-auto w-full max-w-5xl">
          {/* Match-day pulse badge */}
          <div
            className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 backdrop-blur-sm"
            style={{ animation: 'fadeUp 0.5s ease both' }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Match Day · Uruguay
            </span>
          </div>

          {isAuthenticated && userName && (
            <p
              className="mb-3 text-sm font-medium uppercase tracking-widest text-primary"
              style={{ animation: 'fadeUp 0.5s ease both', animationDelay: '40ms' }}
            >
              ¡Bienvenido de vuelta, {userName}!
            </p>
          )}

          <h1
            className="font-['Bebas_Neue'] leading-[0.92] tracking-wide text-white"
            style={{
              fontSize: 'clamp(4.5rem, 13vw, 11rem)',
              animation: 'fadeUp 0.55s ease both',
              animationDelay: '80ms',
              textShadow: '0 4px 30px hsl(220 72% 7% / 0.6)',
            }}
          >
            <span className="block">SUMATE</span>
            <span
              className="block"
              style={{
                WebkitTextStroke: '2px hsl(35 100% 48%)',
                color: 'transparent',
              }}
            >
              AL JUEGO
            </span>
          </h1>

          <p
            className="mt-6 max-w-lg text-lg leading-relaxed text-white/65"
            style={{ animation: 'fadeUp 0.55s ease both', animationDelay: '180ms' }}
          >
            La plataforma para conectar jugadores de fútbol, armar equipos y
            sumarte a partidos en tu zona.
          </p>

          <div
            className="mt-10 flex flex-wrap gap-4"
            style={{ animation: 'fadeUp 0.55s ease both', animationDelay: '280ms' }}
          >
            {isAuthenticated ? (
              <>
                <Button size="lg" className="group gap-2" asChild>
                  <a href="/partidos">
                    Explorar Partidos
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>
                <Button size="lg" variant="secondary" className="gap-2" asChild>
                  <a href="/perfil">
                    <UserCircle className="h-4 w-4" />
                    Mi Perfil
                  </a>
                </Button>
                <form method="POST" action="/api/auth/logout">
                  <Button size="lg" variant="outline" type="submit">
                    Cerrar Sesión
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button size="lg" className="group gap-2" asChild>
                  <a href="/login">
                    Iniciar Sesión
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="/registro-jugador">Registrarse</a>
                </Button>
              </>
            )}
          </div>

          {/* Scoreline-style ticker */}
          <div
            className="mt-12 hidden items-center gap-6 text-sm text-white/50 sm:flex"
            style={{ animation: 'fadeUp 0.55s ease both', animationDelay: '380ms' }}
          >
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              <span>
                <strong className="font-semibold text-white">120</strong> partidos esta semana
              </span>
            </div>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-secondary" />
              <span>
                <strong className="font-semibold text-white">500+</strong> jugadores activos
              </span>
            </div>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[hsl(42_100%_55%)]" />
              <span>
                <strong className="font-semibold text-white">30+</strong> clubes
              </span>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground sm:flex"
          style={{ animation: 'scrollCue 2.4s ease-in-out infinite' }}
        >
          <span>Deslizá</span>
          <span className="h-6 w-px bg-gradient-to-b from-muted-foreground to-transparent" />
        </div>

        {/* Fade into next section */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-28"
          style={{ background: 'linear-gradient(to bottom, transparent, hsl(220 72% 7%))' }}
        />
      </section>

      {/* ── VER PARTIDOS ─────────────────────────────────────────── */}
      <section className="px-4 pb-4 pt-0 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                En vivo
              </p>
              <h2 className="font-['Bebas_Neue'] text-5xl tracking-wide text-foreground">
                Partidos Disponibles
              </h2>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <a href="/partidos">
                Ver todos
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>

          <MatchList isAuthenticated={isAuthenticated} />
        </div>
      </section>

      {/* Torneos disponibles */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
                <Trophy className="h-4 w-4" aria-hidden="true" />
                Copas abiertas
              </p>
              <h2 className="font-['Bebas_Neue'] text-5xl tracking-wide text-foreground">
                Torneos Disponibles
              </h2>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <a href="/torneos">
                Ver todos
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>

          <TournamentList isAuthenticated={isAuthenticated} />
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div
              key={label}
              className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-xl p-8 text-center backdrop-blur-sm transition-colors duration-200 hover:border-primary/30"
              style={{
                background: 'var(--color-surface-glass)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              {/* Decorative corner pitch line */}
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-6 -right-6 h-20 w-20 rounded-full border border-white/10"
              />
              <Icon className="h-8 w-8 text-primary" />
              <span className="font-['Bebas_Neue'] text-5xl tracking-wide text-foreground">
                {value}
              </span>
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="border-t border-border px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-['Bebas_Neue'] text-5xl tracking-wide text-foreground">
            ¿Cómo funciona?
          </h2>
          <p className="mt-2 text-muted-foreground">
            En tres pasos estás dentro del partido.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ number, title, description, icon: Icon }) => (
              <div
                key={number}
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-colors duration-200 hover:border-primary/40"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-3 -top-4 select-none font-['Bebas_Neue'] text-8xl leading-none text-border transition-colors duration-200 group-hover:text-primary/15"
                >
                  {number}
                </span>
                <Icon className="mb-4 h-7 w-7 text-secondary" />
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ───────────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div
          className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl p-12 text-center"
          style={{
            background:
              'linear-gradient(135deg, hsl(216 85% 15% / 0.55), hsl(220 72% 10% / 0.55))',
            border: '1px solid hsl(216 85% 30% / 0.35)',
          }}
        >
          {/* Faint ball watermark */}
          <img
            src="/ball.webp"
            alt=""
            aria-hidden
            className="ball-watermark pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 select-none object-contain opacity-15 sm:h-72 sm:w-72"
          />
          <h2 className="relative font-['Bebas_Neue'] text-5xl tracking-wide text-foreground">
            ¿Listo para jugar?
          </h2>
          <p className="relative mt-3 text-muted-foreground">
            Unite a la comunidad y encontrá tu próximo partido ahora.
          </p>
          <Button size="lg" className="relative mt-8 gap-2" asChild>
            <a href={isAuthenticated ? '/partidos' : '/login'}>
              {isAuthenticated ? 'Ver partidos disponibles' : 'Iniciar Sesión'}
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Hero ball: DVD-screensaver bounce inside the right sector.
           The path was simulated with velocity vector (1, 0.6) reflecting
           off 4 walls of a 22vw × 30vh box, producing a 14-bounce cycle
           that returns to (0, 0) — so the loop seams cleanly and never
           travels the same line twice in a row. \`linear\` timing matches
           the constant-velocity feel of the original DVD logo motion.
           translate + rotate are independent properties so the continuous
           rotation (\`ballRotate\`) layers without fighting the path. */
        .ball-anim {
          animation:
            ballDvd 26s linear infinite,
            ballRotate 9s linear infinite;
          will-change: translate, rotate;
        }
        @keyframes ballDvd {
          0%   { translate: 0       0; }
          10%  { translate: -22vw   18vh; }
          17%  { translate: -7.3vw  30vh; }
          20%  { translate: 0       24vh; }
          30%  { translate: -22vw   6vh; }
          33%  { translate: -14.7vw 0; }
          40%  { translate: 0       12vh; }
          50%  { translate: -22vw   30vh; }
          60%  { translate: 0       12vh; }
          67%  { translate: -14.7vw 0; }
          70%  { translate: -22vw   6vh; }
          80%  { translate: 0       24vh; }
          83%  { translate: -7.3vw  30vh; }
          90%  { translate: -22vw   18vh; }
          100% { translate: 0       0; }
        }

        .ball-watermark {
          animation: ballRotate 24s linear infinite;
        }
        @keyframes ballRotate {
          from { rotate: 0deg; }
          to   { rotate: 360deg; }
        }

        @keyframes courtZoom {
          from { transform: scale(1)    translateX(0); }
          to   { transform: scale(1.08) translateX(-2%); }
        }
        @keyframes scrollCue {
          0%, 100% { opacity: 0.4; transform: translate(-50%, 0); }
          50%      { opacity: 1;   transform: translate(-50%, 6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </main>
  );
};

export default HomeScreen;
