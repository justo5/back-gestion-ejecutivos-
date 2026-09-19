import { ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

export class TransferClientsDto {
  @IsUUID()
  targetExecutiveId: string;

  // Clientes puntuales a traspasar. Si se omite, se traspasa TODA la cartera
  // del ejecutivo de origen (incluidos los dados de baja, que conservan su
  // historial de cobros).
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  clientIds?: string[];
}
