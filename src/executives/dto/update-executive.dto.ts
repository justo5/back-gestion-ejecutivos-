import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateExecutiveDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name?: string;

  // '' o null limpia el squad.
  @IsOptional()
  @Transform(trim)
  @IsString()
  squad?: string | null;
}
