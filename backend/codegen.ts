import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './src/graphql/schema/**/*.graphql',
  generates: {
    './src/graphql/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../types/context.js#GraphQLContext',
        useIndexSignature: true,
        mappers: {},
      },
    },
  },
};

export default config;
