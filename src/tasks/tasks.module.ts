import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/client.entity';
import { Executive } from '../executives/executive.entity';
import { Plan } from '../cobros/plan.entity';
import { Task } from './task.entity';
import { PlanTask } from './plan-task.entity';
import { RecurringOccurrence } from './recurring-occurrence.entity';
import { TasksService } from './tasks.service';
import { PlanTasksService } from './plan-tasks.service';
import { RecurringService } from './recurring.service';
import { ClientTodosMigration } from './client-todos.migration';
import { TasksController } from './tasks.controller';
import { PlanTasksController } from './plan-tasks.controller';

// Tablero de tareas (página Tareas del front) y tareas automáticas.
// RecurringService se exporta para que clientes, ejecutivos y solicitudes
// recalculen las automáticas cuando cambia algo de un cliente.
@Module({
  imports: [TypeOrmModule.forFeature([Task, PlanTask, RecurringOccurrence, Client, Executive, Plan])],
  providers: [TasksService, PlanTasksService, RecurringService, ClientTodosMigration],
  controllers: [TasksController, PlanTasksController],
  exports: [RecurringService],
})
export class TasksModule {}
