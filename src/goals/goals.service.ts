import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardGoal } from './dashboard-goal.entity';

const GOAL_ID = 1;

@Injectable()
export class GoalsService {
  constructor(@InjectRepository(DashboardGoal) private repo: Repository<DashboardGoal>) {}

  // null si nunca se definió un objetivo.
  findCurrent() {
    return this.repo.findOneBy({ id: GOAL_ID });
  }

  async set(targetClients: number, targetMonth: string) {
    await this.repo.save(this.repo.create({ id: GOAL_ID, targetClients, targetMonth, updatedAt: new Date() }));
    return this.findCurrent();
  }

  async clear() {
    await this.repo.delete({ id: GOAL_ID });
  }
}
