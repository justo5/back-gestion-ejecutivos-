import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

// "convertido" no se acepta acá: solo se llega a ese estado con
// POST /leads/:id/convert, que además crea el cliente.
export const EDITABLE_LEAD_STATUS_VALUES = ['nuevo', 'contactado', 'descartado'] as const;

export class UpdateLeadDto {
  @IsOptional()
  @IsIn(EDITABLE_LEAD_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  // executiveId y planId solo los puede cambiar el admin (se valida en el service).
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  executiveId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  planId?: number | null;
}
