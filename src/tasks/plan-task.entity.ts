import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Executive } from '../executives/executive.entity';
import { Plan } from '../cobros/plan.entity';
import type { Repeat } from './schedule';

// Tarea automática: se genera sola en el tablero cada mes, cada semana o todos
// los días (ver RecurringService).
//
// - De la agencia (executiveId null): la configura el admin desde
//   Configuración y aplica a los clientes de todos los ejecutivos.
// - De un ejecutivo (executiveId): la carga él desde su Perfil y aplica solo a
//   su cartera.
//
// `general` = no es de ningún cliente: va a la carpeta General de quien la
// configuró (la de la agencia o la del ejecutivo). Si no, aplica a los
// clientes con el plan `planId` (null = con cualquier plan), siguiendo el
// ciclo de cobro de cada cliente (arranca en su contactDay).
@Entity('plan_tasks')
export class PlanTask {
  // Lo genera el front: forma parte de la clave de cada ocurrencia generada,
  // así que editar el título de una tarea no la duplica.
  @PrimaryColumn('uuid')
  id: string;

  @ManyToOne(() => Executive, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'executiveId' })
  executive: Executive | null;

  @Column({ type: 'uuid', nullable: true })
  executiveId: string | null;

  // Si se borra el plan, sus tareas automáticas se van con él.
  @ManyToOne(() => Plan, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'planId' })
  plan: Plan | null;

  @Column({ type: 'int', nullable: true })
  planId: number | null;

  @Column({ default: false })
  general: boolean;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  // varchar y no enum de Postgres, igual que Client.statusOverride.
  @Column({ type: 'varchar', default: 'monthly' })
  repeat: Repeat;

  @Column({ type: 'int' })
  day: number;

  // Orden en el que se cargaron en el editor.
  @Column({ type: 'int', default: 0 })
  position: number;
}
