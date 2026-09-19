import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './client.entity';
import { ClientTodo } from './client-todo.entity';
import { Cobro } from '../cobros/cobro.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { UpdateCobroDto } from './dto/update-cobro.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientExtrasDto } from './dto/update-client-extras.dto';
import { UpdateBajaDto } from './dto/update-baja.dto';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client) private clientsRepo: Repository<Client>,
    @InjectRepository(Cobro) private cobrosRepo: Repository<Cobro>,
    @InjectRepository(ClientTodo) private clientTodosRepo: Repository<ClientTodo>,
  ) {}

  // Same rule as ExecutivesService: an ejecutivo can only ever see clients
  // tied to their own executiveId, regardless of what's requested.
  async findAllForUser(user: AuthUser) {
    const where = user.role === 'admin' ? {} : { executiveId: user.executiveId ?? '__none__' };
    const clients = await this.clientsRepo.find({
      where,
      relations: ['executive', 'cobro', 'cobro.plan', 'todos'],
    });
    // Más nuevo primero, como quedaban en el localStorage viejo.
    clients.forEach((c) => c.todos?.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    return clients;
  }

  // Centraliza la regla de acceso usada por todos los endpoints de :id: un
  // ejecutivo solo puede tocar clientes de su propio executiveId, un admin
  // puede tocar cualquiera. La reutilizan tanto los endpoints existentes
  // como cualquier función nueva que se agregue sobre un cliente puntual.
  private async findOwnedClient(clientId: string, user: AuthUser): Promise<Client> {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (user.role !== 'admin' && user.executiveId !== client.executiveId) {
      throw new ForbiddenException('No tenés acceso a este cliente');
    }
    return client;
  }

  async updateClient(clientId: string, dto: import('./dto/update-client.dto').UpdateClientDto, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);

    Object.assign(client, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.fanpage !== undefined && { fanpage: dto.fanpage }),
      ...(dto.plan !== undefined && { plan: dto.plan }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.sexo !== undefined && { sexo: dto.sexo }),
      ...(dto.edad !== undefined && { edad: dto.edad }),
      ...(dto.collectedBy !== undefined && { collectedBy: dto.collectedBy }),
      ...(dto.rubro !== undefined && { rubro: dto.rubro }),
      ...(dto.iva !== undefined && { iva: dto.iva }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.contactDay !== undefined && { contactDay: dto.contactDay }),
    });

    return this.clientsRepo.save(client);
  }

  async updateCobro(clientId: string, dto: UpdateCobroDto, user: AuthUser) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId }, relations: ['cobro'] });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (user.role !== 'admin' && user.executiveId !== client.executiveId) {
      throw new ForbiddenException('No tenés acceso a este cliente');
    }

    let cobro = client.cobro;
    if (!cobro) {
      cobro = this.cobrosRepo.create({ clientId });
    }
    if (dto.planId !== undefined) cobro.planId = dto.planId;
    if (dto.collectedByMonth !== undefined) cobro.collectedByMonth = dto.collectedByMonth;
    if (dto.paidMonths !== undefined) cobro.paidMonths = dto.paidMonths;
    if (dto.collectedInMonth !== undefined) cobro.collectedInMonth = dto.collectedInMonth;
    if (dto.gastosByMonth !== undefined) cobro.gastosByMonth = dto.gastosByMonth;
    if (dto.ivaByMonth !== undefined) cobro.ivaByMonth = dto.ivaByMonth;
    cobro.updatedAt = new Date();
    return this.cobrosRepo.save(cobro);
  }

  // Foto del cliente, igual que ExecutivesService#updateImage pero acá
  // cualquier ejecutivo dueño del cliente puede cambiarla, no solo el admin.
  async updateImage(clientId: string, imageUrl: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    client.imageUrl = imageUrl || null;
    return this.clientsRepo.save(client);
  }

  // Soft delete: no se borra la fila (eso arrastraría en cascada el Cobro y
  // con él todo el historial de pagos ya cobrados). Se marca deletedAt y listo:
  // el cliente deja de contar como activo/futuro en todos lados, pero su
  // historial sigue disponible para los meses anteriores a la baja.
  async deleteClient(clientId: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (client.deletedAt) return;
    client.deletedAt = new Date();
    await this.clientsRepo.save(client);
  }

  // --- Bajas: editar fecha/motivo y eliminar la baja ---

  // Solo aplica a clientes que ya están dados de baja. La fecha llega como
  // 'YYYY-MM-DD' desde un input date: se guarda a mediodía UTC para que en
  // cualquier huso horario razonable (Argentina incluida) siga cayendo en el
  // mismo día calendario, en vez de correrse al día anterior con las 00:00 UTC.
  async updateBaja(clientId: string, dto: UpdateBajaDto, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (!client.deletedAt) throw new BadRequestException('El cliente no está dado de baja');

    if (dto.deletedAt !== undefined) {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dto.deletedAt);
      const date = new Date(isDateOnly ? `${dto.deletedAt}T12:00:00Z` : dto.deletedAt);
      if (isNaN(date.getTime())) throw new BadRequestException('Fecha de baja inválida');
      client.deletedAt = date;
    }
    if (dto.deletedReason !== undefined) {
      client.deletedReason = dto.deletedReason?.trim() || null;
    }
    return this.clientsRepo.save(client);
  }

  // "Eliminar una baja" = deshacerla: el cliente vuelve a estar vigente. No
  // borra nada (ni el cliente ni su historial de cobros), solo limpia la marca
  // de soft delete y el motivo.
  async removeBaja(clientId: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (!client.deletedAt) return;
    client.deletedAt = null;
    client.deletedReason = null;
    await this.clientsRepo.save(client);
  }

  // Borrado definitivo, para clientes mal cargados o que nunca terminaron
  // entrando. A diferencia del soft delete, esto sí borra la fila y arrastra
  // en cascada (a nivel base) su Cobro con todo el historial de pagos y sus
  // To Do, sin vuelta atrás. Por eso solo se permite sobre clientes que ya
  // están dados de baja: nunca se salta directo de "cliente vigente" a borrado.
  async deleteClientPermanently(clientId: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (!client.deletedAt) {
      throw new BadRequestException('Solo se puede eliminar definitivamente un cliente dado de baja');
    }
    await this.clientsRepo.delete({ id: client.id });
  }

  // --- Ficha extendida: notas / estado / link (antes en localStorage) ---

  async updateExtras(clientId: string, dto: UpdateClientExtrasDto, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (dto.notes !== undefined) client.notes = dto.notes;
    if (dto.statusOverride !== undefined) client.statusOverride = dto.statusOverride;
    if (dto.linkOverride !== undefined) client.linkOverride = dto.linkOverride;
    return this.clientsRepo.save(client);
  }

  // --- To Do del cliente ---

  async addTodo(clientId: string, dto: CreateTodoDto, user: AuthUser) {
    await this.findOwnedClient(clientId, user);
    const todo = this.clientTodosRepo.create({ clientId, text: dto.text.trim() });
    return this.clientTodosRepo.save(todo);
  }

  async updateTodo(clientId: string, todoId: string, dto: UpdateTodoDto, user: AuthUser) {
    await this.findOwnedClient(clientId, user);
    const todo = await this.clientTodosRepo.findOne({ where: { id: todoId, clientId } });
    if (!todo) throw new NotFoundException('Tarea no encontrada');
    if (dto.done !== undefined) todo.done = dto.done;
    if (dto.text !== undefined) todo.text = dto.text.trim();
    return this.clientTodosRepo.save(todo);
  }

  async deleteTodo(clientId: string, todoId: string, user: AuthUser) {
    await this.findOwnedClient(clientId, user);
    const todo = await this.clientTodosRepo.findOne({ where: { id: todoId, clientId } });
    if (!todo) throw new NotFoundException('Tarea no encontrada');
    await this.clientTodosRepo.remove(todo);
  }

  // Ejecutivos can only ever create clients under their own executiveId.
  // Admins must pick a target executiveId, since they aren't tied to one
  // themselves.
  async createClient(dto: CreateClientDto, user: AuthUser) {
    let executiveId: string;
    if (user.role === 'admin') {
      if (!dto.executiveId) {
        throw new ForbiddenException('Tenés que elegir un ejecutivo para el cliente');
      }
      executiveId = dto.executiveId;
    } else {
      if (!user.executiveId) {
        throw new ForbiddenException('Tu usuario no está asociado a un ejecutivo');
      }
      executiveId = user.executiveId;
    }

    const client = this.clientsRepo.create({
      executiveId,
      name: dto.name,
      fanpage: dto.fanpage ?? null,
      plan: dto.plan ?? null,
      country: dto.country ?? null,
      sexo: dto.sexo ?? null,
      edad: dto.edad ?? null,
      collectedBy: dto.collectedBy ?? null,
      rubro: dto.rubro ?? null,
      iva: dto.iva ?? null,
      active: dto.active,
      contactDay: dto.contactDay ?? null,
      data: dto.data ?? {},
    });
    const saved = await this.clientsRepo.save(client);

    // Si el form eligió un plan del desplegable, se crea el cobro asociado
    // apuntando a ese plan de configuración.
    if (dto.planId != null) {
      await this.cobrosRepo.save(
        this.cobrosRepo.create({ clientId: saved.id, planId: dto.planId }),
      );
    }

    return saved;
  }
}
