import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Executive } from '../executives/executive.entity';
import { Cobro } from '../cobros/cobro.entity';
import { ClientTodo } from './client-todo.entity';

// Valores válidos de statusOverride. String (no enum de Postgres) a propósito:
// agregar un estado nuevo el día de mañana es un cambio de código, no un
// ALTER TYPE en la base.
export const CLIENT_STATUS_VALUES = ['active', 'warning', 'critical'] as const;
export type ClientStatusOverride = (typeof CLIENT_STATUS_VALUES)[number];

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Executive, (executive) => executive.clients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'executiveId' })
  executive: Executive;

  @Column()
  executiveId: string;

  @Column()
  name: string;

  // Facebook/Instagram fan page tied to the client.
  @Column({ type: 'varchar', nullable: true })
  fanpage: string | null;

  // Contracted plan/service description, e.g. "Plan ejecución 350usd".
  @Column({ type: 'varchar', nullable: true })
  plan: string | null;

  // Client's country, e.g. "Argentina".
  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  // Sexo del cliente.
  @Column({ type: 'varchar', nullable: true })
  sexo: string | null;

  // Edad del cliente.
  @Column({ type: 'int', nullable: true })
  edad: number | null;

  // Who collects the payment for this client, e.g. "VB" or the executive's name.
  @Column({ type: 'varchar', nullable: true })
  collectedBy: string | null;

  // Rubro/industria del cliente, elegido del desplegable configurable. Se guarda
  // como texto (por nombre) para desacoplarlo de la lista de rubros.
  @Column({ type: 'varchar', nullable: true })
  rubro: string | null;

  @Column({ default: false })
  active: boolean;

  // Concrete date (day/month/year) the client is expected to be contacted/collected.
  @Column({ type: 'date', nullable: true })
  contactDay: string | null;

  // Original spreadsheet row, columns vary by import, kept as-is for display.
  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  @OneToOne(() => Cobro, (cobro) => cobro.client)
  cobro: Cobro;

  // --- Ficha extendida del cliente (antes vivía en localStorage del navegador) ---

  // Nota libre del ejecutivo sobre el cliente (pestaña "Notas" de la ficha).
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Override manual del estado semafórico que por defecto calcula el
  // frontend (activo/atención/crítico según pagos). null = usar el
  // calculado automáticamente.
  @Column({ type: 'varchar', nullable: true })
  statusOverride: ClientStatusOverride | null;

  // Override manual del link de contacto mostrado en la ficha (por defecto
  // el frontend arma uno propio si no hay override).
  @Column({ type: 'varchar', nullable: true })
  linkOverride: string | null;

  @OneToMany(() => ClientTodo, (todo) => todo.client)
  todos: ClientTodo[];

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  // Soft delete: "eliminar cliente" no borra la fila (arrastraría en cascada
  // el Cobro y con él el historial de pagos ya cobrados). En cambio se marca
  // con la fecha de baja acá; el cliente deja de aparecer como activo/futuro
  // en toda la app, pero su historial sigue disponible para los meses
  // anteriores a esta fecha (ver Cobros).
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
