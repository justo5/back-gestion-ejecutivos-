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

  async update(id: number, name: string, price: number) {
    await this.repo.update(id, { name, price });
    return this.repo.findOneBy({ id });
  }

  create(name: string, price: number) {
    return this.repo.save(this.repo.create({ name, price }));
  }

  async remove(id: number) {
    await this.repo.delete(id);
  }
}
