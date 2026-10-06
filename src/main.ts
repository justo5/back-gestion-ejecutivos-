import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  // rawBody: el webhook de la landing (POST /api/webhooks/vb) verifica la
  // firma HMAC sobre los bytes exactos del body, no sobre el JSON parseado.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
