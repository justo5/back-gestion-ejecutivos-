import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Client } from './client.entity';

// Tarea puntual de seguimiento de un cliente (pestaña "To Do" de la ficha).
// Antes vivía en localStorage del navegador; ahora es tabla propia para que
// sea la misma para todos los dispositivos/ejecutivos y se pueda extender a
// futuro (fecha límite, responsable, prioridad, etc.) sin tocar `clients`.
@Entity('client_todos')
export class ClientTodo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, (client) => client.todos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column()
  clientId: string;

  @Column()
  text: string;

  @Column({ default: false })
  done: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
