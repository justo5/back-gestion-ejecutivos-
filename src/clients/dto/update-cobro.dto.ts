import { IsBoolean, IsEnum, IsOptional, IsInt } from 'class-validator';
import { CollectedBy } from '../../cobros/cobro.entity';

export class UpdateCobroDto {
  @IsOptional()
  @IsInt()
  planId?: number | null;

  @IsOptional()
  @IsEnum(CollectedBy)
  collectedBy?: CollectedBy | null;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;
}
