/**
 * Team Repository - DB access for permanent teams, memberships, invitations, availability.
 *
 * Decision Context:
 * - Issue #137: equipos permanentes separados de tournamentTeams.
 * - Explicit column lists en cada query (egress prevention per backend.md).
 * - Los métodos de escritura requieren un user-scoped SupabaseClient para respetar RLS.
 * - Los métodos de lectura aceptan un client opcional; fallback al singleton supabase (server-role).
 * - teamInvitations tiene dos FKs a profiles (invitedPlayerId y invitedBy); se usan los nombres
 *   de constraint exactos para que PostgREST resuelva la ambigüedad correctamente.
 * - Previously fixed bugs: none relevant.
 */

import { supabase, type SupabaseClient } from '../config/supabase.js';

// =====================================================
// Column Definitions (egress prevention)
// =====================================================

const TEAM_COLUMNS = `
  id,
  name,
  "captainId",
  "logoUrl",
  format,
  description,
  "isActive",
  "createdBy",
  "createdAt",
  "updatedAt"
`;

const PROFILE_COLUMNS = `
  id,
  "displayName",
  "avatarUrl",
  "preferredPosition"
`;

const MEMBER_COLUMNS = `
  id,
  "teamId",
  "playerId",
  role,
  "joinedAt"
`;

const INVITATION_COLUMNS = `
  id,
  "teamId",
  "invitedPlayerId",
  "invitedBy",
  status,
  message,
  "respondedAt",
  "expiresAt",
  "createdAt"
`;

const AVAILABILITY_COLUMNS = `
  id,
  "playerId",
  "teamId",
  "dayOfWeek",
  "startTime",
  "endTime",
  "isRecurrent",
  "createdAt"
`;

// =====================================================
// Row Types
// =====================================================

export interface TeamRow {
  id: string;
  name: string;
  captainId: string | null;
  logoUrl: string | null;
  format: string;
  description: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberRow {
  id: string;
  teamId: string;
  playerId: string;
  role: string;
  joinedAt: string;
}

export interface TeamInvitationRow {
  id: string;
  teamId: string;
  invitedPlayerId: string;
  invitedBy: string;
  status: string;
  message: string | null;
  respondedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface PlayerAvailabilityRow {
  id: string;
  playerId: string;
  teamId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isRecurrent: boolean;
  createdAt: string;
}

export interface ProfileRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredPosition: string | null;
}

// =====================================================
// Repository
// =====================================================

class TeamRepository {

  // --- Teams ---

  async createTeam(
    input: { name: string; format: string; description?: string | null; captainId: string; createdBy: string },
    db: SupabaseClient,
  ): Promise<TeamRow> {
    const { data, error } = await db
      .from('teams')
      .insert({
        name: input.name,
        format: input.format,
        description: input.description ?? null,
        captainId: input.captainId,
        createdBy: input.createdBy,
      })
      .select(TEAM_COLUMNS)
      .single();

    if (error) {
      console.error('[TeamRepository.createTeam] Supabase error:', error.message);
      throw new Error(error.message);
    }
    return data as TeamRow;
  }

