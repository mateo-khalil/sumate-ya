import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = (__ENV.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const GRAPHQL_URL = `${API_URL}/graphql`;
const READ_RATE = Number(__ENV.K6_READ_RATE || 30);
const READ_DURATION = __ENV.K6_READ_DURATION || '5m';
const JOIN_VUS = Number(__ENV.K6_JOIN_VUS || 25);
const JOIN_DURATION = __ENV.K6_JOIN_DURATION || '2m';
const AUTH_TOKENS = (__ENV.K6_AUTH_TOKENS || __ENV.K6_AUTH_TOKEN || '')
  .split(',')
  .map((token) => token.trim())
  .filter(Boolean);
const CONFIGURED_JOIN_MATCH_ID = __ENV.K6_JOIN_MATCH_ID || '';

const scenarios = {
  read_heavy: {
    executor: 'constant-arrival-rate',
    exec: 'readHeavy',
    rate: READ_RATE,
    timeUnit: '1s',
    duration: READ_DURATION,
    preAllocatedVUs: Math.max(10, READ_RATE),
    maxVUs: Math.max(50, READ_RATE * 4),
    tags: { flow: 'read_heavy' },
  },
};

const thresholds = {
  'http_req_failed{scenario:read_heavy}': ['rate<0.02'],
  'http_req_duration{scenario:read_heavy}': ['p(95)<500', 'p(99)<1200'],
  'checks{scenario:read_heavy}': ['rate>0.98'],
};

if (CONFIGURED_JOIN_MATCH_ID && AUTH_TOKENS.length > 0) {
  scenarios.join_match = {
    executor: 'constant-vus',
    exec: 'joinMatch',
    vus: JOIN_VUS,
    duration: JOIN_DURATION,
    startTime: '10s',
    gracefulStop: '10s',
    tags: { flow: 'join_match' },
  };
  thresholds['http_req_failed{scenario:join_match}'] = ['rate<0.05'];
  thresholds['http_req_duration{scenario:join_match}'] = ['p(95)<800', 'p(99)<1500'];
  thresholds['checks{scenario:join_match}'] = ['rate>0.95'];
}

export const options = {
  scenarios,
  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(95)', 'p(99)', 'max'],
  thresholds,
};

const GET_MATCHES = `
  query GetMatches($filters: MatchFilters) {
    matches(filters: $filters) {
      id
      title
      startTime
      format
      totalSlots
      availableSlots
      status
      club { name zone }
    }
  }
`;

const GET_MATCH_DETAIL = `
  query GetMatchDetail($id: ID!) {
    match(id: $id) {
      id
      title
      status
      availableSlots
      participants {
        teamACount
        teamBCount
        totalCount
      }
      club { id name zone }
    }
  }
`;

const GET_TOURNAMENTS = `
  query GetTournaments($filters: TournamentFilters) {
    tournaments(filters: $filters) {
      id
      name
      format
      teamCount
      registeredTeamsCount
      status
      club { id name zone }
    }
  }
`;

const GET_TOURNAMENT_DETAIL = `
  query GetTournamentDetail($id: ID!) {
    tournament(id: $id) {
      id
      name
      format
      status
      registeredTeamsCount
      teams { id name }
      fixtureMatches {
        id
        round
        homeTeamId
        awayTeamId
        scheduledAt
        status
        scoreHome
        scoreAway
      }
    }
  }
`;

const GET_LEADERBOARD = `
  query GetLeaderboard($limit: Int) {
    leaderboard(limit: $limit) {
      rank
      id
      displayName
      division
      matchesPlayed
      matchesWon
      winrate
    }
  }
`;

const JOIN_MATCH = `
  mutation JoinMatch($input: JoinMatchInput!) {
    joinMatch(input: $input) {
      success
      message
    }
  }
`;

export function setup() {
  const tournamentId = __ENV.K6_TOURNAMENT_ID || findFirstTournamentId();
  const matchId = __ENV.K6_MATCH_ID || findFirstOpenMatchId();

  return {
    tournamentId,
    matchId,
    joinMatchId: CONFIGURED_JOIN_MATCH_ID,
  };
}

export function readHeavy(data) {
  const pick = (__ITER + __VU) % 4;

  if (pick === 0) {
    gql('GetMatches', GET_MATCHES, { filters: { status: 'OPEN' } });
  } else if (pick === 1 && data.matchId) {
    gql('GetMatchDetail', GET_MATCH_DETAIL, { id: data.matchId });
  } else if (pick === 2 && data.tournamentId) {
    gql('GetTournamentDetail', GET_TOURNAMENT_DETAIL, { id: data.tournamentId });
  } else {
    gql('GetLeaderboard', GET_LEADERBOARD, { limit: 50 });
  }

  sleep(0.1);
}

export function joinMatch(data) {
  if (!data.joinMatchId || AUTH_TOKENS.length === 0) return;

  const token = AUTH_TOKENS[(__VU + __ITER) % AUTH_TOKENS.length];
  const team = __ITER % 2 === 0 ? 'A' : 'B';

  gql(
    'JoinMatch',
    JOIN_MATCH,
    {
      input: {
        matchId: data.joinMatchId,
        team,
      },
    },
    token,
    { operation_kind: 'write' },
  );

  sleep(0.2);
}

export function handleSummary(data) {
  const summary = [
    '',
    'Sumate Ya backend load test',
    `API: ${API_URL}`,
    metricLine(data, 'http_reqs', 'Requests'),
    metricLine(data, 'http_req_duration', 'Latency'),
    metricLine(data, 'http_req_failed', 'Failures'),
    '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    stdout: `${summary}\n`,
    'load-tests/results/backend-summary.json': JSON.stringify(data, null, 2),
  };
}

function gql(operationName, query, variables = {}, token = '', tags = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = http.post(
    GRAPHQL_URL,
    JSON.stringify({
      operationName,
      query,
      variables,
    }),
    {
      headers,
      tags: {
        operation_name: operationName,
        ...tags,
      },
    },
  );

  check(response, {
    [`${operationName} returned HTTP 2xx`]: (res) => res.status >= 200 && res.status < 300,
    [`${operationName} has no GraphQL errors`]: (res) => !hasGraphQLErrors(res),
  });

  return response;
}

function findFirstOpenMatchId() {
  const response = gql('GetMatches', GET_MATCHES, { filters: { status: 'OPEN' } });
  const body = parseJson(response);
  return body?.data?.matches?.[0]?.id || '';
}

function findFirstTournamentId() {
  const response = gql('GetTournaments', GET_TOURNAMENTS, {});
  const body = parseJson(response);
  return body?.data?.tournaments?.[0]?.id || '';
}

function hasGraphQLErrors(response) {
  const body = parseJson(response);
  return Array.isArray(body?.errors) && body.errors.length > 0;
}

function parseJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function metricLine(data, metricName, label) {
  const metric = data.metrics[metricName];
  if (!metric?.values) return '';

  const values = metric.values;
  const parts = [];

  if (typeof values.count === 'number') parts.push(`count=${Math.round(values.count)}`);
  if (typeof values.rate === 'number') parts.push(`rate=${values.rate.toFixed(2)}/s`);
  if (typeof values['p(50)'] === 'number') parts.push(`p50=${values['p(50)'].toFixed(0)}ms`);
  if (typeof values['p(95)'] === 'number') parts.push(`p95=${values['p(95)'].toFixed(0)}ms`);
  if (typeof values['p(99)'] === 'number') parts.push(`p99=${values['p(99)'].toFixed(0)}ms`);
  if (typeof values.rate === 'number' && metricName === 'http_req_failed') {
    parts.push(`rate=${(values.rate * 100).toFixed(2)}%`);
  }

  return `${label}: ${parts.join(', ')}`;
}
