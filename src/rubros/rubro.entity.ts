import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Lista de rubros configurable por el admin. Se usa para poblar el desplegable
// de "Rubro" al crear/editar un cliente. Los clientes guardan el rubro como
// texto (por nombre), igual que el plan, así que la lista puede editarse libremente.
@Entity('rubros')
export class Rubro {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;
}
