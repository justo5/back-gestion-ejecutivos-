import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardGoal } from './dashboard-goal.entity';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DashboardGoal])],
  providers: [GoalsService],
  controllers: [GoalsController],
})
export class GoalsModule {}
