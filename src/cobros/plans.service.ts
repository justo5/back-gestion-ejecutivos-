import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './plan.entity';

@Injectable()
export class PlansService {
  constructor(@InjectRepository(Plan) private repo: Repository<Plan>) {}

  findAll() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  // prepaid sin mandar = no se toca (no se pisa con false).
  async update(id: number, name: string, price: number, prepaid?: boolean) {
    await this.repo.update(id, { name, price, ...(prepaid !== undefined && { prepaid }) });
    return this.repo.findOneBy({ id });
  }

  create(name: string, price: number, prepaid = false) {
    return this.repo.save(this.repo.create({ name, price, prepaid }));
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }
}
