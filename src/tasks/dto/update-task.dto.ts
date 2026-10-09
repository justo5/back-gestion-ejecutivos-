import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ISO_DATE } from './create-task.dto';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;

  // null quita la fecha.
  @IsOptional()
  @Matches(ISO_DATE)
  dueDate?: string | null;
}
