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

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
