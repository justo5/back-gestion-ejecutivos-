import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { UpsertPlanDto } from './dto/upsert-plan.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plans')
export class PlansController {
  constructor(private service: PlansService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(UserRole.ADMIN)
  @Put(':id')
  upsert(@Param('id') id: string, @Body() dto: UpsertPlanDto) {
    return this.service.upsert(Number(id), dto.name, dto.price);
  }
}