  async getTeamById(id: string, db?: SupabaseClient): Promise<TeamRow | null> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teams')
      .select(TEAM_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[TeamRepository.getTeamById] Supabase error for teamId=${id}:`, error.message);
      throw new Error(error.message);
    }
    return data as TeamRow | null;
  }

  async getTeamWithDetails(id: string, db?: SupabaseClient): Promise<(TeamRow & {
    captain: ProfileRow | null;
    members: (TeamMemberRow & { player: ProfileRow })[];
  }) | null> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teams')
      .select(`
        ${TEAM_COLUMNS},
        captain:profiles!teams_captainId_fkey(${PROFILE_COLUMNS}),
        members:teamMembers!teamMembers_teamId_fkey(
          ${MEMBER_COLUMNS},
          player:profiles!teamMembers_playerId_fkey(${PROFILE_COLUMNS})
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[TeamRepository.getTeamWithDetails] Supabase error for teamId=${id}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as any;
  }

  async getTeamIdsByMemberId(playerId: string, db?: SupabaseClient): Promise<string[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teamMembers')
      .select('"teamId"')
      .eq('playerId', playerId);

    if (error) {
      console.error(`[TeamRepository.getTeamIdsByMemberId] Supabase error for playerId=${playerId}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => r.teamId as string);
  }

  async getTeamsByIds(ids: string[], db?: SupabaseClient): Promise<(TeamRow & {
    captain: ProfileRow | null;
    members: (TeamMemberRow & { player: ProfileRow })[];
  })[]> {
    if (ids.length === 0) return [];
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teams')
      .select(`
        ${TEAM_COLUMNS},
        captain:profiles!teams_captainId_fkey(${PROFILE_COLUMNS}),
        members:teamMembers!teamMembers_teamId_fkey(
          ${MEMBER_COLUMNS},
          player:profiles!teamMembers_playerId_fkey(${PROFILE_COLUMNS})
        )
      `)
      .in('id', ids)
      .eq('isActive', true);

    if (error) {
      console.error('[TeamRepository.getTeamsByIds] Supabase error:', error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  }

  async getTeamsByCaptainId(captainId: string, db?: SupabaseClient): Promise<TeamRow[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teams')
      .select(TEAM_COLUMNS)
      .eq('captainId', captainId)
      .eq('isActive', true);

    if (error) {
      console.error(`[TeamRepository.getTeamsByCaptainId] Supabase error for captainId=${captainId}:`, error.message);
      throw new Error(error.message);
    }
    return (data ?? []) as TeamRow[];
  }

  async updateTeam(
    id: string,
    patch: Partial<Pick<TeamRow, 'name' | 'logoUrl' | 'format' | 'description' | 'captainId' | 'isActive'>>,
    db: SupabaseClient,
  ): Promise<TeamRow | null> {
    const { data, error } = await db
      .from('teams')
      .update({ ...patch, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select(TEAM_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error(`[TeamRepository.updateTeam] Supabase error for teamId=${id}:`, error.message);
      throw new Error(error.message);
    }
    return data as TeamRow | null;
  }

  // --- Team Members ---

  async addTeamMember(teamId: string, playerId: string, role: string, db: SupabaseClient): Promise<TeamMemberRow> {
    const { data, error } = await db
      .from('teamMembers')
      .insert({ teamId, playerId, role })
      .select(MEMBER_COLUMNS)
      .single();

    if (error) {
      console.error(`[TeamRepository.addTeamMember] Supabase error for teamId=${teamId}:`, error.message);
      throw new Error(error.message);
    }
    return data as TeamMemberRow;
  }

  async getMemberRecord(teamId: string, playerId: string, db?: SupabaseClient): Promise<TeamMemberRow | null> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teamMembers')
      .select(MEMBER_COLUMNS)
      .eq('teamId', teamId)
      .eq('playerId', playerId)
      .maybeSingle();

    if (error) {
      console.error('[TeamRepository.getMemberRecord] Supabase error:', error.message);
      throw new Error(error.message);
    }
    return data as TeamMemberRow | null;
  }

  async getActiveMembers(teamId: string, db?: SupabaseClient): Promise<(TeamMemberRow & { player: ProfileRow })[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teamMembers')
      .select(`${MEMBER_COLUMNS}, player:profiles!teamMembers_playerId_fkey(${PROFILE_COLUMNS})`)
      .eq('teamId', teamId)
      .order('joinedAt', { ascending: true });

    if (error) {
      console.error(`[TeamRepository.getActiveMembers] Supabase error for teamId=${teamId}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  }

  async updateMemberRole(teamId: string, playerId: string, role: string, db: SupabaseClient): Promise<void> {
    const { error } = await db
      .from('teamMembers')
      .update({ role })
      .eq('teamId', teamId)
      .eq('playerId', playerId);

    if (error) {
      console.error('[TeamRepository.updateMemberRole] Supabase error:', error.message);
      throw new Error(error.message);
    }
  }

  async removeTeamMember(teamId: string, playerId: string, db: SupabaseClient): Promise<void> {
    const { error } = await db
      .from('teamMembers')
      .delete()
      .eq('teamId', teamId)
      .eq('playerId', playerId);

    if (error) {
      console.error('[TeamRepository.removeTeamMember] Supabase error:', error.message);
      throw new Error(error.message);
    }
  }

  // --- Invitations ---

  async createInvitation(
    input: { teamId: string; invitedPlayerId: string; invitedBy: string; message?: string | null },
    db: SupabaseClient,
  ): Promise<TeamInvitationRow> {
    const { data, error } = await db
      .from('teamInvitations')
      .insert({
        teamId: input.teamId,
        invitedPlayerId: input.invitedPlayerId,
        invitedBy: input.invitedBy,
        message: input.message ?? null,
      })
      .select(INVITATION_COLUMNS)
      .single();

    if (error) {
      console.error('[TeamRepository.createInvitation] Supabase error:', error.message);
      // Código 23505 = unique constraint violation (invitación duplicada pendiente)
      if (error.code === '23505') throw new Error('Ya existe una invitación pendiente para este jugador');
      throw new Error(error.message);
    }
    return data as TeamInvitationRow;
  }

  async getInvitationById(id: string, db?: SupabaseClient): Promise<(TeamInvitationRow & {
    team: TeamRow;
    invitedPlayer: ProfileRow;
    invitedByProfile: ProfileRow;
  }) | null> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teamInvitations')
      .select(`
        ${INVITATION_COLUMNS},
        team:teams!teamInvitations_teamId_fkey(${TEAM_COLUMNS}),
        invitedPlayer:profiles!teamInvitations_invitedPlayerId_fkey(${PROFILE_COLUMNS}),
        invitedByProfile:profiles!teamInvitations_invitedBy_fkey(${PROFILE_COLUMNS})
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[TeamRepository.getInvitationById] Supabase error for id=${id}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as any;
  }

  async getPendingInvitationsByPlayerId(playerId: string, db?: SupabaseClient): Promise<(TeamInvitationRow & {
    team: TeamRow;
    invitedPlayer: ProfileRow;
    invitedByProfile: ProfileRow;
  })[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teamInvitations')
      .select(`
        ${INVITATION_COLUMNS},
        team:teams!teamInvitations_teamId_fkey(${TEAM_COLUMNS}),
        invitedPlayer:profiles!teamInvitations_invitedPlayerId_fkey(${PROFILE_COLUMNS}),
        invitedByProfile:profiles!teamInvitations_invitedBy_fkey(${PROFILE_COLUMNS})
      `)
      .eq('invitedPlayerId', playerId)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });

    if (error) {
      console.error('[TeamRepository.getPendingInvitationsByPlayerId] Supabase error:', error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  }

  async getPendingInvitation(teamId: string, invitedPlayerId: string, db?: SupabaseClient): Promise<TeamInvitationRow | null> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teamInvitations')
      .select(INVITATION_COLUMNS)
      .eq('teamId', teamId)
      .eq('invitedPlayerId', invitedPlayerId)
      .eq('status', 'pending')
      .maybeSingle();

    if (error) {
      console.error('[TeamRepository.getPendingInvitation] Supabase error:', error.message);
      throw new Error(error.message);
    }
    return data as TeamInvitationRow | null;
  }

  async updateInvitationStatus(
    id: string,
    status: string,
    respondedAt: string | null,
    db: SupabaseClient,
  ): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (respondedAt) patch.respondedAt = respondedAt;

    const { error } = await db.from('teamInvitations').update(patch).eq('id', id);

    if (error) {
      console.error(`[TeamRepository.updateInvitationStatus] Supabase error for id=${id}:`, error.message);
      throw new Error(error.message);
    }
  }

  async deleteInvitation(id: string, db: SupabaseClient): Promise<void> {
    const { error } = await db.from('teamInvitations').delete().eq('id', id);

    if (error) {
      console.error(`[TeamRepository.deleteInvitation] Supabase error for id=${id}:`, error.message);
      throw new Error(error.message);
    }
  }

  // --- Availability ---

  async deleteAvailabilityByPlayerTeam(playerId: string, teamId: string, db: SupabaseClient): Promise<void> {
    const { error } = await db
      .from('playerAvailability')
      .delete()
      .eq('playerId', playerId)
      .eq('teamId', teamId);

    if (error) {
      console.error('[TeamRepository.deleteAvailabilityByPlayerTeam] Supabase error:', error.message);
      throw new Error(error.message);
    }
  }

  async insertAvailabilitySlots(
    slots: Array<{ playerId: string; teamId: string; dayOfWeek: number; startTime: string; endTime: string; isRecurrent: boolean }>,
    db: SupabaseClient,
  ): Promise<void> {
    if (slots.length === 0) return;
    const { error } = await db.from('playerAvailability').insert(slots);
    if (error) {
      console.error('[TeamRepository.insertAvailabilitySlots] Supabase error:', error.message);
      throw new Error(error.message);
    }
  }

  async getAvailabilityByTeam(teamId: string, db?: SupabaseClient): Promise<(PlayerAvailabilityRow & { player: ProfileRow })[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('playerAvailability')
      .select(`
        ${AVAILABILITY_COLUMNS},
        player:profiles!playerAvailability_playerId_fkey(${PROFILE_COLUMNS})
      `)
      .eq('teamId', teamId)
      .order('dayOfWeek', { ascending: true })
      .order('startTime', { ascending: true });

    if (error) {
      console.error(`[TeamRepository.getAvailabilityByTeam] Supabase error for teamId=${teamId}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  }

  async getAvailabilityByPlayerAndTeam(playerId: string, teamId: string, db?: SupabaseClient): Promise<PlayerAvailabilityRow[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('playerAvailability')
      .select(AVAILABILITY_COLUMNS)
      .eq('playerId', playerId)
      .eq('teamId', teamId)
      .order('dayOfWeek', { ascending: true })
      .order('startTime', { ascending: true });

    if (error) {
      console.error('[TeamRepository.getAvailabilityByPlayerAndTeam] Supabase error:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []) as PlayerAvailabilityRow[];
  }

  // --- Tournament Enrollment (F10) ---

  async getTournamentBasic(
    tournamentId: string,
    db?: SupabaseClient,
  ): Promise<{ id: string; name: string; status: string; format: string; teamCount: number; playersPerTeam: number } | null> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('tournaments')
      .select(`id, name, status, format, "teamCount", "playersPerTeam"`)
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) {
      console.error(`[TeamRepository.getTournamentBasic] Supabase error for tournamentId=${tournamentId}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as any;
  }

  async getFixturesByTournament(
    tournamentId: string,
    db?: SupabaseClient,
  ): Promise<{ id: string; round: number; scheduledAt: string | null; status: string }[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('fixtureMatches')
      .select(`id, round, "scheduledAt", status`)
      .eq('tournamentId', tournamentId)
      .order('round', { ascending: true });
    if (error) {
      console.error(`[TeamRepository.getFixturesByTournament] Supabase error:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  }

  async getEnrollmentByPermanentTeamAndTournament(
    teamId: string,
    tournamentId: string,
    db?: SupabaseClient,
  ): Promise<{ id: string } | null> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('tournamentTeams')
      .select('id')
      .eq('permanentTeamId', teamId)
      .eq('tournamentId', tournamentId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) {
      console.error('[TeamRepository.getEnrollmentByPermanentTeamAndTournament] Supabase error:', error.message);
      throw new Error(error.message);
    }
    return data as { id: string } | null;
  }

  async enrollPermanentTeamInTournament(
    input: { teamId: string; tournamentId: string; name: string; captainId: string },
    db: SupabaseClient,
  ): Promise<{ id: string }> {
    const { data, error } = await db
      .from('tournamentTeams')
      .insert({
        tournamentId: input.tournamentId,
        name: input.name,
        captainId: input.captainId,
        permanentTeamId: input.teamId,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[TeamRepository.enrollPermanentTeamInTournament] Supabase error:', error.message);
      throw new Error(error.message);
    }
    return data as { id: string };
  }

  async getTeamEnrollments(
    teamId: string,
    db?: SupabaseClient,
  ): Promise<{
    id: string; tournamentId: string; createdAt: string;
    tournament: { id: string; name: string; status: string; format: string; teamCount: number };
  }[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('tournamentTeams')
      .select(`
        id, "tournamentId", "createdAt",
        tournament:tournaments!tournamentTeams_tournamentId_fkey(id, name, status, format, "teamCount")
      `)
      .eq('permanentTeamId', teamId)
      .eq('status', 'active')
      .order('createdAt', { ascending: false });
    if (error) {
      console.error(`[TeamRepository.getTeamEnrollments] Supabase error for teamId=${teamId}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  }

  // --- Player Search ---

  async searchProfiles(search: string, limit = 10, db?: SupabaseClient): Promise<ProfileRow[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .ilike('displayName', `%${search}%`)
      .limit(limit);

    if (error) {
      console.error('[TeamRepository.searchProfiles] Supabase error:', error.message);
      throw new Error(error.message);
    }
    return (data ?? []) as ProfileRow[];
  }

  // --- Team Invitations (captain view) ---

  async getInvitationsByTeamId(
    teamId: string,
    db?: SupabaseClient,
  ): Promise<(TeamInvitationRow & { invitedPlayer: ProfileRow; invitedByProfile: ProfileRow })[]> {
    const client = db ?? supabase;
    const { data, error } = await client
      .from('teamInvitations')
      .select(`
        ${INVITATION_COLUMNS},
        invitedPlayer:profiles!teamInvitations_invitedPlayerId_fkey(${PROFILE_COLUMNS}),
        invitedByProfile:profiles!teamInvitations_invitedBy_fkey(${PROFILE_COLUMNS})
      `)
      .eq('teamId', teamId)
      .order('createdAt', { ascending: false });

    if (error) {
      console.error(`[TeamRepository.getInvitationsByTeamId] Supabase error for teamId=${teamId}:`, error.message);
      throw new Error(error.message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[];
  }
}

export const teamRepository = new TeamRepository();
