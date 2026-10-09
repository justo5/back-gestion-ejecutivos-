import { Column, Entity, PrimaryColumn } from 'typeorm';

// Registro de cada tarea automática ya generada. Sobrevive aunque la tarea se
// borre del tablero: así no se vuelve a crear algo que alguien eliminó a mano.
@Entity('recurring_occurrences')
export class RecurringOccurrence {
  // Carpeta donde se generó: el id del cliente, `general:agencia` o
  // `general:<executiveId>` (ver RecurringService).
  @PrimaryColumn('varchar')
  target: string;

  // Ver Occurrence.key en schedule.ts.
  @PrimaryColumn('varchar')
  key: string;

  @Column({ type: 'date' })
  dueDate: string;
}
