import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Executive } from './executive.entity';
import { Client } from '../clients/client.entity';
import { User } from '../users/user.entity';
import { ExecutivesService } from './executives.service';
import { ExecutivesController } from './executives.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TypeOrmModule.forFeature([Executive, Client, User]), TasksModule],
  providers: [ExecutivesService],
  controllers: [ExecutivesController],
  exports: [ExecutivesService],
})
export class ExecutivesModule {}
