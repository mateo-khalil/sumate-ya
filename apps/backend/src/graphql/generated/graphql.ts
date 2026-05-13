import { GraphQLResolveInfo } from 'graphql';
import { GraphQLContext } from '../../types/context.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type AffectedMatch = {
  __typename?: 'AffectedMatch';
  matchId: Scalars['ID']['output'];
  participantCount: Scalars['Int']['output'];
  scheduledAt: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type AuditProfile = {
  __typename?: 'AuditProfile';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type AvailableSlotsFilters = {
  courtIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  endDate: Scalars['String']['input'];
  includeNonBookable?: InputMaybe<Scalars['Boolean']['input']>;
  startDate: Scalars['String']['input'];
};

export type BlockSlotInput = {
  blockReason?: InputMaybe<Scalars['String']['input']>;
  blockType?: InputMaybe<BlockType>;
  confirmForce?: InputMaybe<Scalars['Boolean']['input']>;
  isBlocked: Scalars['Boolean']['input'];
  slotId: Scalars['ID']['input'];
};

export enum BlockType {
  Admin = 'ADMIN',
  Event = 'EVENT',
  Holiday = 'HOLIDAY',
  Maintenance = 'MAINTENANCE',
  Other = 'OTHER',
  Weather = 'WEATHER'
}

export type BulkBlockSlotsInput = {
  blockReason?: InputMaybe<Scalars['String']['input']>;
  blockType?: InputMaybe<BlockType>;
  confirmForce?: InputMaybe<Scalars['Boolean']['input']>;
  isBlocked: Scalars['Boolean']['input'];
  slotIds: Array<Scalars['ID']['input']>;
};

export type BulkClubMatchItem = {
  __typename?: 'BulkClubMatchItem';
  date: Scalars['String']['output'];
  matchId?: Maybe<Scalars['ID']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  slotId: Scalars['ID']['output'];
  success: Scalars['Boolean']['output'];
};

export type BulkClubMatchResult = {
  __typename?: 'BulkClubMatchResult';
  failureCount: Scalars['Int']['output'];
  results: Array<BulkClubMatchItem>;
  successCount: Scalars['Int']['output'];
  totalRequested: Scalars['Int']['output'];
};

export type BulkCreateClubMatchesInput = {
  matches: Array<CreateClubMatchInput>;
};

export type BulkSlotMutationResult = {
  __typename?: 'BulkSlotMutationResult';
  affectedCount: Scalars['Int']['output'];
  cancelledMatchesCount: Scalars['Int']['output'];
  impactPreview?: Maybe<SlotImpactPreview>;
  message?: Maybe<Scalars['String']['output']>;
  notifiedPlayersCount: Scalars['Int']['output'];
  skippedCount: Scalars['Int']['output'];
  success: Scalars['Boolean']['output'];
};

export type Club = {
  __typename?: 'Club';
  address?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  imageUrl?: Maybe<Scalars['String']['output']>;
  lat?: Maybe<Scalars['Float']['output']>;
  lng?: Maybe<Scalars['Float']['output']>;
  name: Scalars['String']['output'];
  phone?: Maybe<Scalars['String']['output']>;
  zone?: Maybe<Scalars['String']['output']>;
};

export type ClubDashboardData = {
  __typename?: 'ClubDashboardData';
  club: Club;
  conflicts: Array<ConflictAlert>;
  matches: Array<DashboardMatch>;
  metrics: ClubMetrics;
  schedule: Array<ScheduleSlot>;
};

export type ClubDashboardFilters = {
  courtIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  includeBlocked?: InputMaybe<Scalars['Boolean']['input']>;
  includeInactive?: InputMaybe<Scalars['Boolean']['input']>;
  matchStatuses?: InputMaybe<Array<MatchStatus>>;
  startDate?: InputMaybe<Scalars['String']['input']>;
};

export type ClubDetail = {
  __typename?: 'ClubDetail';
  address: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  imageUrl?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  phone?: Maybe<Scalars['String']['output']>;
  zone?: Maybe<Scalars['String']['output']>;
};

export type ClubMatchSlotOccurrence = {
  __typename?: 'ClubMatchSlotOccurrence';
  allowOnlineBooking: Scalars['Boolean']['output'];
  courtId: Scalars['ID']['output'];
  courtName: Scalars['String']['output'];
  date: Scalars['String']['output'];
  dayOfWeek: Scalars['String']['output'];
  duration: Scalars['Int']['output'];
  endTime: Scalars['String']['output'];
  hasMatch: Scalars['Boolean']['output'];
  priceArs?: Maybe<Scalars['Float']['output']>;
  scheduledAt: Scalars['String']['output'];
  slotId: Scalars['ID']['output'];
  startTime: Scalars['String']['output'];
};

export type ClubMetrics = {
  __typename?: 'ClubMetrics';
  blockedSlotsCount: Scalars['Int']['output'];
  estimatedRevenue: Scalars['Float']['output'];
  matchesThisWeek: Scalars['Int']['output'];
  occupancyRate: Scalars['Float']['output'];
  totalActiveCourts: Scalars['Int']['output'];
  uniquePlayersThisMonth: Scalars['Int']['output'];
};

export type ClubSlot = {
  __typename?: 'ClubSlot';
  clubId: Scalars['ID']['output'];
  court: Court;
  dayOfWeek: Scalars['String']['output'];
  endTime: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  priceArs?: Maybe<Scalars['Float']['output']>;
  startTime: Scalars['String']['output'];
};

export type ClubSlotMutationResult = {
  __typename?: 'ClubSlotMutationResult';
  cancelledMatchesCount: Scalars['Int']['output'];
  impactPreview?: Maybe<SlotImpactPreview>;
  message?: Maybe<Scalars['String']['output']>;
  notifiedPlayersCount: Scalars['Int']['output'];
  slot?: Maybe<ManagedClubSlot>;
  success: Scalars['Boolean']['output'];
};

export type ConflictAlert = {
  __typename?: 'ConflictAlert';
  courtName: Scalars['String']['output'];
  description: Scalars['String']['output'];
  matchId: Scalars['ID']['output'];
  scheduledAt: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type Court = {
  __typename?: 'Court';
  id: Scalars['ID']['output'];
  isIndoor: Scalars['Boolean']['output'];
  maxFormat: MatchFormat;
  name: Scalars['String']['output'];
  surface: CourtSurface;
};

export type CourtPricing = {
  __typename?: 'CourtPricing';
  basePrice: Scalars['Float']['output'];
  courtId: Scalars['ID']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  offPeakDiscount: Scalars['Float']['output'];
  peakDays: Array<Scalars['Int']['output']>;
  peakEnd?: Maybe<Scalars['String']['output']>;
  peakMultiplier: Scalars['Float']['output'];
  peakStart?: Maybe<Scalars['String']['output']>;
};

export type CourtPricingMutationResult = {
  __typename?: 'CourtPricingMutationResult';
  courtPricing?: Maybe<CourtPricing>;
  message?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export enum CourtSurface {
  Concrete = 'CONCRETE',
  Grass = 'GRASS',
  Indoor = 'INDOOR',
  Synthetic = 'SYNTHETIC'
}

export type CreateClubMatchInput = {
  autoEnrollOrganizer?: InputMaybe<Scalars['Boolean']['input']>;
  capacity: Scalars['Int']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  format: MatchFormat;
  scheduledDate: Scalars['String']['input'];
  slotId: Scalars['ID']['input'];
};

export type CreateClubMatchResult = {
  __typename?: 'CreateClubMatchResult';
  match?: Maybe<Match>;
  matchId?: Maybe<Scalars['ID']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type CreateClubSlotInput = {
  allowOnlineBooking?: InputMaybe<Scalars['Boolean']['input']>;
  courtId: Scalars['ID']['input'];
  dayOfWeek: Scalars['String']['input'];
  duration?: InputMaybe<Scalars['Int']['input']>;
  endTime: Scalars['String']['input'];
  priceArs?: InputMaybe<Scalars['Float']['input']>;
  startTime: Scalars['String']['input'];
};

export type CreateMatchInput = {
  capacity: Scalars['Int']['input'];
  clubId: Scalars['ID']['input'];
  courtId: Scalars['ID']['input'];
  date: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  format: MatchFormat;
  slotId: Scalars['ID']['input'];
};

export type CreateMatchResult = {
  __typename?: 'CreateMatchResult';
  matchId?: Maybe<Scalars['ID']['output']>;
  message?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type CreateTournamentInput = {
  clubId: Scalars['ID']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  format: MatchFormat;
  name: Scalars['String']['input'];
  playersPerTeam: Scalars['Int']['input'];
  schedule: Array<TournamentScheduleSlotInput>;
  teamCount: Scalars['Int']['input'];
};

export type CreateTournamentResult = {
  __typename?: 'CreateTournamentResult';
  message?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
  tournament?: Maybe<Tournament>;
  tournamentId?: Maybe<Scalars['ID']['output']>;
};

export type DashboardMatch = {
  __typename?: 'DashboardMatch';
  capacity: Scalars['Int']['output'];
  clubSlotId?: Maybe<Scalars['ID']['output']>;
  courtId?: Maybe<Scalars['ID']['output']>;
  courtName?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  format: MatchFormat;
  id: Scalars['ID']['output'];
  organizer: ProfileSummary;
  participantCount: Scalars['Int']['output'];
  participants: Array<ProfileSummary>;
  scheduledAt: Scalars['String']['output'];
  spotsLeft: Scalars['Int']['output'];
  status: MatchStatus;
  timeStatus: TimeStatus;
  timeStatusLabel: Scalars['String']['output'];
};

export enum FixtureMatchStatus {
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  InProgress = 'IN_PROGRESS',
  Scheduled = 'SCHEDULED'
}

export type JoinMatchInput = {
  matchId: Scalars['ID']['input'];
  team: MatchTeam;
};

export type JoinMatchResult = {
  __typename?: 'JoinMatchResult';
  match?: Maybe<Match>;
  message?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
};

export type LeaveMatchInput = {
  matchId: Scalars['ID']['input'];
};

export type LeaveMatchResult = {
  __typename?: 'LeaveMatchResult';
  match?: Maybe<Match>;
  matchDeleted: Scalars['Boolean']['output'];
};

export type ManagedClubSlot = {
  __typename?: 'ManagedClubSlot';
  allowOnlineBooking: Scalars['Boolean']['output'];
  blockReason?: Maybe<Scalars['String']['output']>;
  blockType?: Maybe<BlockType>;
  clubId: Scalars['ID']['output'];
  court: Court;
  courtId: Scalars['ID']['output'];
  dayOfWeek: Scalars['String']['output'];
  duration: Scalars['Int']['output'];
  endTime: Scalars['String']['output'];
  hasScheduledMatch: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  isBlocked: Scalars['Boolean']['output'];
  priceArs?: Maybe<Scalars['Float']['output']>;
  startTime: Scalars['String']['output'];
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type Match = {
  __typename?: 'Match';
  availableSlots: Scalars['Int']['output'];
  canJoin?: Maybe<Scalars['Boolean']['output']>;
  club?: Maybe<Club>;
  createdAt: Scalars['String']['output'];
  currentUserTeam?: Maybe<MatchTeam>;
  description?: Maybe<Scalars['String']['output']>;
  format: MatchFormat;
  id: Scalars['ID']['output'];
  isCurrentUserJoined?: Maybe<Scalars['Boolean']['output']>;
  organizedByClub?: Maybe<Scalars['Boolean']['output']>;
  organizerId?: Maybe<Scalars['ID']['output']>;
  participants?: Maybe<MatchParticipantsData>;
  startTime: Scalars['String']['output'];
  status: MatchStatus;
  title: Scalars['String']['output'];
  totalSlots: Scalars['Int']['output'];
};

export type MatchFilters = {
  dateFrom?: InputMaybe<Scalars['String']['input']>;
  dateTo?: InputMaybe<Scalars['String']['input']>;
  format?: InputMaybe<MatchFormat>;
  onlyMine?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<MatchStatus>;
  zone?: InputMaybe<Scalars['String']['input']>;
};

export enum MatchFormat {
  ElevenVsEleven = 'ELEVEN_VS_ELEVEN',
  FiveVsFive = 'FIVE_VS_FIVE',
  SevenVsSeven = 'SEVEN_VS_SEVEN',
  TenVsTen = 'TEN_VS_TEN'
}

export type MatchHistoryConnection = {
  __typename?: 'MatchHistoryConnection';
  hasMore: Scalars['Boolean']['output'];
  items: Array<MatchHistoryItem>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type MatchHistoryItem = {
  __typename?: 'MatchHistoryItem';
  club?: Maybe<Club>;
  format: MatchFormat;
  id: Scalars['ID']['output'];
  isOrganizer: Scalars['Boolean']['output'];
  scoreA?: Maybe<Scalars['Int']['output']>;
  scoreB?: Maybe<Scalars['Int']['output']>;
  startTime: Scalars['String']['output'];
  title: Scalars['String']['output'];
  userResult: MatchUserResult;
  userTeam: Scalars['String']['output'];
};

export type MatchParticipantsData = {
  __typename?: 'MatchParticipantsData';
  spotsLeftA: Scalars['Int']['output'];
  spotsLeftB: Scalars['Int']['output'];
  teamA: Array<TeamMember>;
  teamACount: Scalars['Int']['output'];
  teamB: Array<TeamMember>;
  teamBCount: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type MatchResultSubmission = {
  __typename?: 'MatchResultSubmission';
  approveCount: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  hasUserVoted: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  matchId: Scalars['ID']['output'];
  rejectCount: Scalars['Int']['output'];
  scoreA: Scalars['Int']['output'];
  scoreB: Scalars['Int']['output'];
  status: SubmissionStatus;
  submitter: TeamMember;
  userVote?: Maybe<VoteValue>;
  votes: Array<MatchResultVote>;
  winnerTeam: WinnerTeam;
};

export type MatchResultVote = {
  __typename?: 'MatchResultVote';
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  vote: VoteValue;
  voter: TeamMember;
};

export enum MatchStatus {
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  Full = 'FULL',
  InProgress = 'IN_PROGRESS',
  Open = 'OPEN'
}

export enum MatchTeam {
  A = 'A',
  B = 'B'
}

export enum MatchUserResult {
  Draw = 'DRAW',
  Lost = 'LOST',
  Pending = 'PENDING',
  Won = 'WON'
}

export type Mutation = {
  __typename?: 'Mutation';
  bulkBlockSlots: BulkSlotMutationResult;
  bulkCreateClubMatches: BulkClubMatchResult;
  createClubMatch: CreateClubMatchResult;
  createClubSlot: ClubSlotMutationResult;
  createMatch: CreateMatchResult;
  createTournament: CreateTournamentResult;
  deleteClubSlot: ClubSlotMutationResult;
  joinMatch: JoinMatchResult;
  leaveMatch: LeaveMatchResult;
  proposeMatchResult: MatchResultSubmission;
  registerTournamentTeam: TournamentTeamRegistrationResult;
  toggleSlotBlock: ClubSlotMutationResult;
  updateClubSlot: ClubSlotMutationResult;
  updateCourtPricing: CourtPricingMutationResult;
  updatePrivacy: PrivacySettings;
  voteMatchResult: VoteSubmissionResult;
};


export type MutationBulkBlockSlotsArgs = {
  input: BulkBlockSlotsInput;
};


export type MutationBulkCreateClubMatchesArgs = {
  input: BulkCreateClubMatchesInput;
};


export type MutationCreateClubMatchArgs = {
  input: CreateClubMatchInput;
};


export type MutationCreateClubSlotArgs = {
  input: CreateClubSlotInput;
};


export type MutationCreateMatchArgs = {
  input: CreateMatchInput;
};


export type MutationCreateTournamentArgs = {
  input: CreateTournamentInput;
};


export type MutationDeleteClubSlotArgs = {
  slotId: Scalars['ID']['input'];
};


export type MutationJoinMatchArgs = {
  input: JoinMatchInput;
};


export type MutationLeaveMatchArgs = {
  input: LeaveMatchInput;
};


export type MutationProposeMatchResultArgs = {
  input: ProposeMatchResultInput;
};


export type MutationRegisterTournamentTeamArgs = {
  input: RegisterTournamentTeamInput;
};


export type MutationToggleSlotBlockArgs = {
  input: BlockSlotInput;
};


export type MutationUpdateClubSlotArgs = {
  input: UpdateClubSlotInput;
};


export type MutationUpdateCourtPricingArgs = {
  input: UpdateCourtPricingInput;
};


export type MutationUpdatePrivacyArgs = {
  input: UpdatePrivacyInput;
};


export type MutationVoteMatchResultArgs = {
  input: VoteMatchResultInput;
};

export enum PlayerPosition {
  Defender = 'DEFENDER',
  Forward = 'FORWARD',
  Goalkeeper = 'GOALKEEPER',
  Midfielder = 'MIDFIELDER'
}

export type PrivacySettings = {
  __typename?: 'PrivacySettings';
  isPublic: Scalars['Boolean']['output'];
  showDivision: Scalars['Boolean']['output'];
  showHistory: Scalars['Boolean']['output'];
  showPosition: Scalars['Boolean']['output'];
  showStats: Scalars['Boolean']['output'];
};

export type Profile = {
  __typename?: 'Profile';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  division?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  isPrivate?: Maybe<Scalars['Boolean']['output']>;
  matchesPlayed?: Maybe<Scalars['Int']['output']>;
  matchesWon?: Maybe<Scalars['Int']['output']>;
  preferredPosition?: Maybe<PlayerPosition>;
  role: UserRole;
  winrate?: Maybe<Scalars['Float']['output']>;
};

export type ProfileSummary = {
  __typename?: 'ProfileSummary';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type ProposeMatchResultInput = {
  matchId: Scalars['ID']['input'];
  scoreA: Scalars['Int']['input'];
  scoreB: Scalars['Int']['input'];
  winnerTeam?: InputMaybe<WinnerTeam>;
};

export type Query = {
  __typename?: 'Query';
  availableSlotsForClubMatch: Array<ClubMatchSlotOccurrence>;
  clubDashboard: ClubDashboardData;
  clubMetrics: ClubMetrics;
  clubSlots: Array<ClubSlot>;
  clubSlotsByCourt: Array<ManagedClubSlot>;
  clubs: Array<ClubDetail>;
  courtPricing?: Maybe<CourtPricing>;
  exportClubSchedule: Scalars['String']['output'];
  match?: Maybe<Match>;
  matchResultSubmissions: Array<MatchResultSubmission>;
  matches: Array<Match>;
  myClubSlots: Array<ManagedClubSlot>;
  myMatches: MatchHistoryConnection;
  myProfile: Profile;
  mySettings: PrivacySettings;
  profile?: Maybe<Profile>;
  slotAuditLog: Array<SlotAuditLog>;
  slotImpactPreview: SlotImpactPreview;
  tournaments: Array<Tournament>;
};


export type QueryAvailableSlotsForClubMatchArgs = {
  filters: AvailableSlotsFilters;
};


export type QueryClubDashboardArgs = {
  filters?: InputMaybe<ClubDashboardFilters>;
};


export type QueryClubSlotsArgs = {
  clubId: Scalars['ID']['input'];
  date: Scalars['String']['input'];
};


export type QueryClubSlotsByCourtArgs = {
  courtId: Scalars['ID']['input'];
};


export type QueryCourtPricingArgs = {
  courtId: Scalars['ID']['input'];
};


export type QueryExportClubScheduleArgs = {
  filters?: InputMaybe<ClubDashboardFilters>;
  format?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMatchArgs = {
  id: Scalars['ID']['input'];
};


export type QueryMatchResultSubmissionsArgs = {
  matchId: Scalars['ID']['input'];
};


export type QueryMatchesArgs = {
  filters?: InputMaybe<MatchFilters>;
};


export type QueryMyMatchesArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryProfileArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySlotAuditLogArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  slotId: Scalars['ID']['input'];
};


export type QuerySlotImpactPreviewArgs = {
  slotIds: Array<Scalars['ID']['input']>;
};

export type RegisterTournamentTeamInput = {
  name: Scalars['String']['input'];
  tournamentId: Scalars['ID']['input'];
};

export type ScheduleSlot = {
  __typename?: 'ScheduleSlot';
  allowOnlineBooking: Scalars['Boolean']['output'];
  blockReason?: Maybe<Scalars['String']['output']>;
  blockType?: Maybe<Scalars['String']['output']>;
  courtId: Scalars['ID']['output'];
  courtName: Scalars['String']['output'];
  dayOfWeek: Scalars['String']['output'];
  duration: Scalars['Int']['output'];
  endTime: Scalars['String']['output'];
  isActive: Scalars['Boolean']['output'];
  match?: Maybe<DashboardMatch>;
  priceArs?: Maybe<Scalars['Float']['output']>;
  slotId: Scalars['ID']['output'];
  startTime: Scalars['String']['output'];
  status: ScheduleSlotStatus;
};

export enum ScheduleSlotStatus {
  Available = 'AVAILABLE',
  Blocked = 'BLOCKED',
  Inactive = 'INACTIVE',
  MatchCompleted = 'MATCH_COMPLETED',
  MatchFull = 'MATCH_FULL',
  MatchInProgress = 'MATCH_IN_PROGRESS',
  MatchOpen = 'MATCH_OPEN',
  Past = 'PAST'
}

export enum SlotAction {
  Blocked = 'BLOCKED',
  Created = 'CREATED',
  Deleted = 'DELETED',
  PriceChanged = 'PRICE_CHANGED',
  Unblocked = 'UNBLOCKED',
  Updated = 'UPDATED'
}

export type SlotAuditLog = {
  __typename?: 'SlotAuditLog';
  action: SlotAction;
  changedBy?: Maybe<AuditProfile>;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  newValue?: Maybe<Scalars['String']['output']>;
  previousValue?: Maybe<Scalars['String']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
  slotId?: Maybe<Scalars['ID']['output']>;
};

export type SlotImpactPreview = {
  __typename?: 'SlotImpactPreview';
  matchDetails: Array<AffectedMatch>;
  matchesAffected: Scalars['Int']['output'];
  playersToNotify: Scalars['Int']['output'];
  totalSlotsAffected: Scalars['Int']['output'];
};

export enum SubmissionStatus {
  Confirmed = 'CONFIRMED',
  Pending = 'PENDING',
  Rejected = 'REJECTED'
}

export type TeamMember = {
  __typename?: 'TeamMember';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  preferredPosition?: Maybe<Scalars['String']['output']>;
};

export enum TimeStatus {
  FarFuture = 'FAR_FUTURE',
  FinishedRecently = 'FINISHED_RECENTLY',
  Now = 'NOW',
  Past = 'PAST',
  Upcoming = 'UPCOMING',
  UpcomingSoon = 'UPCOMING_SOON'
}

export type Tournament = {
  __typename?: 'Tournament';
  club?: Maybe<TournamentClub>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  endDate?: Maybe<Scalars['String']['output']>;
  fixtureMatches: Array<TournamentFixtureMatch>;
  format: MatchFormat;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  organizerId: Scalars['ID']['output'];
  playersPerTeam: Scalars['Int']['output'];
  registeredTeamsCount: Scalars['Int']['output'];
  startDate?: Maybe<Scalars['String']['output']>;
  status: TournamentStatus;
  teamCount: Scalars['Int']['output'];
};

export type TournamentClub = {
  __typename?: 'TournamentClub';
  address?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  imageUrl?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  zone?: Maybe<Scalars['String']['output']>;
};

export type TournamentFixtureMatch = {
  __typename?: 'TournamentFixtureMatch';
  awayTeamId?: Maybe<Scalars['ID']['output']>;
  courtId?: Maybe<Scalars['ID']['output']>;
  homeTeamId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  round: Scalars['Int']['output'];
  scheduledAt?: Maybe<Scalars['String']['output']>;
  status: FixtureMatchStatus;
  tournamentId: Scalars['ID']['output'];
};

export type TournamentScheduleSlotInput = {
  date: Scalars['String']['input'];
  slotId: Scalars['ID']['input'];
};

export enum TournamentStatus {
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  InProgress = 'IN_PROGRESS',
  Registration = 'REGISTRATION'
}

export type TournamentTeamRegistrationResult = {
  __typename?: 'TournamentTeamRegistrationResult';
  message?: Maybe<Scalars['String']['output']>;
  success: Scalars['Boolean']['output'];
  teamId?: Maybe<Scalars['ID']['output']>;
  tournament?: Maybe<Tournament>;
};

export type UpdateClubSlotInput = {
  allowOnlineBooking?: InputMaybe<Scalars['Boolean']['input']>;
  duration?: InputMaybe<Scalars['Int']['input']>;
  endTime?: InputMaybe<Scalars['String']['input']>;
  priceArs?: InputMaybe<Scalars['Float']['input']>;
  slotId: Scalars['ID']['input'];
  startTime?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCourtPricingInput = {
  basePrice: Scalars['Float']['input'];
  courtId: Scalars['ID']['input'];
  offPeakDiscount?: InputMaybe<Scalars['Float']['input']>;
  peakDays?: InputMaybe<Array<Scalars['Int']['input']>>;
  peakEnd?: InputMaybe<Scalars['String']['input']>;
  peakMultiplier?: InputMaybe<Scalars['Float']['input']>;
  peakStart?: InputMaybe<Scalars['String']['input']>;
};

export type UpdatePrivacyInput = {
  isPublic?: InputMaybe<Scalars['Boolean']['input']>;
  showDivision?: InputMaybe<Scalars['Boolean']['input']>;
  showHistory?: InputMaybe<Scalars['Boolean']['input']>;
  showPosition?: InputMaybe<Scalars['Boolean']['input']>;
  showStats?: InputMaybe<Scalars['Boolean']['input']>;
};

export enum UserRole {
  ClubAdmin = 'CLUB_ADMIN',
  Player = 'PLAYER'
}

export type VoteMatchResultInput = {
  submissionId: Scalars['ID']['input'];
  vote: VoteValue;
};

export type VoteSubmissionResult = {
  __typename?: 'VoteSubmissionResult';
  statusChanged: Scalars['Boolean']['output'];
  submission: MatchResultSubmission;
};

export enum VoteValue {
  Approve = 'APPROVE',
  Reject = 'REJECT'
}

export enum WinnerTeam {
  A = 'A',
  B = 'B',
  Draw = 'DRAW'
}

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  AffectedMatch: ResolverTypeWrapper<AffectedMatch>;
  AuditProfile: ResolverTypeWrapper<AuditProfile>;
  AvailableSlotsFilters: AvailableSlotsFilters;
  BlockSlotInput: BlockSlotInput;
  BlockType: BlockType;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  BulkBlockSlotsInput: BulkBlockSlotsInput;
  BulkClubMatchItem: ResolverTypeWrapper<BulkClubMatchItem>;
  BulkClubMatchResult: ResolverTypeWrapper<BulkClubMatchResult>;
  BulkCreateClubMatchesInput: BulkCreateClubMatchesInput;
  BulkSlotMutationResult: ResolverTypeWrapper<BulkSlotMutationResult>;
  Club: ResolverTypeWrapper<Club>;
  ClubDashboardData: ResolverTypeWrapper<ClubDashboardData>;
  ClubDashboardFilters: ClubDashboardFilters;
  ClubDetail: ResolverTypeWrapper<ClubDetail>;
  ClubMatchSlotOccurrence: ResolverTypeWrapper<ClubMatchSlotOccurrence>;
  ClubMetrics: ResolverTypeWrapper<ClubMetrics>;
  ClubSlot: ResolverTypeWrapper<ClubSlot>;
  ClubSlotMutationResult: ResolverTypeWrapper<ClubSlotMutationResult>;
  ConflictAlert: ResolverTypeWrapper<ConflictAlert>;
  Court: ResolverTypeWrapper<Court>;
  CourtPricing: ResolverTypeWrapper<CourtPricing>;
  CourtPricingMutationResult: ResolverTypeWrapper<CourtPricingMutationResult>;
  CourtSurface: CourtSurface;
  CreateClubMatchInput: CreateClubMatchInput;
  CreateClubMatchResult: ResolverTypeWrapper<CreateClubMatchResult>;
  CreateClubSlotInput: CreateClubSlotInput;
  CreateMatchInput: CreateMatchInput;
  CreateMatchResult: ResolverTypeWrapper<CreateMatchResult>;
  CreateTournamentInput: CreateTournamentInput;
  CreateTournamentResult: ResolverTypeWrapper<CreateTournamentResult>;
  DashboardMatch: ResolverTypeWrapper<DashboardMatch>;
  FixtureMatchStatus: FixtureMatchStatus;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JoinMatchInput: JoinMatchInput;
  JoinMatchResult: ResolverTypeWrapper<JoinMatchResult>;
  LeaveMatchInput: LeaveMatchInput;
  LeaveMatchResult: ResolverTypeWrapper<LeaveMatchResult>;
  ManagedClubSlot: ResolverTypeWrapper<ManagedClubSlot>;
  Match: ResolverTypeWrapper<Match>;
  MatchFilters: MatchFilters;
  MatchFormat: MatchFormat;
  MatchHistoryConnection: ResolverTypeWrapper<MatchHistoryConnection>;
  MatchHistoryItem: ResolverTypeWrapper<MatchHistoryItem>;
  MatchParticipantsData: ResolverTypeWrapper<MatchParticipantsData>;
  MatchResultSubmission: ResolverTypeWrapper<MatchResultSubmission>;
  MatchResultVote: ResolverTypeWrapper<MatchResultVote>;
  MatchStatus: MatchStatus;
  MatchTeam: MatchTeam;
  MatchUserResult: MatchUserResult;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  PlayerPosition: PlayerPosition;
  PrivacySettings: ResolverTypeWrapper<PrivacySettings>;
  Profile: ResolverTypeWrapper<Profile>;
  ProfileSummary: ResolverTypeWrapper<ProfileSummary>;
  ProposeMatchResultInput: ProposeMatchResultInput;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  RegisterTournamentTeamInput: RegisterTournamentTeamInput;
  ScheduleSlot: ResolverTypeWrapper<ScheduleSlot>;
  ScheduleSlotStatus: ScheduleSlotStatus;
  SlotAction: SlotAction;
  SlotAuditLog: ResolverTypeWrapper<SlotAuditLog>;
  SlotImpactPreview: ResolverTypeWrapper<SlotImpactPreview>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  SubmissionStatus: SubmissionStatus;
  TeamMember: ResolverTypeWrapper<TeamMember>;
  TimeStatus: TimeStatus;
  Tournament: ResolverTypeWrapper<Tournament>;
  TournamentClub: ResolverTypeWrapper<TournamentClub>;
  TournamentFixtureMatch: ResolverTypeWrapper<TournamentFixtureMatch>;
  TournamentScheduleSlotInput: TournamentScheduleSlotInput;
  TournamentStatus: TournamentStatus;
  TournamentTeamRegistrationResult: ResolverTypeWrapper<TournamentTeamRegistrationResult>;
  UpdateClubSlotInput: UpdateClubSlotInput;
  UpdateCourtPricingInput: UpdateCourtPricingInput;
  UpdatePrivacyInput: UpdatePrivacyInput;
  UserRole: UserRole;
  VoteMatchResultInput: VoteMatchResultInput;
  VoteSubmissionResult: ResolverTypeWrapper<VoteSubmissionResult>;
  VoteValue: VoteValue;
  WinnerTeam: WinnerTeam;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  AffectedMatch: AffectedMatch;
  AuditProfile: AuditProfile;
  AvailableSlotsFilters: AvailableSlotsFilters;
  BlockSlotInput: BlockSlotInput;
  Boolean: Scalars['Boolean']['output'];
  BulkBlockSlotsInput: BulkBlockSlotsInput;
  BulkClubMatchItem: BulkClubMatchItem;
  BulkClubMatchResult: BulkClubMatchResult;
  BulkCreateClubMatchesInput: BulkCreateClubMatchesInput;
  BulkSlotMutationResult: BulkSlotMutationResult;
  Club: Club;
  ClubDashboardData: ClubDashboardData;
  ClubDashboardFilters: ClubDashboardFilters;
  ClubDetail: ClubDetail;
  ClubMatchSlotOccurrence: ClubMatchSlotOccurrence;
  ClubMetrics: ClubMetrics;
  ClubSlot: ClubSlot;
  ClubSlotMutationResult: ClubSlotMutationResult;
  ConflictAlert: ConflictAlert;
  Court: Court;
  CourtPricing: CourtPricing;
  CourtPricingMutationResult: CourtPricingMutationResult;
  CreateClubMatchInput: CreateClubMatchInput;
  CreateClubMatchResult: CreateClubMatchResult;
  CreateClubSlotInput: CreateClubSlotInput;
  CreateMatchInput: CreateMatchInput;
  CreateMatchResult: CreateMatchResult;
  CreateTournamentInput: CreateTournamentInput;
  CreateTournamentResult: CreateTournamentResult;
  DashboardMatch: DashboardMatch;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JoinMatchInput: JoinMatchInput;
  JoinMatchResult: JoinMatchResult;
  LeaveMatchInput: LeaveMatchInput;
  LeaveMatchResult: LeaveMatchResult;
  ManagedClubSlot: ManagedClubSlot;
  Match: Match;
  MatchFilters: MatchFilters;
  MatchHistoryConnection: MatchHistoryConnection;
  MatchHistoryItem: MatchHistoryItem;
  MatchParticipantsData: MatchParticipantsData;
  MatchResultSubmission: MatchResultSubmission;
  MatchResultVote: MatchResultVote;
  Mutation: Record<PropertyKey, never>;
  PrivacySettings: PrivacySettings;
  Profile: Profile;
  ProfileSummary: ProfileSummary;
  ProposeMatchResultInput: ProposeMatchResultInput;
  Query: Record<PropertyKey, never>;
  RegisterTournamentTeamInput: RegisterTournamentTeamInput;
  ScheduleSlot: ScheduleSlot;
  SlotAuditLog: SlotAuditLog;
  SlotImpactPreview: SlotImpactPreview;
  String: Scalars['String']['output'];
  TeamMember: TeamMember;
  Tournament: Tournament;
  TournamentClub: TournamentClub;
  TournamentFixtureMatch: TournamentFixtureMatch;
  TournamentScheduleSlotInput: TournamentScheduleSlotInput;
  TournamentTeamRegistrationResult: TournamentTeamRegistrationResult;
  UpdateClubSlotInput: UpdateClubSlotInput;
  UpdateCourtPricingInput: UpdateCourtPricingInput;
  UpdatePrivacyInput: UpdatePrivacyInput;
  VoteMatchResultInput: VoteMatchResultInput;
  VoteSubmissionResult: VoteSubmissionResult;
}>;

export type AffectedMatchResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AffectedMatch'] = ResolversParentTypes['AffectedMatch']> = ResolversObject<{
  matchId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  participantCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  scheduledAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type AuditProfileResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['AuditProfile'] = ResolversParentTypes['AuditProfile']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
}>;

export type BulkClubMatchItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BulkClubMatchItem'] = ResolversParentTypes['BulkClubMatchItem']> = ResolversObject<{
  date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  matchId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  slotId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type BulkClubMatchResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BulkClubMatchResult'] = ResolversParentTypes['BulkClubMatchResult']> = ResolversObject<{
  failureCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  results?: Resolver<Array<ResolversTypes['BulkClubMatchItem']>, ParentType, ContextType>;
  successCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalRequested?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type BulkSlotMutationResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['BulkSlotMutationResult'] = ResolversParentTypes['BulkSlotMutationResult']> = ResolversObject<{
  affectedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  cancelledMatchesCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  impactPreview?: Resolver<Maybe<ResolversTypes['SlotImpactPreview']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  notifiedPlayersCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  skippedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type ClubResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Club'] = ResolversParentTypes['Club']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lat?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  lng?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  zone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type ClubDashboardDataResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubDashboardData'] = ResolversParentTypes['ClubDashboardData']> = ResolversObject<{
  club?: Resolver<ResolversTypes['Club'], ParentType, ContextType>;
  conflicts?: Resolver<Array<ResolversTypes['ConflictAlert']>, ParentType, ContextType>;
  matches?: Resolver<Array<ResolversTypes['DashboardMatch']>, ParentType, ContextType>;
  metrics?: Resolver<ResolversTypes['ClubMetrics'], ParentType, ContextType>;
  schedule?: Resolver<Array<ResolversTypes['ScheduleSlot']>, ParentType, ContextType>;
}>;

export type ClubDetailResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubDetail'] = ResolversParentTypes['ClubDetail']> = ResolversObject<{
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  zone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type ClubMatchSlotOccurrenceResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubMatchSlotOccurrence'] = ResolversParentTypes['ClubMatchSlotOccurrence']> = ResolversObject<{
  allowOnlineBooking?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  courtId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  courtName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  dayOfWeek?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  duration?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  endTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  hasMatch?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  priceArs?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  scheduledAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slotId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  startTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type ClubMetricsResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubMetrics'] = ResolversParentTypes['ClubMetrics']> = ResolversObject<{
  blockedSlotsCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  estimatedRevenue?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  matchesThisWeek?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  occupancyRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  totalActiveCourts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  uniquePlayersThisMonth?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type ClubSlotResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubSlot'] = ResolversParentTypes['ClubSlot']> = ResolversObject<{
  clubId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  court?: Resolver<ResolversTypes['Court'], ParentType, ContextType>;
  dayOfWeek?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  endTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  priceArs?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  startTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type ClubSlotMutationResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubSlotMutationResult'] = ResolversParentTypes['ClubSlotMutationResult']> = ResolversObject<{
  cancelledMatchesCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  impactPreview?: Resolver<Maybe<ResolversTypes['SlotImpactPreview']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  notifiedPlayersCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  slot?: Resolver<Maybe<ResolversTypes['ManagedClubSlot']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type ConflictAlertResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ConflictAlert'] = ResolversParentTypes['ConflictAlert']> = ResolversObject<{
  courtName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  matchId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  scheduledAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type CourtResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Court'] = ResolversParentTypes['Court']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isIndoor?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  maxFormat?: Resolver<ResolversTypes['MatchFormat'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  surface?: Resolver<ResolversTypes['CourtSurface'], ParentType, ContextType>;
}>;

export type CourtPricingResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CourtPricing'] = ResolversParentTypes['CourtPricing']> = ResolversObject<{
  basePrice?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  courtId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  offPeakDiscount?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  peakDays?: Resolver<Array<ResolversTypes['Int']>, ParentType, ContextType>;
  peakEnd?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  peakMultiplier?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  peakStart?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type CourtPricingMutationResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CourtPricingMutationResult'] = ResolversParentTypes['CourtPricingMutationResult']> = ResolversObject<{
  courtPricing?: Resolver<Maybe<ResolversTypes['CourtPricing']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type CreateClubMatchResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CreateClubMatchResult'] = ResolversParentTypes['CreateClubMatchResult']> = ResolversObject<{
  match?: Resolver<Maybe<ResolversTypes['Match']>, ParentType, ContextType>;
  matchId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type CreateMatchResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CreateMatchResult'] = ResolversParentTypes['CreateMatchResult']> = ResolversObject<{
  matchId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type CreateTournamentResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CreateTournamentResult'] = ResolversParentTypes['CreateTournamentResult']> = ResolversObject<{
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  tournament?: Resolver<Maybe<ResolversTypes['Tournament']>, ParentType, ContextType>;
  tournamentId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
}>;

export type DashboardMatchResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['DashboardMatch'] = ResolversParentTypes['DashboardMatch']> = ResolversObject<{
  capacity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  clubSlotId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  courtId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  courtName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  format?: Resolver<ResolversTypes['MatchFormat'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  organizer?: Resolver<ResolversTypes['ProfileSummary'], ParentType, ContextType>;
  participantCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  participants?: Resolver<Array<ResolversTypes['ProfileSummary']>, ParentType, ContextType>;
  scheduledAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  spotsLeft?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['MatchStatus'], ParentType, ContextType>;
  timeStatus?: Resolver<ResolversTypes['TimeStatus'], ParentType, ContextType>;
  timeStatusLabel?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type JoinMatchResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['JoinMatchResult'] = ResolversParentTypes['JoinMatchResult']> = ResolversObject<{
  match?: Resolver<Maybe<ResolversTypes['Match']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type LeaveMatchResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['LeaveMatchResult'] = ResolversParentTypes['LeaveMatchResult']> = ResolversObject<{
  match?: Resolver<Maybe<ResolversTypes['Match']>, ParentType, ContextType>;
  matchDeleted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type ManagedClubSlotResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ManagedClubSlot'] = ResolversParentTypes['ManagedClubSlot']> = ResolversObject<{
  allowOnlineBooking?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  blockReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  blockType?: Resolver<Maybe<ResolversTypes['BlockType']>, ParentType, ContextType>;
  clubId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  court?: Resolver<ResolversTypes['Court'], ParentType, ContextType>;
  courtId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  dayOfWeek?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  duration?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  endTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  hasScheduledMatch?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isActive?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isBlocked?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  priceArs?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  startTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type MatchResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Match'] = ResolversParentTypes['Match']> = ResolversObject<{
  availableSlots?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  canJoin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  club?: Resolver<Maybe<ResolversTypes['Club']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  currentUserTeam?: Resolver<Maybe<ResolversTypes['MatchTeam']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  format?: Resolver<ResolversTypes['MatchFormat'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isCurrentUserJoined?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  organizedByClub?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  organizerId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  participants?: Resolver<Maybe<ResolversTypes['MatchParticipantsData']>, ParentType, ContextType>;
  startTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['MatchStatus'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  totalSlots?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type MatchHistoryConnectionResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MatchHistoryConnection'] = ResolversParentTypes['MatchHistoryConnection']> = ResolversObject<{
  hasMore?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  items?: Resolver<Array<ResolversTypes['MatchHistoryItem']>, ParentType, ContextType>;
  page?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  pageSize?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type MatchHistoryItemResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MatchHistoryItem'] = ResolversParentTypes['MatchHistoryItem']> = ResolversObject<{
  club?: Resolver<Maybe<ResolversTypes['Club']>, ParentType, ContextType>;
  format?: Resolver<ResolversTypes['MatchFormat'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isOrganizer?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  scoreA?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  scoreB?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userResult?: Resolver<ResolversTypes['MatchUserResult'], ParentType, ContextType>;
  userTeam?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
}>;

export type MatchParticipantsDataResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MatchParticipantsData'] = ResolversParentTypes['MatchParticipantsData']> = ResolversObject<{
  spotsLeftA?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  spotsLeftB?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  teamA?: Resolver<Array<ResolversTypes['TeamMember']>, ParentType, ContextType>;
  teamACount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  teamB?: Resolver<Array<ResolversTypes['TeamMember']>, ParentType, ContextType>;
  teamBCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type MatchResultSubmissionResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MatchResultSubmission'] = ResolversParentTypes['MatchResultSubmission']> = ResolversObject<{
  approveCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  hasUserVoted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  matchId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  rejectCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  scoreA?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  scoreB?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['SubmissionStatus'], ParentType, ContextType>;
  submitter?: Resolver<ResolversTypes['TeamMember'], ParentType, ContextType>;
  userVote?: Resolver<Maybe<ResolversTypes['VoteValue']>, ParentType, ContextType>;
  votes?: Resolver<Array<ResolversTypes['MatchResultVote']>, ParentType, ContextType>;
  winnerTeam?: Resolver<ResolversTypes['WinnerTeam'], ParentType, ContextType>;
}>;

export type MatchResultVoteResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['MatchResultVote'] = ResolversParentTypes['MatchResultVote']> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  vote?: Resolver<ResolversTypes['VoteValue'], ParentType, ContextType>;
  voter?: Resolver<ResolversTypes['TeamMember'], ParentType, ContextType>;
}>;

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  bulkBlockSlots?: Resolver<ResolversTypes['BulkSlotMutationResult'], ParentType, ContextType, RequireFields<MutationBulkBlockSlotsArgs, 'input'>>;
  bulkCreateClubMatches?: Resolver<ResolversTypes['BulkClubMatchResult'], ParentType, ContextType, RequireFields<MutationBulkCreateClubMatchesArgs, 'input'>>;
  createClubMatch?: Resolver<ResolversTypes['CreateClubMatchResult'], ParentType, ContextType, RequireFields<MutationCreateClubMatchArgs, 'input'>>;
  createClubSlot?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationCreateClubSlotArgs, 'input'>>;
  createMatch?: Resolver<ResolversTypes['CreateMatchResult'], ParentType, ContextType, RequireFields<MutationCreateMatchArgs, 'input'>>;
  createTournament?: Resolver<ResolversTypes['CreateTournamentResult'], ParentType, ContextType, RequireFields<MutationCreateTournamentArgs, 'input'>>;
  deleteClubSlot?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationDeleteClubSlotArgs, 'slotId'>>;
  joinMatch?: Resolver<ResolversTypes['JoinMatchResult'], ParentType, ContextType, RequireFields<MutationJoinMatchArgs, 'input'>>;
  leaveMatch?: Resolver<ResolversTypes['LeaveMatchResult'], ParentType, ContextType, RequireFields<MutationLeaveMatchArgs, 'input'>>;
  proposeMatchResult?: Resolver<ResolversTypes['MatchResultSubmission'], ParentType, ContextType, RequireFields<MutationProposeMatchResultArgs, 'input'>>;
  registerTournamentTeam?: Resolver<ResolversTypes['TournamentTeamRegistrationResult'], ParentType, ContextType, RequireFields<MutationRegisterTournamentTeamArgs, 'input'>>;
  toggleSlotBlock?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationToggleSlotBlockArgs, 'input'>>;
  updateClubSlot?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationUpdateClubSlotArgs, 'input'>>;
  updateCourtPricing?: Resolver<ResolversTypes['CourtPricingMutationResult'], ParentType, ContextType, RequireFields<MutationUpdateCourtPricingArgs, 'input'>>;
  updatePrivacy?: Resolver<ResolversTypes['PrivacySettings'], ParentType, ContextType, RequireFields<MutationUpdatePrivacyArgs, 'input'>>;
  voteMatchResult?: Resolver<ResolversTypes['VoteSubmissionResult'], ParentType, ContextType, RequireFields<MutationVoteMatchResultArgs, 'input'>>;
}>;

export type PrivacySettingsResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['PrivacySettings'] = ResolversParentTypes['PrivacySettings']> = ResolversObject<{
  isPublic?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  showDivision?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  showHistory?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  showPosition?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  showStats?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
}>;

export type ProfileResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Profile'] = ResolversParentTypes['Profile']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  division?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isPrivate?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  matchesPlayed?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  matchesWon?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  preferredPosition?: Resolver<Maybe<ResolversTypes['PlayerPosition']>, ParentType, ContextType>;
  role?: Resolver<ResolversTypes['UserRole'], ParentType, ContextType>;
  winrate?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
}>;

export type ProfileSummaryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ProfileSummary'] = ResolversParentTypes['ProfileSummary']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  availableSlotsForClubMatch?: Resolver<Array<ResolversTypes['ClubMatchSlotOccurrence']>, ParentType, ContextType, RequireFields<QueryAvailableSlotsForClubMatchArgs, 'filters'>>;
  clubDashboard?: Resolver<ResolversTypes['ClubDashboardData'], ParentType, ContextType, Partial<QueryClubDashboardArgs>>;
  clubMetrics?: Resolver<ResolversTypes['ClubMetrics'], ParentType, ContextType>;
  clubSlots?: Resolver<Array<ResolversTypes['ClubSlot']>, ParentType, ContextType, RequireFields<QueryClubSlotsArgs, 'clubId' | 'date'>>;
  clubSlotsByCourt?: Resolver<Array<ResolversTypes['ManagedClubSlot']>, ParentType, ContextType, RequireFields<QueryClubSlotsByCourtArgs, 'courtId'>>;
  clubs?: Resolver<Array<ResolversTypes['ClubDetail']>, ParentType, ContextType>;
  courtPricing?: Resolver<Maybe<ResolversTypes['CourtPricing']>, ParentType, ContextType, RequireFields<QueryCourtPricingArgs, 'courtId'>>;
  exportClubSchedule?: Resolver<ResolversTypes['String'], ParentType, ContextType, Partial<QueryExportClubScheduleArgs>>;
  match?: Resolver<Maybe<ResolversTypes['Match']>, ParentType, ContextType, RequireFields<QueryMatchArgs, 'id'>>;
  matchResultSubmissions?: Resolver<Array<ResolversTypes['MatchResultSubmission']>, ParentType, ContextType, RequireFields<QueryMatchResultSubmissionsArgs, 'matchId'>>;
  matches?: Resolver<Array<ResolversTypes['Match']>, ParentType, ContextType, Partial<QueryMatchesArgs>>;
  myClubSlots?: Resolver<Array<ResolversTypes['ManagedClubSlot']>, ParentType, ContextType>;
  myMatches?: Resolver<ResolversTypes['MatchHistoryConnection'], ParentType, ContextType, Partial<QueryMyMatchesArgs>>;
  myProfile?: Resolver<ResolversTypes['Profile'], ParentType, ContextType>;
  mySettings?: Resolver<ResolversTypes['PrivacySettings'], ParentType, ContextType>;
  profile?: Resolver<Maybe<ResolversTypes['Profile']>, ParentType, ContextType, RequireFields<QueryProfileArgs, 'id'>>;
  slotAuditLog?: Resolver<Array<ResolversTypes['SlotAuditLog']>, ParentType, ContextType, RequireFields<QuerySlotAuditLogArgs, 'slotId'>>;
  slotImpactPreview?: Resolver<ResolversTypes['SlotImpactPreview'], ParentType, ContextType, RequireFields<QuerySlotImpactPreviewArgs, 'slotIds'>>;
  tournaments?: Resolver<Array<ResolversTypes['Tournament']>, ParentType, ContextType>;
}>;

export type ScheduleSlotResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ScheduleSlot'] = ResolversParentTypes['ScheduleSlot']> = ResolversObject<{
  allowOnlineBooking?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  blockReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  blockType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  courtId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  courtName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  dayOfWeek?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  duration?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  endTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isActive?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  match?: Resolver<Maybe<ResolversTypes['DashboardMatch']>, ParentType, ContextType>;
  priceArs?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  slotId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  startTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['ScheduleSlotStatus'], ParentType, ContextType>;
}>;

export type SlotAuditLogResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SlotAuditLog'] = ResolversParentTypes['SlotAuditLog']> = ResolversObject<{
  action?: Resolver<ResolversTypes['SlotAction'], ParentType, ContextType>;
  changedBy?: Resolver<Maybe<ResolversTypes['AuditProfile']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  newValue?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  previousValue?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  reason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  slotId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
}>;

export type SlotImpactPreviewResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['SlotImpactPreview'] = ResolversParentTypes['SlotImpactPreview']> = ResolversObject<{
  matchDetails?: Resolver<Array<ResolversTypes['AffectedMatch']>, ParentType, ContextType>;
  matchesAffected?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  playersToNotify?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalSlotsAffected?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type TeamMemberResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TeamMember'] = ResolversParentTypes['TeamMember']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  preferredPosition?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type TournamentResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Tournament'] = ResolversParentTypes['Tournament']> = ResolversObject<{
  club?: Resolver<Maybe<ResolversTypes['TournamentClub']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  endDate?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fixtureMatches?: Resolver<Array<ResolversTypes['TournamentFixtureMatch']>, ParentType, ContextType>;
  format?: Resolver<ResolversTypes['MatchFormat'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  organizerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  playersPerTeam?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  registeredTeamsCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  startDate?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['TournamentStatus'], ParentType, ContextType>;
  teamCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
}>;

export type TournamentClubResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TournamentClub'] = ResolversParentTypes['TournamentClub']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  zone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type TournamentFixtureMatchResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TournamentFixtureMatch'] = ResolversParentTypes['TournamentFixtureMatch']> = ResolversObject<{
  awayTeamId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  courtId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  homeTeamId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  round?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  scheduledAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['FixtureMatchStatus'], ParentType, ContextType>;
  tournamentId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
}>;

export type TournamentTeamRegistrationResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TournamentTeamRegistrationResult'] = ResolversParentTypes['TournamentTeamRegistrationResult']> = ResolversObject<{
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  teamId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  tournament?: Resolver<Maybe<ResolversTypes['Tournament']>, ParentType, ContextType>;
}>;

export type VoteSubmissionResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['VoteSubmissionResult'] = ResolversParentTypes['VoteSubmissionResult']> = ResolversObject<{
  statusChanged?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  submission?: Resolver<ResolversTypes['MatchResultSubmission'], ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  AffectedMatch?: AffectedMatchResolvers<ContextType>;
  AuditProfile?: AuditProfileResolvers<ContextType>;
  BulkClubMatchItem?: BulkClubMatchItemResolvers<ContextType>;
  BulkClubMatchResult?: BulkClubMatchResultResolvers<ContextType>;
  BulkSlotMutationResult?: BulkSlotMutationResultResolvers<ContextType>;
  Club?: ClubResolvers<ContextType>;
  ClubDashboardData?: ClubDashboardDataResolvers<ContextType>;
  ClubDetail?: ClubDetailResolvers<ContextType>;
  ClubMatchSlotOccurrence?: ClubMatchSlotOccurrenceResolvers<ContextType>;
  ClubMetrics?: ClubMetricsResolvers<ContextType>;
  ClubSlot?: ClubSlotResolvers<ContextType>;
  ClubSlotMutationResult?: ClubSlotMutationResultResolvers<ContextType>;
  ConflictAlert?: ConflictAlertResolvers<ContextType>;
  Court?: CourtResolvers<ContextType>;
  CourtPricing?: CourtPricingResolvers<ContextType>;
  CourtPricingMutationResult?: CourtPricingMutationResultResolvers<ContextType>;
  CreateClubMatchResult?: CreateClubMatchResultResolvers<ContextType>;
  CreateMatchResult?: CreateMatchResultResolvers<ContextType>;
  CreateTournamentResult?: CreateTournamentResultResolvers<ContextType>;
  DashboardMatch?: DashboardMatchResolvers<ContextType>;
  JoinMatchResult?: JoinMatchResultResolvers<ContextType>;
  LeaveMatchResult?: LeaveMatchResultResolvers<ContextType>;
  ManagedClubSlot?: ManagedClubSlotResolvers<ContextType>;
  Match?: MatchResolvers<ContextType>;
  MatchHistoryConnection?: MatchHistoryConnectionResolvers<ContextType>;
  MatchHistoryItem?: MatchHistoryItemResolvers<ContextType>;
  MatchParticipantsData?: MatchParticipantsDataResolvers<ContextType>;
  MatchResultSubmission?: MatchResultSubmissionResolvers<ContextType>;
  MatchResultVote?: MatchResultVoteResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  PrivacySettings?: PrivacySettingsResolvers<ContextType>;
  Profile?: ProfileResolvers<ContextType>;
  ProfileSummary?: ProfileSummaryResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  ScheduleSlot?: ScheduleSlotResolvers<ContextType>;
  SlotAuditLog?: SlotAuditLogResolvers<ContextType>;
  SlotImpactPreview?: SlotImpactPreviewResolvers<ContextType>;
  TeamMember?: TeamMemberResolvers<ContextType>;
  Tournament?: TournamentResolvers<ContextType>;
  TournamentClub?: TournamentClubResolvers<ContextType>;
  TournamentFixtureMatch?: TournamentFixtureMatchResolvers<ContextType>;
  TournamentTeamRegistrationResult?: TournamentTeamRegistrationResultResolvers<ContextType>;
  VoteSubmissionResult?: VoteSubmissionResultResolvers<ContextType>;
}>;

