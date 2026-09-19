import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateExecutiveDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  squad?: string | null;

  // Opcionales, pero van juntos: si vienen, se crea también el usuario con
  // el que el ejecutivo inicia sesión (rol ejecutivo, atado a este ejecutivo).
  // Sin ellos el ejecutivo existe pero nadie puede loguearse como él.
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
