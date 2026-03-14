# Pho MCP Server

A Model Context Protocol (MCP) server for real estate data management using GraphQL and NestJS.

## Features

- GraphQL-based data access with auto-generated TypeScript SDK
- MCP tools for property search, market analysis, and partner management
- Type-safe GraphQL operations
- Progress reporting for long-running operations

## Setup

### Prerequisites

- Node.js (v18 or higher)
- Hasura GraphQL Engine
- Environment variables configured

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (copy from `env.example`):
```bash
cp env.example .env
# Edit .env with your Hasura configuration
```

3. Generate GraphQL SDK:
```bash
npm run generate
```

### Development

- Start development server: `npm run dev`
- Build for production: `npm run build`
- Run tests: `npm test`

## GraphQL SDK

The project uses GraphQL Code Generator to create a type-safe SDK from GraphQL queries.

### Adding New Queries

1. Create GraphQL query files in `src/graphql/`:
```graphql
query GetMyData($where: MyTableBoolExp = {}) {
  myTable(where: $where) {
    id
    name
    # ... other fields
  }
}
```

2. Regenerate the SDK:
```bash
npm run generate
```

3. Use the generated SDK in your tools:
```typescript
import { InjectSdk, GqlSdk } from 'src/sdk/sdk.module';

@Injectable()
export class MyTool {
  constructor(@InjectSdk() private readonly sdk: GqlSdk) {}

  async myMethod() {
    const result = await this.sdk.GetMyData({
      where: { /* your conditions */ }
    });
    return result;
  }
}
```

### Available SDK Functions

The generated SDK includes the following functions:

- `GetMarketStatistics` - Get market statistics for a region
- `GetPropertyViewsWithDetails` - Search properties with detailed information
- `GetInvestmentData` - Get investment data for analysis
- `GetPropertySaleInfo` - Get property sale information
- `FindNearbyProperties` - Find properties near coordinates
- `GetPartners` - Get partner information
- `Test` - Simple test query

## MCP Tools

### Property Search
- **search-properties**: Search properties by address, type, and other criteria
- **market-statistics**: Get market analysis for specific regions
- **find-nearby-properties**: Find properties near specific coordinates

### Partner Management
- **get-partners**: Retrieve partner information with filtering

### Investment Analysis
- **suggest-investment-area**: Get investment recommendations based on budget and criteria

## Architecture

- **GraphQL Layer**: Type-safe queries with auto-generated SDK
- **MCP Layer**: Tools exposed via Model Context Protocol
- **NestJS**: Dependency injection and modular architecture
- **Hasura**: GraphQL API with PostgreSQL backend

## Environment Variables

Required environment variables:
- `HASURA_ENDPOINT`: Hasura GraphQL endpoint
- `HASURA_GRAPHQL_ADMIN_SECRET`: Hasura admin secret
- `HASURA_PORT`: Hasura port (for development)

## Contributing

1. Add new GraphQL queries to `src/graphql/`
2. Run `npm run generate` to update the SDK
3. Create new MCP tools in `src/mcp/`
4. Test your changes with `npm test`
