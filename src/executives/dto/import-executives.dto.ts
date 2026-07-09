import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ImportClientDto {
  @IsString()
  name: string;

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

  @IsBoolean()
  active: boolean;

  @IsOptional()
  @IsDateString()
  contactDay?: string | null;

  @IsObject()
  data: Record<string, unknown>;
}

export class ImportExecutiveDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  squad?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportClientDto)
  clients: ImportClientDto[];
}

export class ImportExecutivesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportExecutiveDto)
  executives: ImportExecutiveDto[];
}
