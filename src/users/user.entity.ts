import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Executive } from '../executives/executive.entity';

export enum UserRole {
  ADMIN = 'admin',
  EJECUTIVO = 'ejecutivo',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column()
  name: string;

  // Set only for role=ejecutivo. Admins see all executives, so this stays null for them.
  @ManyToOne(() => Executive, { nullable: true })
  @JoinColumn({ name: 'executiveId' })
  executive: Executive | null;

  @Column({ nullable: true })
  executiveId: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
