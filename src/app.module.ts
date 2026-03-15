import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from './common/config/config.module';
import { McpModule } from '@rekog/mcp-nest';
import { AppController } from './app.controller';
import { AppLogger } from './logger.service';
import { LoggingInterceptor } from './logging.interceptor';
import { AppService } from './app.service';
import { DormitoryTool } from './mcp';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    McpModule.forRoot({
      name: 'dormitory-mcp-server',
      version: '1.0.0',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppLogger,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    AppService,
    DormitoryTool,
  ],
})
export class AppModule { }
