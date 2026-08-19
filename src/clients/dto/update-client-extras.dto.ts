import { IsIn, IsOptional, IsString } from 'class-validator';
import { CLIENT_STATUS_VALUES, ClientStatusOverride } from '../client.entity';

export class UpdateClientExtrasDto {
  @IsOptional()
  @IsString()
  notes?: string;

  // null limpia el override y vuelve a usar el estado calculado.
  @IsOptional()
  @IsIn([...CLIENT_STATUS_VALUES, null])
  statusOverride?: ClientStatusOverride | null;

  @IsOptional()
  @IsString()
  linkOverride?: string | null;
}
