import { IsNumber, IsString, Min } from 'class-validator';

export class UpsertPlanDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;
}
