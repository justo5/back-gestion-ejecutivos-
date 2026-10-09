import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Client } from '../clients/client.entity';
import { Executive } from '../executives/executive.entity';

export const PRIORITIES = ['red', 'yellow', 'green'] as const;
export const COLUMNS = [...PRIORITIES, 'done', 'discarded'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type BoardColumn = (typeof COLUMNS)[number];

export function isPriority(column: string): column is Priority {
  return (PRIORITIES as readonly string[]).includes(column);
}

// Tarea del tablero (página Tareas). Cada tarea vive en una "carpeta": la de
// un cliente (clientId) o la General de alguien (clientId null). La General
// del admin es la de la agencia (executiveId null) y cada ejecutivo tiene la
// suya (executiveId). Reemplaza a la vieja tabla client_todos.
@Entity('tasks')
export class Task {
  // Sin default: el front genera el id para mostrar la tarea antes de que
  // responda el backend (ver TaskStore en el front).
  @PrimaryColumn('uuid')
  id: string;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  // Solo para las tareas de General (clientId null): de quién es esa General.
  // null = la de la agencia, la que ven los admins.
  @ManyToOne(() => Executive, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'executiveId' })
  executive: Executive | null;

  @Column({ type: 'uuid', nullable: true })
  executiveId: string | null;

  // "column" es palabra reservada en SQL: en la base se llama boardColumn.
  @Column({ type: 'varchar', name: 'boardColumn' })
  column: BoardColumn;

  // Orden dentro de la columna (menor = más arriba).
  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  // Último color que tuvo la tarea; se conserva al pasarla a Hecho/Descartar
  // para poder devolverla a donde estaba.
  @Column({ type: 'varchar' })
  priority: Priority;

  // Una tarea con fecha aparece en el tablero recién ese día; hasta entonces
  // se ve en "Próximas".
  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  // `<carpeta>/<ocurrencia>` si la generó una tarea automática; null si se
  // creó a mano. Ver RecurringService.
  @Column({ type: 'varchar', nullable: true })
  recurrenceKey: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
