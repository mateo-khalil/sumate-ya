/**
 * GraphQL Resolvers Index
 * Merges all domain resolvers into a single resolvers object
 */

import { matchResolvers } from './matchResolver.js';

// Merge all resolvers
export const resolvers = {
  Query: {
    ...matchResolvers.Query,
  },
  // Mutation: {
  //   // Add mutation resolvers here when needed
  // },
};
