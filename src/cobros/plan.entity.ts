import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // El driver de Postgres devuelve las columnas `numeric` como string para no
  // perder precisión. Sin este transformer el front recibe price: "350.00" y
  // cualquier suma termina concatenando ("0350.00490.00") en vez de sumar.
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  price: number;
}
