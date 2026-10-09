import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './client.entity';
import { Cobro } from '../cobros/cobro.entity';
import { ClientsService } from './clients.service';
import { ClientPlanBackfill } from './client-plan.backfill';
import { ClientsController } from './clients.controller';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Cobro]), TasksModule],
  providers: [ClientsService, ClientPlanBackfill],
  exports: [ClientsService],
  controllers: [ClientsController],
})
export class ClientsModule {}
