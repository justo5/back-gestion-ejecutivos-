import { INestApplication, ValidationPipe } from '@nestjs/common';

// Configuración común de la app, compartida por main.ts y los tests e2e para
// que los tests corran con el mismo prefijo y la misma validación que producción.
export function configureApp(app: INestApplication) {
  app.enableCors();
  // En VPS, restringir el origen al dominio del front en producción:
  // app.enableCors({ origin: 'https://tu-dominio-front.com', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
}
