import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  RawBodyRequest,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

// Margen aceptado entre el x-vb-timestamp y el reloj del server. Limita la
// ventana en la que un request capturado se puede volver a mandar (replay).
const MAX_CLOCK_SKEW_SECONDS = 300;
const MIN_SECRET_LENGTH = 32;

// Autentica los webhooks de vb-api con la firma HMAC en vez de JWT. Es un
// guard (y no lógica del controller) para que corra antes del ValidationPipe:
// un request sin firma válida tiene que dar 401 sin revelar si el body es
// válido o no.
@Injectable()
export class VbSignatureGuard implements CanActivate {
  private readonly logger = new Logger(VbSignatureGuard.name);

  constructor(private config: ConfigService) {
    // Se instancia al arrancar: avisa en el log si el webhook va a quedar
    // respondiendo 503 por falta de configuración.
    if (!this.getSecret()) {
      this.logger.warn(
        `VB_WEBHOOK_SECRET no está definida (o tiene menos de ${MIN_SECRET_LENGTH} caracteres): POST /api/webhooks/vb va a responder 503`,
      );
    }
  }

  // Se lee en cada request (no se cachea) para que un cambio de entorno en
  // tests no requiera reconstruir el guard.
  private getSecret(): string | null {
    const secret = this.config.get<string>('VB_WEBHOOK_SECRET');
    return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
  }

  canActivate(context: ExecutionContext): boolean {
    const secret = this.getSecret();
    if (!secret) throw new ServiceUnavailableException('Webhook no configurado');

    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const timestamp = req.header('x-vb-timestamp') ?? '';
    const signature = req.header('x-vb-signature') ?? '';

    // La firma se calcula sobre los bytes exactos del body (requiere
    // rawBody: true en NestFactory.create), nunca sobre el JSON re-serializado:
    // JSON.stringify no garantiza el mismo orden, espacios ni escapes.
    const rawBody = req.rawBody;
    if (!rawBody || !/^\d+$/.test(timestamp)) throw new UnauthorizedException();

    const expected =
      'sha256=' + createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    // timingSafeEqual tira si los largos difieren, por eso se compara antes.
    if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
      throw new UnauthorizedException();
    }

    // El timestamp va dentro de lo firmado, así que se chequea después de la
    // firma: un atacante no puede actualizarlo sin conocer el secreto.
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
