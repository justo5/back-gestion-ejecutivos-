import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Executive } from '../executives/executive.entity';
import { Client } from '../clients/client.entity';
import { Plan } from '../cobros/plan.entity';

// Estados de un lead. String (no enum de Postgres) a propósito, igual que
// Client.statusOverride: sumar un estado es un cambio de código, no un ALTER TYPE.
export const LEAD_STATUS_VALUES = ['nuevo', 'contactado', 'convertido', 'descartado'] as const;
export type LeadStatus = (typeof LEAD_STATUS_VALUES)[number];

// Rangos de inversión mensual que ofrece el formulario de la landing. La
// columna es varchar (sin enum ni CHECK), así que sumar un valor no requiere
// migración; solo actualizar esta lista y las etiquetas del front.
export const LEAD_INVERSION_VALUES = ['cero', 'menos-300', '300-700', '700-1500', 'mas-1500'] as const;
export type LeadInversion = (typeof LEAD_INVERSION_VALUES)[number];

// Solicitud que llega desde el formulario público de la landing de Vamos Bien,
// reenviada por vb-api vía webhook (ver VbWebhookController). Vive separada de
// Client porque un envío público todavía no es cliente ni tiene ejecutivo: el
// admin lo asigna y lo convierte desde el panel.
@Entity('leads')
@Index(['status', 'createdAt'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // "id" de la aplicación en la base de la landing. Es único porque vb-api
  // reintenta los envíos fallidos y la misma aplicación puede llegar varias
  // veces: el insert usa ON CONFLICT DO NOTHING sobre esta columna.
  @Column({ type: 'int', unique: true })
  externalId: number;

  @Column({ type: 'varchar', default: 'landing-vb' })
  source: string;

  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'varchar', length: 80 })
  apellido: string;

  // Sitio web o Instagram que dejó la persona. Al convertir pasa a Client.fanpage.
  @Column({ type: 'varchar', length: 200 })
  contacto: string;

  @Column({ type: 'varchar', length: 30 })
  whatsapp: string;

  // Texto libre que escribió la persona; no tiene por qué coincidir con la
  // lista configurable de rubros.
  @Column({ type: 'varchar', length: 120 })
  rubro: string;

  @Column({ type: 'varchar' })
  inversion: LeadInversion;

  // Nombre del plan tal como lo manda la landing. Se conserva aunque no
  // coincida con ningún plan de configuración.
  @Column({ type: 'varchar', length: 120 })
  planName: string;

  // Plan de configuración resuelto por nombre al recibir el lead. null = no
  // coincidió con ninguno y el admin lo elige al convertir.
  @ManyToOne(() => Plan, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'planId' })
  plan: Plan | null;

  @Column({ type: 'int', nullable: true })
  planId: number | null;

  @Column({ type: 'timestamptz' })
  consentimientoAt: Date;

  @Column({ type: 'varchar', default: 'nuevo' })
  status: LeadStatus;

  // Ejecutivo asignado a mano desde el panel.
  @ManyToOne(() => Executive, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'executiveId' })
  executive: Executive | null;

  @Column({ type: 'uuid', nullable: true })
  executiveId: string | null;

  // Cliente creado al convertir el lead.
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clientId' })
  client: Client | null;

  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // "createdAt" de la aplicación en la landing, o sea cuándo la persona envió
  // el formulario (createdAt de acá es cuándo llegó el webhook).
  @Column({ type: 'timestamptz' })
  externalCreatedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
