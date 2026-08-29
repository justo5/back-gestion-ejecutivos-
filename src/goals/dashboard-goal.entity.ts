import { Column, Entity, PrimaryColumn } from 'typeorm';

// Objetivo general del equipo a futuro, mostrado en el gráfico de crecimiento
// de clientes del dashboard (una línea punteada apuntando a targetClients en
// targetMonth). Es un singleton: siempre hay a lo sumo una fila con id fijo,
// el admin la reemplaza al editar el objetivo.
@Entity('dashboard_goals')
export class DashboardGoal {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column()
  targetClients: number;

  // Formato 'YYYY-MM', mismo formato que se usa para las series mensuales del
  // dashboard (ver formatYearMonth en el front).
  @Column()
  targetMonth: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
