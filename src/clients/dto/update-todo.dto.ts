import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTodoDto {
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;
}
