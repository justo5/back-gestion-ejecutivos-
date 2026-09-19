import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBajaDto {
  // Nueva fecha de baja, 'YYYY-MM-DD' (o ISO completo).
  @IsOptional()
  @IsDateString()
  deletedAt?: string;

  // null o '' limpia el motivo.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deletedReason?: string | null;
}
