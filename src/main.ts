import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Thêm cấu hình CORS
  app.enableCors({
    origin: '*', // Cho phép tất cả các origin trong môi trường phát triển
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  await app.listen(process.env.PORT || 3000);
}

bootstrap();

process.on('uncaughtException', (error, origin) => {
  console.log('----- Uncaught exception -----');
  console.log('----- Exception origin -----');
  console.log(origin);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('----- Unhandled Rejection at -----');
  console.log(promise);
});
