import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ExecutivesService } from './executives.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ImportExecutivesDto } from './dto/import-executives.dto';
import { CreateExecutiveDto } from './dto/create-executive.dto';
import { UpdateExecutiveDto } from './dto/update-executive.dto';
import { TransferClientsDto } from './dto/transfer-clients.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('executives')
export class ExecutivesController {
  constructor(private service: ExecutivesService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAllForUser(user);
  }

  // Crecimiento de la empresa completa: sin @Roles y sin filtrar por
  // ejecutivo (ver ExecutivesService#getGeneralGrowth), para que cualquier
  // ejecutivo vea cómo va el equipo en conjunto, no solo su propia cartera.
  // Declarado antes de ':id' para que Nest no lo confunda con ese parámetro.
  @Get('growth/general')
  generalGrowth() {
    return this.service.getGeneralGrowth();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOneForUser(id, user);
  }

  @Roles(UserRole.ADMIN)
  @Post('import')
  import(@Body() dto: ImportExecutivesDto) {
    return this.service.importAll(dto);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateExecutiveDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExecutiveDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  // Traspasa clientes (los indicados en clientIds, o toda la cartera si se
  // omite) del ejecutivo :id al ejecutivo targetExecutiveId.
  @Roles(UserRole.ADMIN)
  @Post(':id/transfer-clients')
  transferClients(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferClientsDto) {
    return this.service.transferClients(id, dto);
  }

  // Sin @Roles: tanto el admin como el propio ejecutivo pueden cambiar su
  // foto (el service valida con assertAccess que no sea la de otro).
  @Patch(':id/image')
  updateImage(@Param('id') id: string, @Body('imageUrl') imageUrl: string, @CurrentUser() user: AuthUser) {
    return this.service.updateImage(id, imageUrl, user);
  }
}
