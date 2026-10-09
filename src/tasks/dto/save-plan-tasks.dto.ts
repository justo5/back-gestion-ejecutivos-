import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LAST_DAY, REPEATS, type Repeat } from '../schedule';

export class PlanTaskDto {
  @IsUUID()
  id: string;

  // null = todos los planes. Se ignora si `general`.
  @IsOptional()
  @IsInt()
  planId?: number | null;

  @IsBoolean()
  general: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsIn(REPEATS)
  repeat: Repeat;

  @IsInt()
  @Min(1)
  @Max(LAST_DAY)
  day: number;
}

export class SavePlanTasksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanTaskDto)
  tasks: PlanTaskDto[];
}
