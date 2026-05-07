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
  createClubSlot: ClubSlotMutationResult;
  createMatch: CreateMatchResult;
  deleteClubSlot: ClubSlotMutationResult;
  joinMatch: JoinMatchResult;
  leaveMatch: LeaveMatchResult;
  proposeMatchResult: MatchResultSubmission;
  toggleSlotBlock: ClubSlotMutationResult;
  updateClubSlot: ClubSlotMutationResult;
  updateCourtPricing: CourtPricingMutationResult;
  voteMatchResult: VoteSubmissionResult;
};


export type MutationBulkBlockSlotsArgs = {
  input: BulkBlockSlotsInput;
};


export type MutationCreateClubSlotArgs = {
  input: CreateClubSlotInput;
};


export type MutationCreateMatchArgs = {
  input: CreateMatchInput;
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


export type MutationToggleSlotBlockArgs = {
  input: BlockSlotInput;
};


export type MutationUpdateClubSlotArgs = {
  input: UpdateClubSlotInput;
};


export type MutationUpdateCourtPricingArgs = {
  input: UpdateCourtPricingInput;
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

export type Profile = {
  __typename?: 'Profile';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  division: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  matchesPlayed: Scalars['Int']['output'];
  matchesWon: Scalars['Int']['output'];
  preferredPosition?: Maybe<PlayerPosition>;
  role: UserRole;
  winrate?: Maybe<Scalars['Float']['output']>;
};

export type ProposeMatchResultInput = {
  matchId: Scalars['ID']['input'];
  scoreA: Scalars['Int']['input'];
  scoreB: Scalars['Int']['input'];
  winnerTeam?: InputMaybe<WinnerTeam>;
};

export type Query = {
  __typename?: 'Query';
  clubSlots: Array<ClubSlot>;
  clubSlotsByCourt: Array<ManagedClubSlot>;
  clubs: Array<ClubDetail>;
  courtPricing?: Maybe<CourtPricing>;
  match?: Maybe<Match>;
  matchResultSubmissions: Array<MatchResultSubmission>;
  matches: Array<Match>;
  myClubSlots: Array<ManagedClubSlot>;
  myMatches: MatchHistoryConnection;
  myProfile: Profile;
  slotAuditLog: Array<SlotAuditLog>;
  slotImpactPreview: SlotImpactPreview;
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


export type QuerySlotAuditLogArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  slotId: Scalars['ID']['input'];
};


export type QuerySlotImpactPreviewArgs = {
  slotIds: Array<Scalars['ID']['input']>;
};

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
  BlockSlotInput: BlockSlotInput;
  BlockType: BlockType;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  BulkBlockSlotsInput: BulkBlockSlotsInput;
  BulkSlotMutationResult: ResolverTypeWrapper<BulkSlotMutationResult>;
  Club: ResolverTypeWrapper<Club>;
  ClubDetail: ResolverTypeWrapper<ClubDetail>;
  ClubSlot: ResolverTypeWrapper<ClubSlot>;
  ClubSlotMutationResult: ResolverTypeWrapper<ClubSlotMutationResult>;
  Court: ResolverTypeWrapper<Court>;
  CourtPricing: ResolverTypeWrapper<CourtPricing>;
  CourtPricingMutationResult: ResolverTypeWrapper<CourtPricingMutationResult>;
  CourtSurface: CourtSurface;
  CreateClubSlotInput: CreateClubSlotInput;
  CreateMatchInput: CreateMatchInput;
  CreateMatchResult: ResolverTypeWrapper<CreateMatchResult>;
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
  Profile: ResolverTypeWrapper<Profile>;
  ProposeMatchResultInput: ProposeMatchResultInput;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  SlotAction: SlotAction;
  SlotAuditLog: ResolverTypeWrapper<SlotAuditLog>;
  SlotImpactPreview: ResolverTypeWrapper<SlotImpactPreview>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  SubmissionStatus: SubmissionStatus;
  TeamMember: ResolverTypeWrapper<TeamMember>;
  UpdateClubSlotInput: UpdateClubSlotInput;
  UpdateCourtPricingInput: UpdateCourtPricingInput;
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
  BlockSlotInput: BlockSlotInput;
  Boolean: Scalars['Boolean']['output'];
  BulkBlockSlotsInput: BulkBlockSlotsInput;
  BulkSlotMutationResult: BulkSlotMutationResult;
  Club: Club;
  ClubDetail: ClubDetail;
  ClubSlot: ClubSlot;
  ClubSlotMutationResult: ClubSlotMutationResult;
  Court: Court;
  CourtPricing: CourtPricing;
  CourtPricingMutationResult: CourtPricingMutationResult;
  CreateClubSlotInput: CreateClubSlotInput;
  CreateMatchInput: CreateMatchInput;
  CreateMatchResult: CreateMatchResult;
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
  Profile: Profile;
  ProposeMatchResultInput: ProposeMatchResultInput;
  Query: Record<PropertyKey, never>;
  SlotAuditLog: SlotAuditLog;
  SlotImpactPreview: SlotImpactPreview;
  String: Scalars['String']['output'];
  TeamMember: TeamMember;
  UpdateClubSlotInput: UpdateClubSlotInput;
  UpdateCourtPricingInput: UpdateCourtPricingInput;
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

export type ClubDetailResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubDetail'] = ResolversParentTypes['ClubDetail']> = ResolversObject<{
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  zone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
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

export type CreateMatchResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['CreateMatchResult'] = ResolversParentTypes['CreateMatchResult']> = ResolversObject<{
  matchId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
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
  createClubSlot?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationCreateClubSlotArgs, 'input'>>;
  createMatch?: Resolver<ResolversTypes['CreateMatchResult'], ParentType, ContextType, RequireFields<MutationCreateMatchArgs, 'input'>>;
  deleteClubSlot?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationDeleteClubSlotArgs, 'slotId'>>;
  joinMatch?: Resolver<ResolversTypes['JoinMatchResult'], ParentType, ContextType, RequireFields<MutationJoinMatchArgs, 'input'>>;
  leaveMatch?: Resolver<ResolversTypes['LeaveMatchResult'], ParentType, ContextType, RequireFields<MutationLeaveMatchArgs, 'input'>>;
  proposeMatchResult?: Resolver<ResolversTypes['MatchResultSubmission'], ParentType, ContextType, RequireFields<MutationProposeMatchResultArgs, 'input'>>;
  toggleSlotBlock?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationToggleSlotBlockArgs, 'input'>>;
  updateClubSlot?: Resolver<ResolversTypes['ClubSlotMutationResult'], ParentType, ContextType, RequireFields<MutationUpdateClubSlotArgs, 'input'>>;
  updateCourtPricing?: Resolver<ResolversTypes['CourtPricingMutationResult'], ParentType, ContextType, RequireFields<MutationUpdateCourtPricingArgs, 'input'>>;
  voteMatchResult?: Resolver<ResolversTypes['VoteSubmissionResult'], ParentType, ContextType, RequireFields<MutationVoteMatchResultArgs, 'input'>>;
}>;

export type ProfileResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Profile'] = ResolversParentTypes['Profile']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  division?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  matchesPlayed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  matchesWon?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  preferredPosition?: Resolver<Maybe<ResolversTypes['PlayerPosition']>, ParentType, ContextType>;
  role?: Resolver<ResolversTypes['UserRole'], ParentType, ContextType>;
  winrate?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  clubSlots?: Resolver<Array<ResolversTypes['ClubSlot']>, ParentType, ContextType, RequireFields<QueryClubSlotsArgs, 'clubId' | 'date'>>;
  clubSlotsByCourt?: Resolver<Array<ResolversTypes['ManagedClubSlot']>, ParentType, ContextType, RequireFields<QueryClubSlotsByCourtArgs, 'courtId'>>;
  clubs?: Resolver<Array<ResolversTypes['ClubDetail']>, ParentType, ContextType>;
  courtPricing?: Resolver<Maybe<ResolversTypes['CourtPricing']>, ParentType, ContextType, RequireFields<QueryCourtPricingArgs, 'courtId'>>;
  match?: Resolver<Maybe<ResolversTypes['Match']>, ParentType, ContextType, RequireFields<QueryMatchArgs, 'id'>>;
  matchResultSubmissions?: Resolver<Array<ResolversTypes['MatchResultSubmission']>, ParentType, ContextType, RequireFields<QueryMatchResultSubmissionsArgs, 'matchId'>>;
  matches?: Resolver<Array<ResolversTypes['Match']>, ParentType, ContextType, Partial<QueryMatchesArgs>>;
  myClubSlots?: Resolver<Array<ResolversTypes['ManagedClubSlot']>, ParentType, ContextType>;
  myMatches?: Resolver<ResolversTypes['MatchHistoryConnection'], ParentType, ContextType, Partial<QueryMyMatchesArgs>>;
  myProfile?: Resolver<ResolversTypes['Profile'], ParentType, ContextType>;
  slotAuditLog?: Resolver<Array<ResolversTypes['SlotAuditLog']>, ParentType, ContextType, RequireFields<QuerySlotAuditLogArgs, 'slotId'>>;
  slotImpactPreview?: Resolver<ResolversTypes['SlotImpactPreview'], ParentType, ContextType, RequireFields<QuerySlotImpactPreviewArgs, 'slotIds'>>;
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

export type VoteSubmissionResultResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['VoteSubmissionResult'] = ResolversParentTypes['VoteSubmissionResult']> = ResolversObject<{
  statusChanged?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  submission?: Resolver<ResolversTypes['MatchResultSubmission'], ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  AffectedMatch?: AffectedMatchResolvers<ContextType>;
  AuditProfile?: AuditProfileResolvers<ContextType>;
  BulkSlotMutationResult?: BulkSlotMutationResultResolvers<ContextType>;
  Club?: ClubResolvers<ContextType>;
  ClubDetail?: ClubDetailResolvers<ContextType>;
  ClubSlot?: ClubSlotResolvers<ContextType>;
  ClubSlotMutationResult?: ClubSlotMutationResultResolvers<ContextType>;
  Court?: CourtResolvers<ContextType>;
  CourtPricing?: CourtPricingResolvers<ContextType>;
  CourtPricingMutationResult?: CourtPricingMutationResultResolvers<ContextType>;
  CreateMatchResult?: CreateMatchResultResolvers<ContextType>;
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
  Profile?: ProfileResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  SlotAuditLog?: SlotAuditLogResolvers<ContextType>;
  SlotImpactPreview?: SlotImpactPreviewResolvers<ContextType>;
  TeamMember?: TeamMemberResolvers<ContextType>;
  VoteSubmissionResult?: VoteSubmissionResultResolvers<ContextType>;
}>;

