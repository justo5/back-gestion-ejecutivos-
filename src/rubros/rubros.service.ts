import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rubro } from './rubro.entity';

@Injectable()
export class RubrosService {
  constructor(@InjectRepository(Rubro) private repo: Repository<Rubro>) {}

  findAll() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  // Reemplaza toda la lista por los nombres provistos. Los clientes referencian
  // el rubro por texto, así que regenerar los ids no rompe nada.
  async setAll(names: string[]) {
    const clean = names.map((n) => n.trim()).filter((n) => n.length > 0);
    await this.repo.clear();
    if (clean.length) {
      await this.repo.save(clean.map((name) => this.repo.create({ name })));
    }
    return this.findAll();
  }
}
