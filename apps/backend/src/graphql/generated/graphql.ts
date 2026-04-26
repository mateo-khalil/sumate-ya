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

export type Club = {
  __typename?: 'Club';
  address?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  imageUrl?: Maybe<Scalars['String']['output']>;
  lat?: Maybe<Scalars['Float']['output']>;
  lng?: Maybe<Scalars['Float']['output']>;
  name: Scalars['String']['output'];
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
  zone: Scalars['String']['output'];
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

export type Court = {
  __typename?: 'Court';
  id: Scalars['ID']['output'];
  isIndoor: Scalars['Boolean']['output'];
  maxFormat: MatchFormat;
  name: Scalars['String']['output'];
  surface: CourtSurface;
};

export enum CourtSurface {
  Concrete = 'CONCRETE',
  Grass = 'GRASS',
  Indoor = 'INDOOR',
  Synthetic = 'SYNTHETIC'
}

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

export type Match = {
  __typename?: 'Match';
  availableSlots: Scalars['Int']['output'];
  canJoin?: Maybe<Scalars['Boolean']['output']>;
  club?: Maybe<Club>;
  createdAt: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  format: MatchFormat;
  id: Scalars['ID']['output'];
  isCurrentUserJoined?: Maybe<Scalars['Boolean']['output']>;
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

export type Mutation = {
  __typename?: 'Mutation';
  createMatch: CreateMatchResult;
  joinMatch: JoinMatchResult;
  leaveMatch: LeaveMatchResult;
};


export type MutationCreateMatchArgs = {
  input: CreateMatchInput;
};


export type MutationJoinMatchArgs = {
  input: JoinMatchInput;
};


export type MutationLeaveMatchArgs = {
  input: LeaveMatchInput;
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

export type Query = {
  __typename?: 'Query';
  clubSlots: Array<ClubSlot>;
  clubs: Array<ClubDetail>;
  match?: Maybe<Match>;
  matches: Array<Match>;
  myProfile: Profile;
};


export type QueryClubSlotsArgs = {
  clubId: Scalars['ID']['input'];
  date: Scalars['String']['input'];
};


export type QueryMatchArgs = {
  id: Scalars['ID']['input'];
};


export type QueryMatchesArgs = {
  filters?: InputMaybe<MatchFilters>;
};

export type TeamMember = {
  __typename?: 'TeamMember';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export enum UserRole {
  ClubAdmin = 'CLUB_ADMIN',
  Player = 'PLAYER'
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
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Club: ResolverTypeWrapper<Club>;
  ClubDetail: ResolverTypeWrapper<ClubDetail>;
  ClubSlot: ResolverTypeWrapper<ClubSlot>;
  Court: ResolverTypeWrapper<Court>;
  CourtSurface: CourtSurface;
  CreateMatchInput: CreateMatchInput;
  CreateMatchResult: ResolverTypeWrapper<CreateMatchResult>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JoinMatchInput: JoinMatchInput;
  JoinMatchResult: ResolverTypeWrapper<JoinMatchResult>;
  LeaveMatchInput: LeaveMatchInput;
  LeaveMatchResult: ResolverTypeWrapper<LeaveMatchResult>;
  Match: ResolverTypeWrapper<Match>;
  MatchFilters: MatchFilters;
  MatchFormat: MatchFormat;
  MatchParticipantsData: ResolverTypeWrapper<MatchParticipantsData>;
  MatchStatus: MatchStatus;
  MatchTeam: MatchTeam;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  PlayerPosition: PlayerPosition;
  Profile: ResolverTypeWrapper<Profile>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  TeamMember: ResolverTypeWrapper<TeamMember>;
  UserRole: UserRole;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Boolean: Scalars['Boolean']['output'];
  Club: Club;
  ClubDetail: ClubDetail;
  ClubSlot: ClubSlot;
  Court: Court;
  CreateMatchInput: CreateMatchInput;
  CreateMatchResult: CreateMatchResult;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JoinMatchInput: JoinMatchInput;
  JoinMatchResult: JoinMatchResult;
  LeaveMatchInput: LeaveMatchInput;
  LeaveMatchResult: LeaveMatchResult;
  Match: Match;
  MatchFilters: MatchFilters;
  MatchParticipantsData: MatchParticipantsData;
  Mutation: Record<PropertyKey, never>;
  Profile: Profile;
  Query: Record<PropertyKey, never>;
  String: Scalars['String']['output'];
  TeamMember: TeamMember;
}>;

export type ClubResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Club'] = ResolversParentTypes['Club']> = ResolversObject<{
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lat?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  lng?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  zone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type ClubDetailResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['ClubDetail'] = ResolversParentTypes['ClubDetail']> = ResolversObject<{
  address?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  zone?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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

export type CourtResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Court'] = ResolversParentTypes['Court']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isIndoor?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  maxFormat?: Resolver<ResolversTypes['MatchFormat'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  surface?: Resolver<ResolversTypes['CourtSurface'], ParentType, ContextType>;
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

export type MatchResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Match'] = ResolversParentTypes['Match']> = ResolversObject<{
  availableSlots?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  canJoin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  club?: Resolver<Maybe<ResolversTypes['Club']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  format?: Resolver<ResolversTypes['MatchFormat'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isCurrentUserJoined?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  participants?: Resolver<Maybe<ResolversTypes['MatchParticipantsData']>, ParentType, ContextType>;
  startTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['MatchStatus'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  totalSlots?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
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

export type MutationResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  createMatch?: Resolver<ResolversTypes['CreateMatchResult'], ParentType, ContextType, RequireFields<MutationCreateMatchArgs, 'input'>>;
  joinMatch?: Resolver<ResolversTypes['JoinMatchResult'], ParentType, ContextType, RequireFields<MutationJoinMatchArgs, 'input'>>;
  leaveMatch?: Resolver<ResolversTypes['LeaveMatchResult'], ParentType, ContextType, RequireFields<MutationLeaveMatchArgs, 'input'>>;
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
  clubs?: Resolver<Array<ResolversTypes['ClubDetail']>, ParentType, ContextType>;
  match?: Resolver<Maybe<ResolversTypes['Match']>, ParentType, ContextType, RequireFields<QueryMatchArgs, 'id'>>;
  matches?: Resolver<Array<ResolversTypes['Match']>, ParentType, ContextType, Partial<QueryMatchesArgs>>;
  myProfile?: Resolver<ResolversTypes['Profile'], ParentType, ContextType>;
}>;

export type TeamMemberResolvers<ContextType = GraphQLContext, ParentType extends ResolversParentTypes['TeamMember'] = ResolversParentTypes['TeamMember']> = ResolversObject<{
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  Club?: ClubResolvers<ContextType>;
  ClubDetail?: ClubDetailResolvers<ContextType>;
  ClubSlot?: ClubSlotResolvers<ContextType>;
  Court?: CourtResolvers<ContextType>;
  CreateMatchResult?: CreateMatchResultResolvers<ContextType>;
  JoinMatchResult?: JoinMatchResultResolvers<ContextType>;
  LeaveMatchResult?: LeaveMatchResultResolvers<ContextType>;
  Match?: MatchResolvers<ContextType>;
  MatchParticipantsData?: MatchParticipantsDataResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Profile?: ProfileResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  TeamMember?: TeamMemberResolvers<ContextType>;
}>;

