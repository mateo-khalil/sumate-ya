import React from 'react';
import { Button } from '@/components/ui/button';
import { Users, Trophy, MapPin, Zap, Shield, ArrowRight, UserCircle } from 'lucide-react';
import { MatchList } from '@/components/matches';

/**
 * HomeScreen Component
 *
 * Decision Context:
 * - Why: Primary entry point for the platform, designed to convert visitors and
 *   welcome authenticated users. Stadium-grade aesthetic matching the FIFA World
 *   Cup design system.
 * - Approach: Bebas Neue for all display headings (design system requirement).
 *   Staggered CSS keyframe entrance animations for hero content — no JS library
 *   dependency keeps initial render fast. Glass morphism stat cards leverage the
 *   `--color-surface-glass` and `--color-surface-border` design tokens.
 * - Sections: Hero (animated) → Partidos Disponibles (MatchList + filters, public) →
 *   Stats (glass cards) → How it Works (step cards with decorative background numbers) →
 *   Bottom CTA (gradient panel).
 * - The outline-text effect on the hero subtitle uses WebkitTextStroke for dramatic
 *   typographic contrast — a deliberate aesthetic choice tied to the stadium billboard
 *   visual direction.
 * - Authenticated CTA cluster: "Explorar Partidos" (primary, FIFA orange) →
 *   "Mi Perfil" (secondary, FIFA blue) → "Cerrar Sesión" (outline). The profile
 *   link lives here because the home page has no topbar — without it, signed-in users
 *   had no discoverable entry point to /perfil from the landing.
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
      <section className="relative flex min-h-[90vh] items-center px-4 sm:px-6 lg:px-8">
        {/* Lateral glow behind headline */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 20% 50%, hsl(216 85% 25% / 0.3), transparent)',
          }}
        />

        <div className="mx-auto w-full max-w-5xl">
          {isAuthenticated && userName && (
            <p
              className="mb-4 text-sm font-medium uppercase tracking-widest text-primary"
              style={{ animation: 'fadeUp 0.5s ease both' }}
            >
              ¡Bienvenido de vuelta, {userName}!
            </p>
          )}

          <h1
            className="font-['Bebas_Neue'] leading-none tracking-wide text-foreground"
            style={{
              fontSize: 'clamp(4.5rem, 13vw, 10rem)',
              animation: 'fadeUp 0.55s ease both',
              animationDelay: '60ms',
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
            className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground"
            style={{ animation: 'fadeUp 0.55s ease both', animationDelay: '160ms' }}
          >
            La plataforma para conectar jugadores de fútbol, armar equipos y
            sumarte a partidos en tu zona.
          </p>

          <div
            className="mt-10 flex flex-wrap gap-4"
            style={{ animation: 'fadeUp 0.55s ease both', animationDelay: '260ms' }}
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
              <p className="text-xs font-medium uppercase tracking-widest text-primary">
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

          {/* MatchList already includes MatchFilters internally */}
          <MatchList isAuthenticated={isAuthenticated} />
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-3 rounded-xl p-8 text-center backdrop-blur-sm"
              style={{
                background: 'var(--color-surface-glass)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
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
                {/* Decorative background step number */}
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
          className="mx-auto max-w-5xl rounded-2xl p-12 text-center"
          style={{
            background:
              'linear-gradient(135deg, hsl(216 85% 15% / 0.55), hsl(220 72% 10% / 0.55))',
            border: '1px solid hsl(216 85% 30% / 0.35)',
          }}
        >
          <h2 className="font-['Bebas_Neue'] text-5xl tracking-wide text-foreground">
            ¿Listo para jugar?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Unite a la comunidad y encontrá tu próximo partido ahora.
          </p>
          <Button size="lg" className="mt-8 gap-2" asChild>
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
      `}</style>
    </main>
  );
};

export default HomeScreen;
