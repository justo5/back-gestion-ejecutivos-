import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Todo opcional: lo que venga pisa lo que ya tiene el lead.
export class ConvertLeadDto {
  @IsOptional()
  @IsUUID()
  executiveId?: string;

  @IsOptional()
  @IsInt()
  planId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  rubro?: string;
}
