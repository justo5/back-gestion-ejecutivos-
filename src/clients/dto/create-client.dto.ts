import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateClientDto {
  // Only used (and required) when the caller is an admin creating a client
  // on behalf of an executive. Ignored for ejecutivo callers, who can only
  // ever create clients under their own executiveId.
  @IsOptional()
  @IsString()
  executiveId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  fanpage?: string | null;

  @IsOptional()
  @IsString()
  adAccount?: string | null;

  // Texto libre del plan (legacy/observación). El plan "real" del cobro se
  // elige del desplegable de configuración vía `planId`.
  @IsOptional()
  @IsString()
  plan?: string | null;

  // Plan de configuración elegido en el desplegable al cargar el cliente.
  // Si viene, se crea el cobro del cliente apuntando a este plan.
  @IsOptional()
  @IsInt()
  planId?: number | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  usd?: string | null;

  @IsOptional()
  @IsString()
  ars?: string | null;

  @IsOptional()
  @IsString()
  collectedBy?: string | null;

  // Rubro del cliente, elegido del desplegable configurable.
  @IsOptional()
  @IsString()
  rubro?: string | null;

  @IsBoolean()
  active: boolean;

  @IsOptional()
  @IsDateString()
  contactDay?: string | null;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
