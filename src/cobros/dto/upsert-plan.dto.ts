import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class UpsertPlanDto {
  @IsString()
  name: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}
