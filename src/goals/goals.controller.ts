import { Body, Controller, Delete, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { SetGoalDto } from './dto/set-goal.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('goals')
export class GoalsController {
  constructor(private service: GoalsService) {}

  // Cualquier usuario autenticado lo lee (lo necesita el gráfico del dashboard).
  @Get()
  findCurrent() {
    return this.service.findCurrent();
  }

  // Solo el admin define/edita el objetivo general del equipo.
  @Roles(UserRole.ADMIN)
  @Put()
  set(@Body() dto: SetGoalDto) {
    return this.service.set(dto.targetClients, dto.targetMonth);
  }

  @Roles(UserRole.ADMIN)
  @Delete()
  @HttpCode(204)
  clear() {
    return this.service.clear();
  }
}
