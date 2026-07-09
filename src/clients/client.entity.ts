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

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
