/**
 * Apollo Server setup and configuration
 *
 * Decision Context:
 * - Why: Integrates Apollo Server 5 with Express as per tech stack requirements.
 * - Pattern: Context extracts JWT from Authorization header for user-scoped operations.
 * - Previously fixed bugs: Fixed import path - AS5 uses manual middleware integration.
 */

import { ApolloServer, HeaderMap } from '@apollo/server';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { Express, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolvers } from './resolvers/index.js';
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
 * Extract user from JWT token (simplified - production should verify JWT)
 */
function extractUserFromToken(authHeader?: string): { id: string; email: string } | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  // TODO: Verify JWT with Supabase/jsonwebtoken
  // For now, decode without verification for development
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return {
      id: payload.sub,
      email: payload.email,
    };
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
    const user = extractUserFromToken(authHeader);

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
