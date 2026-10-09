import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BoardColumn, COLUMNS } from '../task.entity';

export class MoveTaskDto {
  @IsString()
  @IsNotEmpty()
  folderId: string;

  @IsIn(COLUMNS)
  column: BoardColumn;

  // Ids de la columna destino en el nuevo orden. Si falta, la tarea va arriba de todo.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  order?: string[];
}
