require('dotenv').config();

const { HASURA_ENDPOINT: endpoint, HASURA_GRAPHQL_ADMIN_SECRET: secret } =
  process.env;

module.exports = {
  client: {
    service: {
      name: 'hasura-nestjs',
      url: endpoint,
      headers: {
        'x-hasura-admin-secret': secret,
      },
    },
    includes: ['src/**/*.service.ts'],
  },
};
