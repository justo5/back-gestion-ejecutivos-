import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { BoardColumn, COLUMNS } from '../task.entity';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTaskDto {
  // El front manda el id para mostrar la tarea antes de que responda el backend.
  @IsUUID()
  id: string;

  // 'general' o el id de un cliente.
  @IsString()
  @IsNotEmpty()
  folderId: string;

  @IsIn(COLUMNS)
  column: BoardColumn;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  dueDate?: string | null;
}
