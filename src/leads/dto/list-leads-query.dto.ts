import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { LEAD_STATUS_VALUES } from '../lead.entity';

export class ListLeadsQueryDto {
  @IsOptional()
  @IsIn(LEAD_STATUS_VALUES)
  status?: string;

  // Solo lo tiene en cuenta el admin; a un ejecutivo siempre se le filtra por
  // el suyo (ver LeadsService#findAll).
  @IsOptional()
  @IsUUID()
  executiveId?: string;
}
