import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { LEAD_INVERSION_VALUES } from '../lead.entity';

// Body del webhook "aplicacion.creada" que manda vb-api. El ValidationPipe
// global usa whitelist, así que todos los campos tienen que estar declarados
// acá (incluido "evento") o se descartan antes de llegar al controller.
export class VbWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  evento: string;

  @IsInt()
  @IsPositive()
  id: number;

  @IsISO8601()
  createdAt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  plan: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  apellido: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  contacto: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  whatsapp: string;

  // Opcional: la landing puede no mandarlo (o mandarlo en null).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  redes?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  rubro: string;

  @IsIn(LEAD_INVERSION_VALUES)
  inversion: string;

  @IsISO8601()
  consentimientoAt: string;
}
