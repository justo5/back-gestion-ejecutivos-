import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Executive } from '../executives/executive.entity';
import { Cobro } from '../cobros/cobro.entity';

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

  @Column({ default: false })
  active: boolean;

  // Day of month the client is expected to be contacted/collected.
  @Column({ nullable: true })
  contactDay: number | null;

  // Original spreadsheet row, columns vary by import, kept as-is for display.
  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, unknown>;

  @OneToOne(() => Cobro, (cobro) => cobro.client)
  cobro: Cobro;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
