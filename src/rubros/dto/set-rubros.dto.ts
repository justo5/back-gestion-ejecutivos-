import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetRubrosDto {
  // Lista completa de nombres de rubros. Reemplaza a la existente.
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  names: string[];
}
