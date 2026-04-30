/**
 * Apollo Server setup and configuration
 *
 * Decision Context:
 * - Why: Integrates Apollo Server 5 with Express as per tech stack requirements.
 * - Pattern: Context extracts and verifies JWT via Supabase getUser() for user-scoped ops.
 *   Returns null user for unauthenticated requests (public queries still work; resolvers
 *   that require auth call requireAuth() which throws if user is null).
 * - Previously fixed bugs:
 *   - Fixed import path — AS5 uses manual middleware integration.
 *   - extractUserFromToken() decoded the JWT with base64 without cryptographic verification,
 *     allowing any structurally valid but forged token to pass. Fixed: now calls
 *     createUserClient(token).auth.getUser() which validates the token signature against
 *     Supabase. Forgeries are rejected with a null user.
 */

import { ApolloServer, HeaderMap } from '@apollo/server';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { Express, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolvers } from './resolvers/index.js';
import { createUserClient } from '../config/supabase.js';
import type { GraphQLContext } from '../types/context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load and merge all .graphql schema files
 */
function loadSchema() {
  const typesArray = loadFilesSync(path.join(__dirname, 'schema'), {
    extensions: ['graphql'],
  });

  return mergeTypeDefs(typesArray);
}

/**
 * Verify the Bearer token against Supabase and return the authenticated user.
 * Returns null for missing, malformed, or invalid tokens so public resolvers
 * still work; resolvers that require auth call requireAuth() to gate access.
 */
async function extractUserFromToken(
  authHeader?: string,
): Promise<{ id: string; email: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  try {
    const {
      data: { user },
      error,
    } = await createUserClient(token).auth.getUser();
    if (error || !user) return null;
    return { id: user.id, email: user.email ?? '' };
  } catch {
    return null;
  }
}

/**
 * Create and configure Apollo Server instance
 */
export async function createApolloServer(): Promise<ApolloServer<GraphQLContext>> {
  const typeDefs = loadSchema();

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  const server = new ApolloServer<GraphQLContext>({
    schema,
    introspection: process.env.NODE_ENV !== 'production',
  });

  await server.start();

  return server;
}

/**
 * Apply Apollo middleware to Express app
 */
export async function applyApolloMiddleware(app: Express): Promise<void> {
  const server = await createApolloServer();

  // Manual Express integration for Apollo Server 5
  app.use('/graphql', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const user = await extractUserFromToken(authHeader);

    const contextValue: GraphQLContext = {
      user,
      accessToken: authHeader?.slice(7),
    };

    // Handle the GraphQL request
    const { body, headers, status } = await server.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: req.method,
        headers: toHeaderMap(req.headers),
        body: req.body,
        search: new URL(req.url, `http://${req.headers.host}`).search,
      },
      context: async () => contextValue,
    });

    // Set response headers
    for (const [key, value] of headers) {
      res.setHeader(key, value);
    }

    res.status(status ?? 200);

    if (body.kind === 'complete') {
      res.send(body.string);
    } else {
      // Handle chunked response if needed
      for await (const chunk of body.asyncIterator) {
        res.write(chunk);
      }
      res.end();
    }
  });

  console.log('[Apollo] GraphQL endpoint ready at /graphql');
}

function toHeaderMap(headers: Request['headers']): HeaderMap {
  const headerMap = new HeaderMap();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      headerMap.set(key.toLowerCase(), value);
      continue;
    }

    if (Array.isArray(value)) {
      headerMap.set(key.toLowerCase(), value.join(', '));
    }
  }

  return headerMap;
}
