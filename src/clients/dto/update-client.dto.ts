import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  fanpage?: string | null;

  @IsOptional()
  @IsString()
  adAccount?: string | null;

  @IsOptional()
  @IsString()
  plan?: string | null;

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
