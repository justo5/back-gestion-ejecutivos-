import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
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
  @Post()
  create(@Body() dto: UpsertPlanDto) {
    return this.service.create(dto.name, dto.price);
  }

  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertPlanDto) {
    return this.service.update(Number(id), dto.name, dto.price);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}
