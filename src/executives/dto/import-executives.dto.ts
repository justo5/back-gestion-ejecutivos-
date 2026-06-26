import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ImportClientDto {
  @IsString()
  name: string;

  @IsBoolean()
  active: boolean;

  @IsOptional()
  @IsNumber()
  contactDay?: number | null;

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
