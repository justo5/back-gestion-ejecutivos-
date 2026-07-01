import { IsObject, IsOptional, IsInt, IsArray, IsString } from 'class-validator';
import { CollectedBy } from '../../cobros/cobro.entity';

export class UpdateCobroDto {
  @IsOptional()
  @IsInt()
  planId?: number | null;

  @IsOptional()
  @IsObject()
  collectedByMonth?: Record<string, CollectedBy>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paidMonths?: string[];
}
