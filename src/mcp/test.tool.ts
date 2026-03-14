import { Injectable } from '@nestjs/common';
import { Tool, Context } from '@rekog/mcp-nest';
import { z } from 'zod';
import { InjectSdk, GqlSdk } from 'src/sdk/sdk.module';

@Injectable()
export class TestTool {
  constructor(@InjectSdk() private readonly sdk: GqlSdk) {}

  @Tool({
    name: 'test-tool',
    description: 'Test tool using SDK',
    parameters: z.object({
      name: z.string().default('test'),
    }),
  })
  async test({ name }, context: Context) {
    await context.reportProgress({ progress: 25, total: 100 });

    // Using the SDK instead of direct GraphQL calls
    const { __typename } = await this.sdk.TestSdk({});

    await context.reportProgress({ progress: 75, total: 100 });
    return `Test, ${name}! ${__typename}`;
  }
}
