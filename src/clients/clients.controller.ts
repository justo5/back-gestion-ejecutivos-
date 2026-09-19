import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { UpdateCobroDto } from './dto/update-cobro.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientExtrasDto } from './dto/update-client-extras.dto';
import { UpdateBajaDto } from './dto/update-baja.dto';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private service: ClientsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAllForUser(user);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.service.createClient(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: AuthUser) {
    return this.service.updateClient(id, dto, user);
  }

  @Patch(':id/cobro')
  updateCobro(@Param('id') id: string, @Body() dto: UpdateCobroDto, @CurrentUser() user: AuthUser) {
    return this.service.updateCobro(id, dto, user);
  }

  @Patch(':id/image')
  updateImage(@Param('id') id: string, @Body('imageUrl') imageUrl: string, @CurrentUser() user: AuthUser) {
    return this.service.updateImage(id, imageUrl, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteClient(id, user);
  }

  // --- Bajas: editar fecha/motivo y eliminar la baja (reactiva al cliente) ---

  @Patch(':id/baja')
  updateBaja(@Param('id') id: string, @Body() dto: UpdateBajaDto, @CurrentUser() user: AuthUser) {
    return this.service.updateBaja(id, dto, user);
  }

  @Delete(':id/baja')
  @HttpCode(204)
  removeBaja(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeBaja(id, user);
  }

  // Borrado definitivo (irreversible) de un cliente ya dado de baja.
  @Delete(':id/permanent')
  @HttpCode(204)
  removePermanently(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteClientPermanently(id, user);
  }

  // --- Ficha extendida: notas / estado / link ---

  @Patch(':id/extras')
  updateExtras(@Param('id') id: string, @Body() dto: UpdateClientExtrasDto, @CurrentUser() user: AuthUser) {
    return this.service.updateExtras(id, dto, user);
  }

  // --- To Do del cliente ---

  @Post(':id/todos')
  addTodo(@Param('id') id: string, @Body() dto: CreateTodoDto, @CurrentUser() user: AuthUser) {
    return this.service.addTodo(id, dto, user);
  }

  @Patch(':id/todos/:todoId')
  updateTodo(
    @Param('id') id: string,
    @Param('todoId') todoId: string,
    @Body() dto: UpdateTodoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateTodo(id, todoId, dto, user);
  }

  @Delete(':id/todos/:todoId')
  @HttpCode(204)
  removeTodo(@Param('id') id: string, @Param('todoId') todoId: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteTodo(id, todoId, user);
  }
}
