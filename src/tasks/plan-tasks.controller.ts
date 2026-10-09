import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { PlanTasksService } from './plan-tasks.service';
import { RecurringService } from './recurring.service';
import { SavePlanTasksDto } from './dto/save-plan-tasks.dto';

@UseGuards(JwtAuthGuard)
@Controller('plan-tasks')
export class PlanTasksController {
  constructor(
    private planTasks: PlanTasksService,
    private recurring: RecurringService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.planTasks.findForUser(user);
  }

  // Admin: reemplaza las de la agencia. Ejecutivo: reemplaza las suyas. Después
  // recalcula las generadas que todavía no llegaron a su fecha.
  @Put()
  async save(@Body() dto: SavePlanTasksDto, @CurrentUser() user: AuthUser) {
    const tasks = await this.planTasks.replace(dto.tasks, user);
    const owner = this.planTasks.ownerOf(user);
    if (owner === null) await this.recurring.syncAll({ resetFuture: true });
    else await this.recurring.syncExecutive(owner);
    return tasks;
  }
}
