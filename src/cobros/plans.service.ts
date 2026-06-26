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

  async upsert(id: number, name: string, price: number) {
    await this.repo.upsert({ id, name, price }, ['id']);
    return this.repo.findOneBy({ id });
  }
}
