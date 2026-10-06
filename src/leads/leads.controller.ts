import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';

// Solicitudes de la landing, gestionadas desde el panel. El alta la hace el
// webhook (VbWebhookController); acá solo se listan, editan y convierten.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private service: LeadsService) {}

  @Get()
  findAll(@Query() query: ListLeadsQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(query, user);
  }

  // Contador del menú: cuántas solicitudes visibles para el usuario siguen en "nuevo".
  @Get('count-new')
  countNew(@CurrentUser() user: AuthUser) {
    return this.service.countNew(user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/convert')
  convert(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConvertLeadDto, @CurrentUser() user: AuthUser) {
    return this.service.convert(id, dto, user);
  }
}
