import { Type } from 'class-transformer';
import { IsInt, IsPositive, Matches } from 'class-validator';

export class SetGoalDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  targetClients: number;

  // 'YYYY-MM'
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'targetMonth debe tener formato YYYY-MM' })
  targetMonth: string;
}
