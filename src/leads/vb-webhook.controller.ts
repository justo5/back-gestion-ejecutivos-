import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { VbSignatureGuard } from './vb-signature.guard';
import { VbWebhookDto } from './dto/vb-webhook.dto';

// Webhook que llama vb-api (backend de la landing) por la red de Docker cada
// vez que alguien envía el formulario. Está en un controller aparte de
// LeadsController para no heredar su JwtAuthGuard: acá la autenticación es
// la firma HMAC. No es accesible desde internet (el nginx del front devuelve
// 404 en /api/webhooks/).
@Controller('webhooks')
export class VbWebhookController {
  constructor(private service: LeadsService) {}

  // Siempre 200 si la firma y el body son válidos, aunque el lead ya
  // existiera o el evento no se conozca: cualquier otra respuesta hace que
  // vb-api reintente. Un error de base sí sale como 500 para que reintente.
  @Post('vb')
  @HttpCode(200)
  @UseGuards(VbSignatureGuard)
  async receive(@Body() dto: VbWebhookDto) {
    if (dto.evento === 'aplicacion.creada') {
      await this.service.ingestFromLanding(dto);
    }
    return { ok: true };
  }
}
