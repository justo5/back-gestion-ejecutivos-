import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  fanpage?: string | null;

  @IsOptional()
  @IsString()
  plan?: string | null;

  @IsOptional()
  @IsString()
  country?: string | null;

  @IsOptional()
  @IsString()
  sexo?: string | null;

  @IsOptional()
  @IsInt()
  edad?: number | null;

  @IsOptional()
  @IsString()
  collectedBy?: string | null;

  @IsOptional()
  @IsString()
  rubro?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  contactDay?: string | null;
}
