import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Client } from '../clients/client.entity';

@Entity('executives')
export class Executive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  squad: string;

  @OneToMany(() => Client, (client) => client.executive)
  clients: Client[];

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
