import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Client } from '../clients/client.entity';
import { Plan } from './plan.entity';

export enum CollectedBy {
  EJECUTIVO = 'ejecutivo',
  AGENCIA = 'agencia',
}

@Entity('cobros')
export class Cobro {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Client, (client) => client.cobro, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column({ unique: true })
  clientId: string;

  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'planId' })
  plan: Plan | null;

  @Column({ nullable: true })
  planId: number | null;

  @Column({ type: 'enum', enum: CollectedBy, nullable: true })
  collectedBy: CollectedBy | null;

  @Column({ type: 'jsonb', nullable: true })
  collectedByMonth: Record<string, CollectedBy> | null;

  @Column({ type: 'text', array: true, default: '{}' })
  paidMonths: string[];

  // Para cada mes de "paidMonths", en qué mes calendario se cobró realmente
  // la plata (yearMonth "2026-08"). Un cliente que debía julio y paga recién
  // en agosto queda con collectedInMonth['2026-07'] = '2026-08': el mes
  // adeudado sigue siendo julio, pero el ingreso impacta en el reporte de
  // agosto, que es cuando efectivamente entró la plata.
  @Column({ type: 'jsonb', nullable: true })
  collectedInMonth: Record<string, string> | null;

  // Gasto puntual de un mes específico (no se repite en los demás meses),
  // guardado por yearMonth ("2026-08") igual que collectedByMonth.
  @Column({ type: 'jsonb', nullable: true })
  gastosByMonth: Record<string, number> | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
