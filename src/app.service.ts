import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectSdk, GqlSdk } from 'src/sdk/sdk.module';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(@InjectSdk() private sdk: GqlSdk) {}

  onModuleInit() {
    this.test();
  }

  async test() {
    const { __typename } = await this.sdk.TestSdk({});
    console.log('test', __typename);
  }
}
