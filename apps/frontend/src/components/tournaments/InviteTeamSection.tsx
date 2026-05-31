/**
 * InviteTeamSection — botón + modal para invitar equipos al torneo (T5 issue #132).
 * Wrapper de InviteTeamDialog para que el organizador pueda abrirlo desde el detalle.
 */
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { InviteTeamDialog } from './InviteTeamDialog';

interface Props { tournamentId: string }

export function InviteTeamSection({ tournamentId }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="invite-team-btn" onClick={() => setOpen(true)}>
        <UserPlus size={15} strokeWidth={2} aria-hidden="true" />
        Invitar equipo
      </button>
      {open && <InviteTeamDialog tournamentId={tournamentId} onClose={() => setOpen(false)} />}
      <style>{`
        .invite-team-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.45rem 0.9rem; border-radius: 8px;
          background: rgba(27,105,224,0.12); color: hsl(216 70% 65%);
          border: 1px solid rgba(27,105,224,0.25); font-size: 0.82rem; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
        }
        .invite-team-btn:hover { background: rgba(27,105,224,0.2); }
        :global(html.light) .invite-team-btn { background: hsl(216 100% 95%); color: hsl(216 70% 35%); border-color: hsl(216 60% 75%); }
      `}</style>
    </>
  );
}
